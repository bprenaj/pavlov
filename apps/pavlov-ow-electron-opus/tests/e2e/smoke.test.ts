import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

describe('Smoke Tests', () => {
  it('package.json exists and has required scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('pavlov');
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
  });

  it('tsconfig.json exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tsconfig.json'))).toBe(true);
  });

  it('all source entry points exist', () => {
    const required = [
      'src/main/index.ts',
      'src/main/preload.ts',
      'src/main/overlayPreload.ts',
      'src/main/ipc.ts',
      'src/renderer/index.html',
      'src/renderer/app.ts',
      'src/renderer/styles.css',
      'src/renderer/alert-overlay.html',
      'src/renderer/alertOverlay.ts',
      'src/renderer/region-overlay.html',
      'src/renderer/regionOverlay.ts',
    ];
    for (const f of required) {
      expect(fs.existsSync(path.join(ROOT, f)), `Missing: ${f}`).toBe(true);
    }
  });

  it('all service files exist', () => {
    const services = [
      'beamBridge.ts',
      'sessionEngine.ts',
      'store.ts',
      'entitlement.ts',
      'migration.ts',
      'alertManager.ts',
      'irlWebhook.ts',
      'tray.ts',
      'overlayFactory.ts',
    ];
    for (const f of services) {
      expect(
        fs.existsSync(path.join(ROOT, 'src', 'main', 'services', f)),
        `Missing service: ${f}`,
      ).toBe(true);
    }
  });

  it('all shared modules exist', () => {
    const shared = ['types.ts', 'schemas.ts', 'mas.ts', 'region.ts', 'constants.ts', 'gamePresets.ts'];
    for (const f of shared) {
      expect(
        fs.existsSync(path.join(ROOT, 'src', 'shared', f)),
        `Missing shared: ${f}`,
      ).toBe(true);
    }
  });

  it('HTML files reference correct JS scripts', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf-8');
    expect(indexHtml).toContain('app.js');
    expect(indexHtml).toContain('styles.css');

    const regionHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'region-overlay.html'), 'utf-8');
    expect(regionHtml).toContain('regionOverlay.js');

    const alertHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'alert-overlay.html'), 'utf-8');
    expect(alertHtml).toContain('alertOverlay.js');
  });
});
