import type { AlertMode } from '../../shared/constants';

export interface AlertManagerCallbacks {
  playAudio: (soundPath: string, volume: number) => void;
  stopAudio: () => void;
  showVisualAlert: (show: boolean) => void;
  onIrlAlert: (active: boolean) => void;
}

export class AlertManager {
  private modes: AlertMode[] = ['audio'];
  private volume = 50;
  private customSoundPath = '';
  private callbacks: AlertManagerCallbacks;
  private active = false;

  constructor(callbacks: AlertManagerCallbacks) {
    this.callbacks = callbacks;
  }

  configure(modes: AlertMode[], volume: number, customSoundPath: string): void {
    this.modes = modes;
    this.volume = volume;
    this.customSoundPath = customSoundPath;
  }

  trigger(): void {
    if (this.active) return;
    this.active = true;

    if (this.modes.includes('audio')) {
      this.callbacks.playAudio(this.customSoundPath, this.volume);
    }
    if (this.modes.includes('visual')) {
      this.callbacks.showVisualAlert(true);
    }
    if (this.modes.includes('irl')) {
      this.callbacks.onIrlAlert(true);
    }
  }

  dismiss(): void {
    if (!this.active) return;
    this.active = false;

    this.callbacks.stopAudio();
    this.callbacks.showVisualAlert(false);
    if (this.modes.includes('irl')) {
      this.callbacks.onIrlAlert(false);
    }
  }

  isSilent(): boolean {
    return this.modes.length === 0 || (this.modes.length === 1 && this.modes[0] === 'silent');
  }

  isActive(): boolean {
    return this.active;
  }
}
