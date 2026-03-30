export {}

interface AlertMode {
  audio: boolean;
  visual: boolean;
}

interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AppSettings {
  timeoutSeconds: number;
  volume: number;
  gazeTolerance: number;
  alertMode: AlertMode;
  minimapRect: MinimapRect;
  regionName: string;
  customSoundPath: string;
  disableAnonymousAnalytics: boolean;
  firstRun: boolean;
}

interface SessionRecord {
  timestamp: number;
  duration_s: number;
  glance_count: number;
  glances_per_min: number;
  avg_glance_duration_ms: number;
  avg_gap_s: number;
  longest_gap_s: number;
  alerts_triggered: number;
  alert_free_streak_s: number;
  time_on_map_pct: number;
  mas_score: number;
  region_name: string;
  mode: "free" | "paid";
}

interface CoachingState {
  mode: "free" | "paid";
  entitlement: "free" | "trial" | "paid";
  beamStatus: string;
  isTraining: boolean;
  alertActive: boolean;
  statusLine: string;
  remainingToAlertMs: number;
}

interface PavlovApi {
  getBootstrap: () => Promise<{
    settings: AppSettings;
    sessions: SessionRecord[];
    entitlement: "free" | "trial" | "paid";
    isOverwolfRuntime: boolean;
    overwolfInfo: { appId: string } | null;
    cmpRequired: boolean;
  }>;
  patchSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  startTraining: (
    mode: "free" | "paid"
  ) => Promise<{ ok: boolean; reason?: string }>;
  stopTraining: () => Promise<SessionRecord | null>;
  setEntitlement: (tier: "free" | "trial" | "paid") => Promise<string>;
  pickCustomSound: () => Promise<string>;
  openRegionOverlay: () => Promise<MinimapRect | null>;
  windowMinimize: () => Promise<void>;
  windowToggleMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  checkCmpRequired: () => Promise<boolean>;
  openCmpWindow: () => Promise<boolean>;
  onState: (callback: (state: CoachingState) => void) => () => void;
  onBeamStatus: (callback: (status: string) => void) => () => void;
  onSessionComplete: (callback: (record: SessionRecord) => void) => () => void;
}

declare const Chart: any;

const elements = {
  navCoach: byId("navCoach"),
  navHistory: byId("navHistory"),
  navSettings: byId("navSettings"),
  pageCoach: byId("pageCoach"),
  pageHistory: byId("pageHistory"),
  pageSettings: byId("pageSettings"),
  beamStatusBadge: byId("beamStatusBadge"),
  modeStatusBadge: byId("modeStatusBadge"),
  entitlementBadge: byId("entitlementBadge"),
  minBtn: byId("minBtn"),
  maxBtn: byId("maxBtn"),
  closeBtn: byId("closeBtn"),
  regionGate: byId("regionGate"),
  regionSelectPrimary: byId("regionSelectPrimary"),
  regionSummary: byId("regionSummary"),
  selectRegionBtn: byId("selectRegionBtn"),
  timeoutInput: byId("timeoutInput") as HTMLInputElement,
  timeoutValue: byId("timeoutValue"),
  volumeInput: byId("volumeInput") as HTMLInputElement,
  volumeValue: byId("volumeValue"),
  toleranceInput: byId("toleranceInput") as HTMLInputElement,
  toleranceValue: byId("toleranceValue"),
  regionNameInput: byId("regionNameInput") as HTMLInputElement,
  silentBtn: byId("silentBtn"),
  visualBtn: byId("visualBtn"),
  audioBtn: byId("audioBtn"),
  freeModeBtn: byId("freeModeBtn"),
  paidModeBtn: byId("paidModeBtn"),
  startBtn: byId("startBtn") as HTMLButtonElement,
  customSoundBtn: byId("customSoundBtn"),
  customSoundClearBtn: byId("customSoundClearBtn"),
  customSoundLabel: byId("customSoundLabel"),
  cmpBtn: byId("cmpBtn"),
  entitlementSelect: byId("entitlementSelect") as HTMLSelectElement,
  analyticsToggle: byId("analyticsToggle") as HTMLInputElement,
  statusLine: byId("statusLine"),
  countdown: byId("countdown"),
  freeAdPanel: byId("freeAdPanel"),
  alarmAudio: byId("alarmAudio") as HTMLAudioElement,
  masScore: byId("masScore"),
  metricRate: byId("metricRate"),
  metricAvgGap: byId("metricAvgGap"),
  metricMapTime: byId("metricMapTime"),
  metricProcSpeed: byId("metricProcSpeed"),
  metricDuration: byId("metricDuration"),
  metricGlances: byId("metricGlances"),
  metricLongestGap: byId("metricLongestGap"),
  metricAlerts: byId("metricAlerts"),
  metricAlertFree: byId("metricAlertFree"),
  historyChart: byId("historyChart") as HTMLCanvasElement,
  onboardingModal: byId("onboardingModal"),
  dontShowOnboarding: byId("dontShowOnboarding") as HTMLInputElement,
  onboardingStartBtn: byId("onboardingStartBtn")
};

