import * as fs from 'fs';
import * as path from 'path';

/**
 * File logging for packaged runs. A packaged Windows app has no console, so
 * without this every runtime problem (Beam DLL load failure, updater error,
 * crash) leaves no trace. Mirrors console.log/warn/error into
 * <userData>/logs/main.log with timestamps and size-based rotation.
 *
 * Synchronous appends by design: log volume is low (no per-frame logging) and
 * sync writes survive an immediately following crash or process exit.
 */

const DEFAULT_MAX_BYTES = 512 * 1024;

export interface FileLoggerOptions {
  dir: string;
  fileName?: string;
  maxBytes?: number;
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function formatLine(level: string, args: unknown[], now: Date = new Date()): string {
  const msg = args.map(formatArg).join(' ');
  return `${now.toISOString()} [${level}] ${msg}\n`;
}

export class FileLogger {
  private filePath: string | null = null;
  private maxBytes = DEFAULT_MAX_BYTES;
  private currentBytes = 0;
  private consoleHooked = false;

  /** Absolute path of the active log file, or null when disabled. */
  getFilePath(): string | null {
    return this.filePath;
  }

  init(opts: FileLoggerOptions): void {
    try {
      fs.mkdirSync(opts.dir, { recursive: true });
      this.filePath = path.join(opts.dir, opts.fileName ?? 'main.log');
      this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
      this.currentBytes = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;
    } catch {
      // Logging must never take the app down; run without a file.
      this.filePath = null;
    }
  }

  write(level: string, args: unknown[]): void {
    if (!this.filePath) return;
    try {
      const line = formatLine(level, args);
      this.rotateIfNeeded(Buffer.byteLength(line));
      fs.appendFileSync(this.filePath, line);
      this.currentBytes += Buffer.byteLength(line);
    } catch {
      /* never throw from logging */
    }
  }

  /**
   * Mirror console.log/warn/error into the file so every existing
   * console call site (BeamBridge, updater, webhook) lands in the log
   * without touching each caller. Console output still happens.
   */
  hookConsole(target: Console = console): void {
    if (this.consoleHooked || !this.filePath) return;
    this.consoleHooked = true;
    const original = {
      log: target.log.bind(target),
      warn: target.warn.bind(target),
      error: target.error.bind(target),
    };
    target.log = (...args: unknown[]) => {
      this.write('info', args);
      original.log(...args);
    };
    target.warn = (...args: unknown[]) => {
      this.write('warn', args);
      original.warn(...args);
    };
    target.error = (...args: unknown[]) => {
      this.write('error', args);
      original.error(...args);
    };
  }

  /** One previous generation is kept as main.log.1; older logs are dropped. */
  private rotateIfNeeded(incomingBytes: number): void {
    if (!this.filePath) return;
    if (this.currentBytes + incomingBytes <= this.maxBytes) return;
    const rotated = `${this.filePath}.1`;
    try {
      if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
      if (fs.existsSync(this.filePath)) fs.renameSync(this.filePath, rotated);
    } catch {
      /* rotation is best effort */
    }
    this.currentBytes = 0;
  }
}

export const fileLogger = new FileLogger();
