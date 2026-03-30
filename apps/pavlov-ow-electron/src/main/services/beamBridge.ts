import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { BeamStatus, GazeSample } from "../../shared/models/types";

// koffi does not currently provide robust static typings for this usage.
const koffi = require("koffi");

const TARGET_FPS = 30;
const TARGET_INTERVAL_MS = Math.round(1000 / TARGET_FPS);
const STATUS_CHECK_INTERVAL_MS = 2000;
const AUTO_START_INTERVAL_MS = 5000;

const LOST_TRACKING = 0;
const RECEIVING_TRACKING = 1;
const ATTEMPTING_AUTO_START = 2;

const VIEWPORT_GAZE_CONFIDENCE_OFFSET = 104;
const VIEWPORT_GAZE_X_OFFSET = 112;
const VIEWPORT_GAZE_Y_OFFSET = 116;

type BeamApi = {
  Create: (...args: any[]) => number;
  Destroy: (...args: any[]) => void;
  GetVersion: (...args: any[]) => void;
  AttemptStarting: (...args: any[]) => void;
  WaitForNew: (...args: any[]) => boolean;
  GetStatus: (...args: any[]) => number;
  CreateStateSet: (...args: any[]) => number;
  DestroyStateSet: (...args: any[]) => void;
  GetUserState: (...args: any[]) => Buffer | null;
};

export class BeamBridge extends EventEmitter {
  private lib: any | null = null;
  private api: BeamApi | null = null;
  private apiHandle: any | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastTimestamp = new Float64Array([0.0]);
  private lastStatus: BeamStatus | null = null;
  private lastAutoStart = 0;
  private lastStatusCheck = 0;

  start(
    screenWidth: number,
    screenHeight: number,
    appPath: string,
    execPath: string
  ): boolean {
    const dllPath = findDll(appPath, execPath);
    if (!dllPath) {
      this.emitStatus("not_installed");
      this.emit("error", "Beam Eye Tracker SDK was not found.");
      return false;
    }

    const EW_BET_Point = koffi.struct("EW_BET_Point", {
      x: "int32",
      y: "int32"
    });
    const EW_BET_ViewportGeometry = koffi.struct("EW_BET_ViewportGeometry", {
      point_00: EW_BET_Point,
      point_11: EW_BET_Point
    });
    const EW_BET_Version = koffi.struct("EW_BET_Version", {
      major: "uint32",
      minor: "uint32",
      patch: "uint32",
      build: "uint32"
    });

    this.lib = koffi.load(dllPath);
    this.api = {
      Create: this.lib.func(
        "int32 EW_BET_API_Create(const char*, EW_BET_ViewportGeometry, _Out_ void**)"
      ),
      Destroy: this.lib.func("void EW_BET_API_Destroy(void*)"),
      GetVersion: this.lib.func("void EW_BET_API_GetVersion(void*, _Out_ EW_BET_Version*)"),
      AttemptStarting: this.lib.func(
        "void EW_BET_API_AttemptStartingTheBeamEyeTracker(void*)"
      ),
      WaitForNew: this.lib.func(
        "bool EW_BET_API_WaitForNewTrackingStateSet(void*, _Inout_ double*, uint32)"
      ),
      GetStatus: this.lib.func("int32 EW_BET_API_GetTrackingDataReceptionStatus(void*)"),
      CreateStateSet: this.lib.func(
        "int32 EW_BET_API_CreateAndFillLatestTrackingStateSet(void*, _Out_ void**)"
      ),
      DestroyStateSet: this.lib.func("void EW_BET_API_DestroyTrackingStateSet(void*)"),
      GetUserState: this.lib.func("void* EW_BET_API_GetUserState(void*)")
    };

    const viewport = {
      point_00: { x: 0, y: 0 },
      point_11: { x: screenWidth, y: screenHeight }
    };
    const handleOut = [null];
    const createResult = this.api.Create("Pavlov", viewport, handleOut);
    if (createResult !== 0 || !handleOut[0]) {
      this.emit("error", `EW_BET_API_Create failed (${createResult}).`);
      this.emitStatus("not_running");
      return false;
    }
    this.apiHandle = handleOut[0];

    const version = {};
    this.api.GetVersion(this.apiHandle, version as any as typeof EW_BET_Version);

    this.emitStatus("connecting");
    this.api.AttemptStarting(this.apiHandle);
    this.lastAutoStart = Date.now();
    this.pollInterval = setInterval(() => this.poll(), TARGET_INTERVAL_MS);
    return true;
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.api && this.apiHandle) {
      try {
        this.api.Destroy(this.apiHandle);
      } catch (error) {
        this.emit("error", String(error));
      }
    }