const pavlovApi: PavlovApi = (window as unknown as { pavlovApi: PavlovApi })
  .pavlovApi;

let selectedMode: "free" | "paid" = "free";
let entitlement: "free" | "trial" | "paid" = "free";
let sessions: SessionRecord[] = [];
let currentSettings: AppSettings;
let isTraining = false;
let isOverwolfRuntime = false;
let chart: any;

void initialize();

async function initialize() {
  const bootstrap = await pavlovApi.getBootstrap();
  sessions = bootstrap.sessions;
  entitlement = bootstrap.entitlement;
  currentSettings = bootstrap.settings;
  isOverwolfRuntime = bootstrap.isOverwolfRuntime;

  hydrateInputs(currentSettings);
  elements.entitlementSelect.value = entitlement;
  elements.analyticsToggle.checked = currentSettings.disableAnonymousAnalytics;

  updateModeButtons();
  updateEntitlementBadge();
  updateAdVisibility();
  updateRegionUi();
  updateStartButton();
  updateMetricRows();
  renderChart();

  if (currentSettings.customSoundPath) {
    setAudioSource(currentSettings.customSoundPath);
    elements.customSoundLabel.textContent = shortenFileName(
      currentSettings.customSoundPath
    );
    elements.customSoundClearBtn.style.visibility = "visible";
  } else {
    elements.customSoundClearBtn.style.visibility = "hidden";
  }

  if (bootstrap.cmpRequired) {
    elements.statusLine.textContent =
      "Ads and privacy consent is required in your region for monetized runtime.";
  }
  if (!isOverwolfRuntime) {
    elements.cmpBtn.setAttribute(
      "title",
      "Only available while running in ow-electron runtime"
    );
  }
  if (currentSettings.firstRun) {
    elements.onboardingModal.classList.remove("hidden");
  }

  pavlovApi.onState((state) => {
    isTraining = state.isTraining;
    selectedMode = state.mode;
    updateModeButtons();
    updateStartButton();
    elements.modeStatusBadge.textContent =
      state.mode === "paid" ? "Mode: Beam Eye Tracker" : "Mode: Free";
    elements.statusLine.textContent = state.statusLine;
    elements.countdown.textContent = formatMs(state.remainingToAlertMs);

    if (state.alertActive) {
      if (currentSettings.alertMode.visual) {
        document.body.classList.add("alert-active");
      }
      if (currentSettings.alertMode.audio) {
        playAlarm();
      }
    } else {
      document.body.classList.remove("alert-active");
    }
  });

  pavlovApi.onBeamStatus((status) => {
    elements.beamStatusBadge.textContent = `Beam Eye Tracker: ${humanBeamStatus(status)}`;
  });

  pavlovApi.onSessionComplete((record) => {
    sessions.push(record);
    updateMetricRows();
    renderChart();
  });

  bindEvents();
}

