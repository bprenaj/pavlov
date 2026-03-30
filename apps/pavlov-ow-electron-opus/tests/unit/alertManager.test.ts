import { describe, it, expect, vi } from 'vitest';
import { AlertManager } from '../../src/main/services/alertManager';

function makeCallbacks() {
  return {
    playAudio: vi.fn(),
    stopAudio: vi.fn(),
    showVisualAlert: vi.fn(),
    onIrlAlert: vi.fn(),
  };
}

describe('AlertManager', () => {
  it('triggers audio alert', () => {
    const cbs = makeCallbacks();
    const mgr = new AlertManager(cbs);
    mgr.configure(['audio'], 75, '/sound.wav');
    mgr.trigger();
    expect(cbs.playAudio).toHaveBeenCalledWith('/sound.wav', 75);
    expect(mgr.isActive()).toBe(true);
  });

  it('triggers visual alert', () => {
    const cbs = makeCallbacks();
    const mgr = new AlertManager(cbs);
    mgr.configure(['visual'], 50, '');
    mgr.trigger();
    expect(cbs.showVisualAlert).toHaveBeenCalledWith(true);
  });

  it('triggers irl alert', () => {
    const cbs = makeCallbacks();
    const mgr = new AlertManager(cbs);
    mgr.configure(['irl'], 50, '');
    mgr.trigger();
    expect(cbs.onIrlAlert).toHaveBeenCalledWith(true);
  });

  it('does not double-trigger', () => {
    const cbs = makeCallbacks();
    const mgr = new AlertManager(cbs);
    mgr.configure(['audio'], 50, '');
    mgr.trigger();
    mgr.trigger();
    expect(cbs.playAudio).toHaveBeenCalledTimes(1);
  });

  it('dismisses all channels', () => {
    const cbs = makeCallbacks();
    const mgr = new AlertManager(cbs);
    mgr.configure(['audio', 'visual', 'irl'], 50, '');
    mgr.trigger();
    mgr.dismiss();
    expect(cbs.stopAudio).toHaveBeenCalled();
    expect(cbs.showVisualAlert).toHaveBeenCalledWith(false);
    expect(cbs.onIrlAlert).toHaveBeenCalledWith(false);
    expect(mgr.isActive()).toBe(false);
  });

  it('isSilent returns true for empty or silent-only modes', () => {
    const cbs = makeCallbacks();
    const mgr = new AlertManager(cbs);
    mgr.configure([], 50, '');
    expect(mgr.isSilent()).toBe(true);
    mgr.configure(['silent'], 50, '');
    expect(mgr.isSilent()).toBe(true);
    mgr.configure(['audio'], 50, '');
    expect(mgr.isSilent()).toBe(false);
  });
});
