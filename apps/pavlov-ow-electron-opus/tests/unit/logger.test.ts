import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileLogger, formatLine } from '../../src/main/services/logger';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapsense-logger-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('formatLine', () => {
  it('prefixes ISO timestamp and level', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    expect(formatLine('info', ['hello', 'world'], now)).toBe(
      '2026-07-10T12:00:00.000Z [info] hello world\n',
    );
  });

  it('serializes errors with stack and objects as JSON', () => {
    const err = new Error('boom');
    const line = formatLine('error', [err, { a: 1 }]);
    expect(line).toContain('boom');
    expect(line).toContain('{"a":1}');
  });

  it('never throws on unserializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatLine('info', [circular])).not.toThrow();
  });
});

describe('FileLogger', () => {
  it('writes lines to the log file after init', () => {
    const logger = new FileLogger();
    logger.init({ dir });
    logger.write('info', ['first line']);
    logger.write('error', ['second line']);
    const content = fs.readFileSync(logger.getFilePath()!, 'utf-8');
    expect(content).toContain('[info] first line');
    expect(content).toContain('[error] second line');
  });

  it('is inert (and silent) before init', () => {
    const logger = new FileLogger();
    expect(logger.getFilePath()).toBeNull();
    expect(() => logger.write('info', ['dropped'])).not.toThrow();
  });

  it('rotates to .1 when maxBytes is exceeded and keeps logging', () => {
    const logger = new FileLogger();
    logger.init({ dir, maxBytes: 200 });
    for (let i = 0; i < 10; i++) {
      logger.write('info', [`line ${i} padding padding padding padding`]);
    }
    const main = logger.getFilePath()!;
    expect(fs.existsSync(main)).toBe(true);
    expect(fs.existsSync(`${main}.1`)).toBe(true);
    expect(fs.statSync(main).size).toBeLessThanOrEqual(200);
  });

  it('mirrors hooked console calls into the file and still calls through', () => {
    const logger = new FileLogger();
    logger.init({ dir });
    const calls: string[] = [];
    const fakeConsole = {
      log: (...a: unknown[]) => calls.push(`log:${a.join(' ')}`),
      warn: (...a: unknown[]) => calls.push(`warn:${a.join(' ')}`),
      error: (...a: unknown[]) => calls.push(`error:${a.join(' ')}`),
    } as unknown as Console;
    logger.hookConsole(fakeConsole);

    fakeConsole.log('[Updater]', 'checking');
    fakeConsole.warn('careful');
    fakeConsole.error('broken');

    const content = fs.readFileSync(logger.getFilePath()!, 'utf-8');
    expect(content).toContain('[info] [Updater] checking');
    expect(content).toContain('[warn] careful');
    expect(content).toContain('[error] broken');
    expect(calls).toEqual(['log:[Updater] checking', 'warn:careful', 'error:broken']);
  });

  it('survives an unwritable directory without throwing', () => {
    const logger = new FileLogger();
    const filePath = path.join(dir, 'not-a-dir');
    fs.writeFileSync(filePath, 'x');
    expect(() => logger.init({ dir: path.join(filePath, 'child') })).not.toThrow();
    expect(() => logger.write('info', ['dropped'])).not.toThrow();
  });
});