function bindEvents() {
  elements.navCoach.addEventListener("click", () => setPage("coach"));
  elements.navHistory.addEventListener("click", () => setPage("history"));
  elements.navSettings.addEventListener("click", () => setPage("settings"));

  elements.minBtn.addEventListener("click", () => {
    void pavlovApi.windowMinimize();
  });
  elements.maxBtn.addEventListener("click", () => {
    void pavlovApi.windowToggleMaximize();
  });
  elements.closeBtn.addEventListener("click", () => {
    void pavlovApi.windowClose();
  });

  elements.regionSelectPrimary.addEventListener("click", () => {
    void openRegionOverlay();
  });
  elements.selectRegionBtn.addEventListener("click", () => {
    void openRegionOverlay();
  });

  elements.freeModeBtn.addEventListener("click", () => {
    selectedMode = "free";
    updateModeButtons();
  });
  elements.paidModeBtn.addEventListener("click", () => {
    selectedMode = "paid";
    updateModeButtons();
  });

  elements.startBtn.addEventListener("click", async () => {
    if (isTraining) {
      const record = await pavlovApi.stopTraining();
      if (record) {
        sessions.push(record);
        updateMetricRows();
        renderChart();
      }
      return;
    }

    await persistFormSettings();
    const result = await pavlovApi.startTraining(selectedMode);
    if (!result.ok && result.reason === "region_required") {
      elements.statusLine.textContent =
        "Select a region on screen and enter a region name before starting.";
      return;
    }
    if (!result.ok && result.reason === "paid_locked") {
      elements.statusLine.textContent =
        "Subscription required for Beam Eye Tracker mode.";
      return;
    }
    elements.statusLine.textContent = "Training started.";
  });

  elements.timeoutInput.addEventListener("input", () => {
    syncSettingsFromInputs();
    updateSliderLabels();
    void persistFormSettings();
  });
  elements.volumeInput.addEventListener("input", () => {
    syncSettingsFromInputs();
    updateSliderLabels();
    void persistFormSettings();
  });
  elements.toleranceInput.addEventListener("input", () => {
    syncSettingsFromInputs();
    updateSliderLabels();
    void persistFormSettings();
  });
  elements.regionNameInput.addEventListener("input", () => {
    syncSettingsFromInputs();
    updateRegionUi();
    updateStartButton();
    void persistFormSettings();
  });

  elements.silentBtn.addEventListener("click", async () => {
    currentSettings.alertMode = { audio: false, visual: false };
    updateAlertTypeButtons();
    await persistFormSettings();
  });
  elements.visualBtn.addEventListener("click", async () => {
    currentSettings.alertMode.visual = !currentSettings.alertMode.visual;
    if (!currentSettings.alertMode.visual && !currentSettings.alertMode.audio) {
      currentSettings.alertMode.audio = true;
    }
    updateAlertTypeButtons();
    await persistFormSettings();
  });
  elements.audioBtn.addEventListener("click", async () => {
    currentSettings.alertMode.audio = !currentSettings.alertMode.audio;
    if (!currentSettings.alertMode.visual && !currentSettings.alertMode.audio) {
      currentSettings.alertMode.visual = true;
    }
    updateAlertTypeButtons();
    await persistFormSettings();
  });

  elements.customSoundBtn.addEventListener("click", async () => {
    const selected = await pavlovApi.pickCustomSound();
    if (!selected) {
      return;
    }
    currentSettings.customSoundPath = selected;
    setAudioSource(selected);
    elements.customSoundLabel.textContent = shortenFileName(selected);
    elements.customSoundClearBtn.style.visibility = "visible";
  });

  elements.customSoundClearBtn.addEventListener("click", async () => {
    currentSettings = await pavlovApi.patchSettings({ customSoundPath: "" });
    elements.customSoundLabel.textContent = "Default alert sound";
    elements.customSoundClearBtn.style.visibility = "hidden";
    elements.alarmAudio.removeAttribute("src");
  });

  elements.entitlementSelect.addEventListener("change", async () => {
    entitlement = elements.entitlementSelect.value as "free" | "trial" | "paid";
    await pavlovApi.setEntitlement(entitlement);
    updateEntitlementBadge();
    updateAdVisibility();
  });

  elements.analyticsToggle.addEventListener("change", () => {
    currentSettings.disableAnonymousAnalytics = elements.analyticsToggle.checked;
    void persistFormSettings();
  });

  elements.cmpBtn.addEventListener("click", async () => {
    if (!isOverwolfRuntime) {
      elements.statusLine.textContent =
        "Consent dialog is available only in ow-electron runtime.";
      return;
    }
    const needed = await pavlovApi.checkCmpRequired();
    if (!needed) {
      elements.statusLine.textContent = "Consent dialog not required in your region.";
      return;
    }
    await pavlovApi.openCmpWindow();
    elements.statusLine.textContent = "Consent dialog opened.";
  });

  elements.onboardingStartBtn.addEventListener("click", async () => {
    if (elements.dontShowOnboarding.checked) {
      currentSettings = await pavlovApi.patchSettings({ firstRun: false });
    }
    elements.onboardingModal.classList.add("hidden");
  });
}

