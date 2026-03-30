import * as path from 'path';
import * as fs from 'fs';
import {
  BEAM_POLL_INTERVAL_MS,
  BEAM_STATUS_CHECK_MS,
  BEAM_AUTO_START_MS,
  VIEWPORT_GAZE_CONFIDENCE_OFFSET,
  VIEWPORT_GAZE_X_OFFSET,
  VIEWPORT_GAZE_Y_OFFSET,
} from '../../shared/constants';
import type { BeamStatus } from '../../shared/constants';
import type { GazeData } from '../../shared/types';

const EW_BET_LOST_TRACKING = 0;
const EW_BET_RECEIVING_TRACKING_DATA = 1;
const EW_BET_ATTEMPTING_TRACKING_AUTO_START = 2;

type KoffiLib = ReturnType<typeof import('koffi')['load']>;

interface BeamApi {
  Create: (name: string, viewport: unknown, handleOut: unknown[]) => number;
  Destroy: (handle: unknown) => void;
  GetVersion: (handle: unknown, versionOut: unknown) => void;
  AttemptStarting: (handle: unknown) => void;
  WaitForNew: (handle: unknown, tsArr: number[], timeoutMs: number) => boolean;
  GetStatus: (handle: unknown) => number;
  CreateStateSet: (handle: unknown, stateSetOut: unknown[]) => number;
  DestroyStateSet: (stateSet: unknown) => void;
  GetUserState: (stateSet: unknown) => unknown;
}

