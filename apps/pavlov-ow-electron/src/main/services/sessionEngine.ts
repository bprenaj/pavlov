import { EventEmitter } from "node:events";
import { computeMas } from "../../shared/metrics/mas";
import {
  regionContainsPoint,
  normalizedToScreenPoint
} from "../../shared/minimap/region";
import type {
  AppSettings,
  BeamStatus,
  CoachingMode,
  CoachingState,
  EntitlementTier,
  GazeSample,
  SessionRecord
} from "../../shared/models/types";

type SessionStats = {
  sessionStartMs: number;
  lastRegionHitMs: number;
  glanceCount: number;
  activeGlanceStartMs: number | null;
  gazeDurationsMs: number[];
  gapDurationsMs: number[];
  longestGapMs: number;
  totalMapLookMs: number;
  alertsTriggered: number;
  alertFreeStreakMs: number;
  currentAlertFreeStartMs: number;
  inAlert: boolean;
};

export class SessionEngine extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private settings: AppSettings;
  private beamStatus: BeamStatus = "not_running";
  private entitlement: EntitlementTier = "free";
  private mode: CoachingMode = "free";
  private isTraining = false;
  private alertActive = false;
  private activeSession: SessionStats | null = null;

  constructor(
    settings: AppSettings,
    private readonly screenWidth: number,
    private readonly screenHeight: number
  ) {
    super();
    this.settings = settings;
  }

  setEntitlement(next: EntitlementTier): void {
    this.entitlement = next;
    this.emitState("Subscription tier updated.");
  }

  setBeamStatus(status: BeamStatus): void {
    this.beamStatus = status;
    this.emitState(
      this.isTraining ? "Training active." : "Ready. Select a region and start."
    );
  }

  updateSettings(next: AppSettings): void {
    this.settings = next;
    this.emitState("Settings updated.");
  }

  start(mode: CoachingMode): void {
    const paidAllowed = this.entitlement === "paid" || this.entitlement === "trial";
    this.mode = mode === "paid" && paidAllowed ? "paid" : "free";
    this.isTraining = true;
    this.alertActive = false;
    this.activeSession = this.createSession();

    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.tick(), 100);

    this.emitState(
      this.mode === "paid"
        ? "Beam Eye Tracker training active."
        : "Timer training active."
    );
  }

  stop(): SessionRecord | null {
    this.isTraining = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const session = this.activeSession;
    this.activeSession = null;
    this.alertActive = false;

    if (!session) {
      this.emitState("Training stopped.");
      return null;
    }

    if (session.activeGlanceStartMs) {
      const duration = Date.now() - session.activeGlanceStartMs;
      session.gazeDurationsMs.push(duration);
      session.totalMapLookMs += duration;
      session.activeGlanceStartMs = null;
    }

    const record = this.buildRecord(session);
    this.emit("sessionComplete", record);
    this.emitState("Training stopped.");
    return record;
  }

  markManualGlance(): void {
    if (!this.activeSession) {
      return;
    }
    const now = Date.now();
    const gap = now - this.activeSession.lastRegionHitMs;
    this.activeSession.lastRegionHitMs = now;
    this.activeSession.glanceCount += 1;
    this.activeSession.gazeDurationsMs.push(250);
    this.activeSession.gapDurationsMs.push(gap);
    this.activeSession.longestGapMs = Math.max(this.activeSession.longestGapMs, gap);
    this.updateAlert(false);
    this.emitState("Minimap check recorded.");
  }

  onGaze(gaze: GazeSample): void {
    if (!this.isTraining || this.mode !== "paid" || !this.activeSession) {
      return;
    }
    if (!gaze.isTracking) {
      return;
    }

    const point =
      gaze.x <= 1 && gaze.y <= 1
        ? normalizedToScreenPoint(gaze.x, gaze.y, this.screenWidth, this.screenHeight)
        : { x: gaze.x, y: gaze.y };

    const onMap = regionContainsPoint(
      this.settings.minimapRect,
      point.x,
      point.y,
      this.settings.gazeTolerance
    );
    const now = Date.now();
    const session = this.activeSession;

    if (onMap) {
      const previousHit = session.lastRegionHitMs;
      session.lastRegionHitMs = now;
      if (!session.activeGlanceStartMs) {
        session.activeGlanceStartMs = now;
        session.glanceCount += 1;

        if (session.gapDurationsMs.length === 0) {
          const firstGap = now - session.sessionStartMs;
          session.gapDurationsMs.push(firstGap);
          session.longestGapMs = Math.max(session.longestGapMs, firstGap);
        } else {
          const previousGap = now - previousHit;
          session.gapDurationsMs.push(previousGap);
          session.longestGapMs = Math.max(session.longestGapMs, previousGap);
        }
      }
      this.updateAlert(false);
    } else if (session.activeGlanceStartMs) {
      const duration = now - session.activeGlanceStartMs;
      session.gazeDurationsMs.push(duration);
      session.totalMapLookMs += duration;
      session.activeGlanceStartMs = null;
    }
  }

  private tick(): void {
    if (!this.isTraining || !this.activeSession) {
      return;
    }

    const now = Date.now();
    const timeoutMs = this.settings.timeoutSeconds * 1000;
    const elapsed = now - this.activeSession.lastRegionHitMs;

    if (this.mode === "free") {
      if (elapsed >= timeoutMs) {
        this.activeSession.lastRegionHitMs = now;
        this.updateAlert(true);
        setTimeout(() => this.updateAlert(false), 700);
      }
    } else {
      this.updateAlert(elapsed >= timeoutMs);
    }

    this.emitState("Training active.");
  }

  private updateAlert(next: boolean): void {
    if (!this.activeSession) {
      return;
    }
    if (next === this.alertActive) {
      return;
    }
    this.alertActive = next;
    const now = Date.now();

    if (next) {
      this.activeSession.alertsTriggered += 1;
      this.activeSession.inAlert = true;
      const streak = now - this.activeSession.currentAlertFreeStartMs;
      this.activeSession.alertFreeStreakMs = Math.max(
        this.activeSession.alertFreeStreakMs,
        streak
      );
      this.emit("alert", true);
      return;
    }

    this.activeSession.inAlert = false;
    this.activeSession.currentAlertFreeStartMs = now;
    this.emit("alert", false);
  }

  private emitState(statusLine: string): void {
    const timeoutMs = this.settings.timeoutSeconds * 1000;
    const session = this.activeSession;
    const elapsed = session ? Date.now() - session.lastRegionHitMs : 0;
    const nextState: CoachingState = {
      mode: this.mode,
      entitlement: this.entitlement,
      beamStatus: this.beamStatus,
      isTraining: this.isTraining,
      alertActive: this.alertActive,
      statusLine,
      remainingToAlertMs: Math.max(0, timeoutMs - elapsed)
    };
    this.emit("state", nextState);
  }

  private createSession(): SessionStats {
    const now = Date.now();
    return {
      sessionStartMs: now,
      lastRegionHitMs: now,
      glanceCount: 0,
      activeGlanceStartMs: null,
      gazeDurationsMs: [],
      gapDurationsMs: [],
      longestGapMs: 0,
      totalMapLookMs: 0,
      alertsTriggered: 0,
      alertFreeStreakMs: 0,
      currentAlertFreeStartMs: now,
      inAlert: false
    };
  }

  private buildRecord(session: SessionStats): SessionRecord {
    const now = Date.now();
    const durationMs = Math.max(1, now - session.sessionStartMs);
    const durationSeconds = durationMs / 1000;
    const glancesPerMinute = session.glanceCount / (durationSeconds / 60);
    const avgDuration = average(session.gazeDurationsMs);
    const avgGap = average(session.gapDurationsMs) / 1000;
    const stdGap = stddev(session.gapDurationsMs.map((ms) => ms / 1000));
    const timeOnMapPct = (session.totalMapLookMs / durationMs) * 100;
    const masScore = computeMas({
      glancesPerMin: glancesPerMinute,
      averageGapSeconds: avgGap,
      averageGlanceDurationMs: avgDuration,
      gapStdDevSeconds: stdGap
    });

    return {
      timestamp: now / 1000,
      duration_s: durationSeconds,
      glance_count: session.glanceCount,
      glances_per_min: glancesPerMinute,
      avg_glance_duration_ms: avgDuration,
      avg_gap_s: avgGap,
      longest_gap_s: session.longestGapMs / 1000,
      alerts_triggered: session.alertsTriggered,
      alert_free_streak_s: session.alertFreeStreakMs / 1000,
      time_on_map_pct: timeOnMapPct,
      mas_score: masScore,
      region_name: this.settings.regionName,
      mode: this.mode
    };
  }
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) /
    values.length;
  return Math.sqrt(variance);
}