    this.apiHandle = null;
  }

  private emitStatus(status: BeamStatus): void {
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.emit("status", status);
    }
  }

  private poll(): void {
    if (!this.api || !this.apiHandle) {
      return;
    }

    const now = Date.now();
    if (now - this.lastStatusCheck >= STATUS_CHECK_INTERVAL_MS) {
      this.lastStatusCheck = now;

      const rawStatus = this.api.GetStatus(this.apiHandle);
      const mappedStatus: BeamStatus =
        rawStatus === RECEIVING_TRACKING
          ? "tracking"
          : rawStatus === ATTEMPTING_AUTO_START
            ? "connecting"
            : "not_running";
      this.emitStatus(mappedStatus);

      if (
        mappedStatus !== "tracking" &&
        now - this.lastAutoStart >= AUTO_START_INTERVAL_MS
      ) {
        this.api.AttemptStarting(this.apiHandle);
        this.lastAutoStart = now;
      }
    }

    const tsArray = [this.lastTimestamp[0]];
    const hasNew = this.api.WaitForNew(this.apiHandle, tsArray, 10);
    this.lastTimestamp[0] = tsArray[0];
    if (!hasNew) {
      return;
    }

    const stateSetOut = [null];
    const stateSetResult = this.api.CreateStateSet(this.apiHandle, stateSetOut);
    if (stateSetResult !== 0 || !stateSetOut[0]) {
      return;
    }

    const stateSet = stateSetOut[0];
    try {
      const userStatePtr = this.api.GetUserState(stateSet);
      if (!userStatePtr) {
        return;
      }

      const confidence = koffi.decode(
        userStatePtr,
        VIEWPORT_GAZE_CONFIDENCE_OFFSET,
        "int32"
      );
      const isTracking = confidence !== LOST_TRACKING;

      if (!isTracking) {
        this.emit("gaze", {
          x: 0,
          y: 0,
          confidence,
          timestamp: Date.now() / 1000,
          isTracking: false
        } as GazeSample);
        return;
      }

      this.emit("gaze", {
        x: koffi.decode(userStatePtr, VIEWPORT_GAZE_X_OFFSET, "float"),
        y: koffi.decode(userStatePtr, VIEWPORT_GAZE_Y_OFFSET, "float"),
        confidence,
        timestamp: Date.now() / 1000,
        isTracking: true
      } as GazeSample);
    } finally {
      this.api.DestroyStateSet(stateSet);
    }
  }
}

function findDll(appPath: string, execPath: string): string | null {
  const dllName = "beam_eye_tracker_client.dll";
  const candidates = [
    path.join(path.dirname(execPath), dllName),
    path.join(path.dirname(execPath), "bin", dllName),
    path.join(appPath, dllName),
    path.join(appPath, "bin", dllName),
    path.join(appPath, "sdk", "bin", "win64", dllName),
    path.join("C:\\Program Files\\Eyeware\\BeamEyeTracker", dllName)
  ];

  try {
    const entries = fs.readdirSync(appPath);
    for (const entry of entries) {
      if (entry.startsWith("beam_eye_tracker_sdk")) {
        candidates.push(path.join(appPath, entry, "bin", "win64", dllName));
      }
    }
  } catch {
    // no-op
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