function findDll(appPath: string, execPath: string): string | null {
  const dllName = 'beam_eye_tracker_client.dll';
  const candidates: string[] = [];

  if (execPath) {
    candidates.push(path.join(path.dirname(execPath), dllName));
    candidates.push(path.join(path.dirname(execPath), 'bin', dllName));
  }

  if (appPath) {
    candidates.push(path.join(appPath, dllName));
    candidates.push(path.join(appPath, 'bin', dllName));
    candidates.push(path.join(appPath, 'sdk', 'bin', 'win64', dllName));
    try {
      for (const entry of fs.readdirSync(appPath)) {
        if (entry.startsWith('beam_eye_tracker_sdk')) {
          candidates.push(path.join(appPath, entry, 'bin', 'win64', dllName));
        }
      }
    } catch { /* ignore */ }
  }

  // Check ancestor directories for the DLL (development convenience)
  let searchDir = appPath;
  for (let i = 0; i < 5; i++) {
    searchDir = path.dirname(searchDir);
    candidates.push(path.join(searchDir, dllName));
  }

  candidates.push(path.join('C:\\Program Files\\Eyeware\\BeamEyeTracker', dllName));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export class BeamBridge {
  private lib: KoffiLib | null = null;
  private api: Partial<BeamApi> = {};
  private apiHandle: unknown = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastTimestamp = 0;
  private lastStatus: BeamStatus | null = null;
  private lastAutoStart = 0;
  private lastStatusCheck = 0;

  onGaze: ((data: GazeData) => void) | null = null;
  onStatus: ((status: BeamStatus) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  getStatus(): BeamStatus {
    return this.lastStatus ?? 'not_running';
  }

  start(screenWidth: number, screenHeight: number, appPath: string, execPath: string): boolean {
    let koffi: typeof import('koffi');
    try {
      koffi = require('koffi');
    } catch {
      this.emitStatus('not_installed');
      this.emitError('koffi module not available');
      return false;
    }

    const dllPath = findDll(appPath, execPath);
    if (!dllPath) {
      this.emitStatus('not_installed');
      this.emitError(
        'beam_eye_tracker_client.dll not found. Install Beam Eye Tracker or place the DLL in the app directory.',
      );
      return false;
    }

    console.log(`[BeamBridge] Loading SDK from: ${dllPath}`);
    this.lib = koffi.load(dllPath);

    const EW_BET_Point = koffi.struct('EW_BET_Point', { x: 'int32', y: 'int32' });
    // Registered with koffi for use in function signatures (referenced by name, not variable)
    koffi.struct('EW_BET_ViewportGeometry', {
      point_00: EW_BET_Point,
      point_11: EW_BET_Point,
    });
    koffi.struct('EW_BET_Version', {
      major: 'uint32',
      minor: 'uint32',
      patch: 'uint32',
      build: 'uint32',
    });

    this.api = {
      Create: this.lib.func(
        'int32 EW_BET_API_Create(const char*, EW_BET_ViewportGeometry, _Out_ void**)',
      ),
      Destroy: this.lib.func('void EW_BET_API_Destroy(void*)'),
      GetVersion: this.lib.func('void EW_BET_API_GetVersion(void*, _Out_ EW_BET_Version*)'),
      AttemptStarting: this.lib.func(
        'void EW_BET_API_AttemptStartingTheBeamEyeTracker(void*)',
      ),
      WaitForNew: this.lib.func(
        'bool EW_BET_API_WaitForNewTrackingStateSet(void*, _Inout_ double*, uint32)',
      ),
      GetStatus: this.lib.func('int32 EW_BET_API_GetTrackingDataReceptionStatus(void*)'),
      CreateStateSet: this.lib.func(
        'int32 EW_BET_API_CreateAndFillLatestTrackingStateSet(void*, _Out_ void**)',
      ),
      DestroyStateSet: this.lib.func('void EW_BET_API_DestroyTrackingStateSet(void*)'),
      GetUserState: this.lib.func('void* EW_BET_API_GetUserState(void*)'),
    } as BeamApi;

    const viewport = {
      point_00: { x: 0, y: 0 },
      point_11: { x: screenWidth, y: screenHeight },
    };
    const handleOut: unknown[] = [null];
    const result = this.api.Create!('Pavlov', viewport, handleOut);
    if (result !== 0 || !handleOut[0]) {
      this.emitError(`EW_BET_API_Create failed with code ${result}`);
      return false;
    }
    this.apiHandle = handleOut[0];
    console.log(`[BeamBridge] API created for viewport ${screenWidth}x${screenHeight}`);

    const version: Record<string, number> = {};
    this.api.GetVersion!(this.apiHandle, version);
    console.log(
      `[BeamBridge] SDK version: ${version.major}.${version.minor}.${version.patch}.${version.build}`,
    );

    this.api.AttemptStarting!(this.apiHandle);
    this.lastAutoStart = Date.now();

    this.pollInterval = setInterval(() => this.poll(), BEAM_POLL_INTERVAL_MS);
    return true;
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.apiHandle && this.api.Destroy) {
      try {
        this.api.Destroy(this.apiHandle);
      } catch (e: unknown) {
        console.error('[BeamBridge] Destroy error:', (e as Error).message);
      }
      this.apiHandle = null;
    }
  }

  private emitStatus(status: BeamStatus): void {
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.onStatus?.(status);
    }
  }

  private emitError(message: string): void {
    console.error('[BeamBridge]', message);
    this.onError?.(message);
  }

  private poll(): void {
    if (!this.apiHandle) return;
    const now = Date.now();
    let koffi: typeof import('koffi');
    try {
      koffi = require('koffi');
    } catch {
      return;
    }

    if (now - this.lastStatusCheck >= BEAM_STATUS_CHECK_MS) {
      this.lastStatusCheck = now;
      try {
        const rawStatus = this.api.GetStatus!(this.apiHandle);
        const status: BeamStatus =
          rawStatus === EW_BET_RECEIVING_TRACKING_DATA
            ? 'tracking'
            : rawStatus === EW_BET_ATTEMPTING_TRACKING_AUTO_START
              ? 'connecting'
              : 'not_running';
        this.emitStatus(status);

        if (status !== 'tracking' && now - this.lastAutoStart >= BEAM_AUTO_START_MS) {
          this.api.AttemptStarting!(this.apiHandle);
          this.lastAutoStart = now;
        }
      } catch (e: unknown) {
        console.error('[BeamBridge] Status check error:', (e as Error).message);
      }
    }

    try {
      const tsArr = [this.lastTimestamp];
      const hasNew = this.api.WaitForNew!(this.apiHandle, tsArr, 10);
      this.lastTimestamp = tsArr[0];

      if (!hasNew) return;

      const stateSetOut: unknown[] = [null];
      const createResult = this.api.CreateStateSet!(this.apiHandle, stateSetOut);
      if (createResult !== 0 || !stateSetOut[0]) return;

      const stateSet = stateSetOut[0];
      try {
        const userStatePtr = this.api.GetUserState!(stateSet);
        if (!userStatePtr) return;

        const confidence = koffi.decode(
          userStatePtr,
          VIEWPORT_GAZE_CONFIDENCE_OFFSET,
          'int32',
        );
        const isTracking = confidence !== EW_BET_LOST_TRACKING;

        if (this.onGaze) {
          if (!isTracking) {
            this.onGaze({ x: 0, y: 0, isTracking: false });
          } else {
            this.onGaze({
              x: koffi.decode(userStatePtr, VIEWPORT_GAZE_X_OFFSET, 'float') as number,
              y: koffi.decode(userStatePtr, VIEWPORT_GAZE_Y_OFFSET, 'float') as number,
              isTracking: true,
            });
          }
        }
      } finally {
        this.api.DestroyStateSet!(stateSet);
      }
    } catch (e: unknown) {
      console.error('[BeamBridge] Poll error:', (e as Error).message);
    }
  }
}