async function openRegionOverlay() {
  const rect = await pavlovApi.openRegionOverlay();
  if (!rect) {
    return;
  }
  currentSettings.minimapRect = rect;
  updateRegionUi();
  updateStartButton();
}

function hydrateInputs(settings: AppSettings) {
  elements.timeoutInput.value = String(settings.timeoutSeconds);
  elements.volumeInput.value = String(settings.volume);
  elements.toleranceInput.value = String(settings.gazeTolerance);
  elements.regionNameInput.value = settings.regionName;
  elements.alarmAudio.volume = settings.volume / 100;
  updateSliderLabels();
  updateAlertTypeButtons();
}

async function persistFormSettings() {
  syncSettingsFromInputs();
  currentSettings = await pavlovApi.patchSettings({
    timeoutSeconds: currentSettings.timeoutSeconds,
    volume: currentSettings.volume,
    gazeTolerance: currentSettings.gazeTolerance,
    regionName: currentSettings.regionName,
    disableAnonymousAnalytics: currentSettings.disableAnonymousAnalytics,
    alertMode: currentSettings.alertMode
  });
  elements.alarmAudio.volume = currentSettings.volume / 100;
}

function syncSettingsFromInputs() {
  currentSettings.timeoutSeconds = Number(elements.timeoutInput.value);
  currentSettings.volume = Number(elements.volumeInput.value);
  currentSettings.gazeTolerance = Number(elements.toleranceInput.value);
  currentSettings.regionName = elements.regionNameInput.value.trim();
}

function updateSliderLabels() {
  elements.timeoutValue.textContent = `${Number(elements.timeoutInput.value).toFixed(1)} s`;
  elements.volumeValue.textContent = `${elements.volumeInput.value}%`;
  elements.toleranceValue.textContent = `${elements.toleranceInput.value}%`;
}

function updateAlertTypeButtons() {
  const silent = !currentSettings.alertMode.audio && !currentSettings.alertMode.visual;
  elements.silentBtn.classList.toggle("toggle-active", silent);
  elements.visualBtn.classList.toggle("toggle-active", currentSettings.alertMode.visual);
  elements.audioBtn.classList.toggle("toggle-active", currentSettings.alertMode.audio);
}

function updateRegionUi() {
  const hasRegion =
    currentSettings.minimapRect.width > 0 && currentSettings.minimapRect.height > 0;
  elements.regionGate.style.display = hasRegion ? "none" : "block";
  if (!hasRegion) {
    elements.regionSummary.textContent = "Region: not selected";
    return;
  }
  const rect = currentSettings.minimapRect;
  elements.regionSummary.textContent = `Region: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`;
}

function updateStartButton() {
  const hasRegion =
    currentSettings.minimapRect.width > 0 && currentSettings.minimapRect.height > 0;
  const hasName = currentSettings.regionName.trim().length > 0;
  const ready = hasRegion && hasName;

  if (isTraining) {
    elements.startBtn.textContent = "Stop Training";
    elements.startBtn.disabled = false;
    return;
  }

  if (!ready) {
    elements.startBtn.textContent = "Select a region on screen to begin";
    elements.startBtn.disabled = true;
    return;
  }

  elements.startBtn.textContent = "Start Training";
  elements.startBtn.disabled = false;
}

function updateModeButtons() {
  elements.freeModeBtn.classList.toggle("mode-active", selectedMode === "free");
  elements.paidModeBtn.classList.toggle("mode-active", selectedMode === "paid");
}

function updateEntitlementBadge() {
  elements.entitlementBadge.textContent = `Tier: ${entitlement}`;
}

function updateAdVisibility() {
  elements.freeAdPanel.style.display = entitlement === "free" ? "block" : "none";
}

function setPage(page: "coach" | "history" | "settings") {
  elements.pageCoach.classList.toggle("page-active", page === "coach");
  elements.pageHistory.classList.toggle("page-active", page === "history");
  elements.pageSettings.classList.toggle("page-active", page === "settings");
  elements.navCoach.classList.toggle("nav-active", page === "coach");
  elements.navHistory.classList.toggle("nav-active", page === "history");
  elements.navSettings.classList.toggle("nav-active", page === "settings");
}

