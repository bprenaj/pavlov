import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Locks build/installer.nsh against the SOURCE of each residual the app
 * writes at runtime (Uninstall Standard). Renaming the AUMID, the package
 * name, or the productName must fail here until the uninstaller follows.
 */

const root = path.join(__dirname, '..', '..');
const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  name: string;
  productName: string;
  build: { appId: string; nsis: { include?: string; oneClick?: boolean } };
};
const mainSrc = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8');

describe('uninstall cleanup (build/installer.nsh)', () => {
  it('is wired into the NSIS build', () => {
    expect(pkg.build.nsis.include).toBe('build/installer.nsh');
  });

  it('removes userData for the current productName', () => {
    expect(nsh).toContain(`RMDir /r "$APPDATA\\${pkg.productName}"`);
  });

  it('removes the electron-updater cache for the current package name', () => {
    expect(nsh).toContain(`RMDir /r "$LOCALAPPDATA\\${pkg.name}-updater"`);
  });

  it('removes the autostart Run value named after the AUMID the app sets', () => {
    const aumidMatch = /setAppUserModelId\('([^']+)'\)/.exec(mainSrc);
    expect(aumidMatch).not.toBeNull();
    const aumid = aumidMatch![1];
    expect(aumid).toBe(pkg.build.appId);
    expect(nsh).toContain(
      `DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${aumid}"`,
    );
  });

  it('guards the legacy electron.app.Electron value by install-dir prefix', () => {
    expect(nsh).toContain('"electron.app.Electron"');
    expect(nsh).toContain(`$LOCALAPPDATA\\Programs\\${pkg.productName}\\`);
  });

  it('wraps ALL cleanup inside the isUpdated guard so updates never wipe data', () => {
    const macro = nsh.slice(nsh.indexOf('!macro customUnInstall'));
    const statements = macro
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('RMDir') || l.startsWith('DeleteRegValue'));
    expect(statements.length).toBeGreaterThan(0);
    const guardStart = macro.indexOf('${ifNot} ${isUpdated}');
    const guardEnd = macro.lastIndexOf('${endif}');
    expect(guardStart).toBeGreaterThan(-1);
    for (const stmt of statements) {
      const idx = macro.indexOf(stmt);
      expect(idx, `statement outside isUpdated guard: ${stmt}`).toBeGreaterThan(guardStart);
      expect(idx, `statement outside isUpdated guard: ${stmt}`).toBeLessThan(guardEnd);
    }
  });

  it('uses the one-click installer (silent background updates, no wizard)', () => {
    // Auto-Update Standard: assisted installers replay the install wizard on
    // every auto-update. userData removal lives in installer.nsh (guarded by
    // isUpdated), so deleteAppDataOnUninstall stays unnecessary either way.
    expect(pkg.build.nsis.oneClick).toBe(true);
    expect(JSON.stringify(pkg.build)).not.toContain('allowToChangeInstallationDirectory');
  });
});
