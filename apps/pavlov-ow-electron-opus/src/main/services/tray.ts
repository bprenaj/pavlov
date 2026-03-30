import { Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import type { BeamStatus } from '../../shared/constants';

const ICON_SIZE = 16;

function createTrayIcon(status: BeamStatus): Electron.NativeImage {
  const canvas = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);

  // Fill with brand cyan (#00D4FF)
  for (let i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
    canvas[i * 4] = 0x00;     // R
    canvas[i * 4 + 1] = 0xd4; // G
    canvas[i * 4 + 2] = 0xff; // B
    canvas[i * 4 + 3] = 0xff; // A
  }

  // Status dot in bottom-right 4x4 corner
  const dotColor =
    status === 'tracking' ? [0x00, 0xe5, 0xa0] :
    status === 'connecting' ? [0xff, 0xb7, 0x4d] :
    [0xff, 0x52, 0x52];

  for (let dy = ICON_SIZE - 4; dy < ICON_SIZE; dy++) {
    for (let dx = ICON_SIZE - 4; dx < ICON_SIZE; dx++) {
      const idx = (dy * ICON_SIZE + dx) * 4;
      canvas[idx] = dotColor[0];
      canvas[idx + 1] = dotColor[1];
      canvas[idx + 2] = dotColor[2];
      canvas[idx + 3] = 0xff;
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: ICON_SIZE, height: ICON_SIZE });
}

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private status: BeamStatus = 'not_running';

  create(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.tray = new Tray(createTrayIcon(this.status));
    this.tray.setToolTip('Pavlov - Map Awareness Coach');
    this.updateMenu();

    this.tray.on('double-click', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });
  }

  updateStatus(status: BeamStatus): void {
    this.status = status;
    if (this.tray) {
      this.tray.setImage(createTrayIcon(status));
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
    const statusLabel =
      this.status === 'tracking' ? 'Beam: Tracking' :
      this.status === 'connecting' ? 'Beam: Connecting...' :
      this.status === 'not_running' ? 'Beam: Not Running' :
      'Beam: Not Installed';

    const menu = Menu.buildFromTemplate([
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
      {
        label: 'Quit',
        click: () => {
          this.mainWindow?.destroy();
          this.destroy();
          process.exit(0);
        },
      },
    ]);
    this.tray.setContextMenu(menu);
  }
}