function renderChart() {
  const context = elements.historyChart.getContext("2d");
  if (!context) {
    return;
  }
  if (chart) {
    chart.destroy();
  }

  const labels = sessions.map((session) =>
    new Date(session.timestamp * 1000).toLocaleDateString()
  );
  chart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets: [
        dataset("Pavlov Score", sessions.map((r) => r.mas_score), "#7fd9ff", 2, false),
        dataset("Check rate", sessions.map((r) => r.glances_per_min), "#ff617c", 1.2, false),
        dataset("Response time", sessions.map((r) => r.avg_gap_s), "#ff61bd", 1.2, false),
        dataset("Map attention", sessions.map((r) => r.time_on_map_pct), "#61cbff", 1.2, false),
        dataset(
          "Processing speed",
          sessions.map((r) => r.avg_glance_duration_ms),
          "#bd61ff",
          1.2,
          false
        ),
        dataset("Session duration", sessions.map((r) => r.duration_s), "#6189ff", 1, true),
        dataset("Map glances", sessions.map((r) => r.glance_count), "#61fff1", 1, true),
        dataset(
          "Longest blind spot",
          sessions.map((r) => r.longest_gap_s),
          "#ff61ff",
          1,
          true
        ),
        dataset(
          "Tunnel vision episodes",
          sessions.map((r) => r.alerts_triggered),
          "#61ffb0",
          1,
          true
        ),
        dataset(
          "Best focus streak",
          sessions.map((r) => r.alert_free_streak_s),
          "#e5ff61",
          1,
          true
        )
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#cde2ff" }
        }
      },
      scales: {
        x: {
          ticks: { color: "#9bb6d5" },
          grid: { color: "rgba(78,114,152,0.12)" }
        },
        y: {
          ticks: { color: "#9bb6d5" },
          grid: { color: "rgba(78,114,152,0.24)" }
        }
      }
    }
  });
}

function updateMetricRows() {
  const last = sessions.at(-1);
  if (!last) {
    elements.masScore.textContent = "-";
    elements.metricRate.textContent = "-";
    elements.metricAvgGap.textContent = "-";
    elements.metricMapTime.textContent = "-";
    elements.metricProcSpeed.textContent = "-";
    elements.metricDuration.textContent = "-";
    elements.metricGlances.textContent = "-";
    elements.metricLongestGap.textContent = "-";
    elements.metricAlerts.textContent = "-";
    elements.metricAlertFree.textContent = "-";
    return;
  }
  elements.masScore.textContent = `${last.mas_score.toFixed(1)}`;
  elements.metricRate.textContent = `${last.glances_per_min.toFixed(1)} /min`;
  elements.metricAvgGap.textContent = `${last.avg_gap_s.toFixed(2)} s`;
  elements.metricMapTime.textContent = `${last.time_on_map_pct.toFixed(1)}%`;
  elements.metricProcSpeed.textContent = `${last.avg_glance_duration_ms.toFixed(0)} ms`;
  elements.metricDuration.textContent = formatDuration(last.duration_s);
  elements.metricGlances.textContent = `${last.glance_count}`;
  elements.metricLongestGap.textContent = `${last.longest_gap_s.toFixed(1)} s`;
  elements.metricAlerts.textContent = `${last.alerts_triggered}`;
  elements.metricAlertFree.textContent = `${last.alert_free_streak_s.toFixed(1)} s`;
}

function dataset(
  label: string,
  data: number[],
  color: string,
  width: number,
  hidden: boolean
) {
  return {
    label,
    data,
    borderColor: color,
    borderWidth: width,
    hidden,
    tension: 0.2
  };
}

function setAudioSource(filePath: string) {
  elements.alarmAudio.src = `file:///${filePath.replaceAll("\\", "/")}`;
}

function playAlarm() {
  elements.alarmAudio.currentTime = 0;
  void elements.alarmAudio.play().catch(() => {
    // Browser policy may block playback before user interaction.
  });
}

function humanBeamStatus(status: string): string {
  if (status === "tracking") {
    return "connected";
  }
  if (status === "connecting") {
    return "connecting...";
  }
  if (status === "not_running") {
    return "not running";
  }
  if (status === "not_installed") {
    return "SDK not found";
  }
  return status;
}

function shortenFileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  const name = parts[parts.length - 1] || filePath;
  if (name.length <= 24) {
    return name;
  }
  return `${name.slice(0, 22)}..`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function formatMs(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
