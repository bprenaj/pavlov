import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type EntitlementTier,
  type SessionRecord
} from "../../shared/models/types";
import {
  appSettingsSchema,
  sessionRecordSchema
} from "../../shared/models/schemas";

interface MetaState {
  entitlement: EntitlementTier;
  hasMigratedLegacyData: boolean;
}

const DEFAULT_META: MetaState = {
  entitlement: "free",
  hasMigratedLegacyData: false
};

export class AppStoreService {
  private readonly settingsPath: string;
  private readonly sessionsPath: string;
  private readonly metaPath: string;

  constructor(private readonly baseDir: string) {
    this.settingsPath = path.join(baseDir, "settings.json");
    this.sessionsPath = path.join(baseDir, "sessions.json");
    this.metaPath = path.join(baseDir, "meta.json");
  }

  async loadSettings(): Promise<AppSettings> {
    const fromDisk = await this.readJson<AppSettings>(this.settingsPath);
    if (!fromDisk) {
      return DEFAULT_SETTINGS;
    }
    const parsed = appSettingsSchema.safeParse(fromDisk);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  }

  async saveSettings(next: AppSettings): Promise<void> {
    appSettingsSchema.parse(next);
    await this.ensureDir();
    await writeFile(this.settingsPath, JSON.stringify(next, null, 2), "utf8");
  }

  async patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.loadSettings();
    const next: AppSettings = {
      ...current,
      ...patch,
      alertMode: {
        ...current.alertMode,
        ...patch.alertMode
      },
      minimapRect: {
        ...current.minimapRect,
        ...patch.minimapRect
      }
    };
    await this.saveSettings(next);
    return next;
  }

  async loadSessions(): Promise<SessionRecord[]> {
    const fromDisk = await this.readJson<SessionRecord[]>(this.sessionsPath);
    if (!Array.isArray(fromDisk)) {
      return [];
    }
    return fromDisk
      .map((entry) => sessionRecordSchema.safeParse(entry))
      .filter((entry) => entry.success)
      .map((entry) => entry.data);
  }

  async appendSession(record: SessionRecord): Promise<void> {
    const sessions = await this.loadSessions();
    sessions.push(record);
    await this.ensureDir();
    await writeFile(this.sessionsPath, JSON.stringify(sessions, null, 2), "utf8");
  }

  async getMeta(): Promise<MetaState> {
    const fromDisk = await this.readJson<MetaState>(this.metaPath);
    if (!fromDisk) {
      return DEFAULT_META;
    }
    return {
      entitlement:
        fromDisk.entitlement === "trial" || fromDisk.entitlement === "paid"
          ? fromDisk.entitlement
          : "free",
      hasMigratedLegacyData: Boolean(fromDisk.hasMigratedLegacyData)
    };
  }

  async saveMeta(meta: MetaState): Promise<void> {
    await this.ensureDir();
    await writeFile(this.metaPath, JSON.stringify(meta, null, 2), "utf8");
  }

  async setEntitlement(entitlement: EntitlementTier): Promise<void> {
    const meta = await this.getMeta();
    await this.saveMeta({ ...meta, entitlement });
  }

  async markMigrationDone(): Promise<void> {
    const meta = await this.getMeta();
    await this.saveMeta({ ...meta, hasMigratedLegacyData: true });
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}
