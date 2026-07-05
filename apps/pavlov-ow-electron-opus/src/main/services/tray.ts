import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import type { BeamStatus } from '../../shared/constants';
import type { UpdaterState } from '../../shared/types';

// Branded Pavlov tray icons with a status bubble baked in (generated at
// build time into dist/main/assets). NOTE: nativeImage.createFromBuffer
// only decodes PNG/JPEG -- the old raw-RGBA buffer approach produced an
// empty image and an invisible tray icon.
function trayIconFor(status: BeamStatus): Electron.NativeImage {
  const file =
    status === 'tracking' ? 'tray-tracking.png' :
    status === 'connecting' ? 'tray-connecting.png' :
    'tray-off.png';
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', file));
  if (img.isEmpty()) {
    console.error(`[Tray] icon asset missing or unreadable: ${file}`);
  }
  return img;
}

function statusLabelFor(status: BeamStatus): string {
  return status === 'tracking' ? 'Beam Eye Tracker: Tracking' :
    status === 'connecting' ? 'Beam Eye Tracker: Connecting...' :
    status === 'not_running' ? 'Beam Eye Tracker: Not Running' :
    'Beam Eye Tracker: Not Installed';
}

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private status: BeamStatus = 'not_running';
  private updaterState: UpdaterState | null = null;
  private onInstallUpdate: (() => void) | null = null;

  setUpdateHandler(onInstallUpdate: () => void): void {
    this.onInstallUpdate = onInstallUpdate;
  }

  updateUpdaterState(state: UpdaterState): void {
    this.updaterState = state;
    this.updateMenu();
  }

  create(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.tray = new Tray(trayIconFor(this.status));
    this.tray.setToolTip(`Pavlov - Map Awareness Coach\n${statusLabelFor(this.status)}`);
    this.updateMenu();

    this.tray.on('double-click', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });
  }

  updateStatus(status: BeamStatus): void {
    this.status = status;
    if (this.tray) {
      this.tray.setImage(trayIconFor(status));
      this.tray.setToolTip(`Pavlov - Map Awareness Coach\n${statusLabelFor(status)}`);
      this.updateMenu();
    }
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  private updateMenu(): void {
    if (!this.tray) return;
    const statusLabel = statusLabelFor(this.status);

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: 'Pavlov', enabled: false },
      { type: 'separator' },
      { label: statusLabel, enabled: false },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          this.mainWindow?.show();
          this.mainWindow?.focus();
        },
      },
    ];

    if (this.updaterState?.status === 'ready') {
      template.push({
        label: `Restart to Update (v${this.updaterState.availableVersion ?? '?'})`,
        click: () => this.onInstallUpdate?.(),
      });
    }

    template.push({
      label: 'Quit',
      // app.quit() runs before-quit cleanup (Beam bridge, webhook server,
      // shortcuts) and lets a downloaded update install on the way out.
      click: () => app.quit(),
    });

    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }
}
