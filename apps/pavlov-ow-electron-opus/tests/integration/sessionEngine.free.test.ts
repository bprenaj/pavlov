import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionEngine } from '../../src/main/services/sessionEngine';

describe('SessionEngine - Free Mode', () => {
  let engine: SessionEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new SessionEngine();
    engine.configure({
      mode: 'free',
      timeoutS: 5,
      tolerancePx: 10,
      minimapRect: { x: 100, y: 200, width: 50, height: 50 },
    });
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    expect(engine.isRunning()).toBe(false);
    const state = engine.getState();
    expect(state.running).toBe(false);
  });

  it('starts training', () => {
    engine.start();
    expect(engine.isRunning()).toBe(true);
  });

  it('reports the configured mode after the session ends (analytics reads it then)', () => {
    expect(engine.getMode()).toBe('free');
    engine.start();
    engine.stop();
    expect(engine.getMode()).toBe('free');
  });

  it('emits state events while running', () => {
    const stateHandler = vi.fn();
    engine.on('state', stateHandler);
    engine.start();
    vi.advanceTimersByTime(500);
    expect(stateHandler).toHaveBeenCalled();
  });

  it('triggers alert after timeout', () => {
    const alertHandler = vi.fn();
    engine.on('alert', alertHandler);
    engine.start();
    vi.advanceTimersByTime(5100);
    expect(alertHandler).toHaveBeenCalledWith(true);
  });

  it('dismisses alert on manual glance', () => {
    const alertHandler = vi.fn();
    engine.on('alert', alertHandler);
    engine.start();
    vi.advanceTimersByTime(5100);
    expect(alertHandler).toHaveBeenCalledWith(true);
    engine.markManualGlance();
    vi.advanceTimersByTime(250);
    expect(alertHandler).toHaveBeenCalledWith(false);
  });

  it('counts glances from manual markers', () => {
    engine.start();
    engine.markManualGlance();
    vi.advanceTimersByTime(300);
    engine.markManualGlance();
    vi.advanceTimersByTime(300);
    const state = engine.getState();
    expect(state.metrics.glanceCount).toBe(2);
  });

  it('ignores gaze data in free mode', () => {
    engine.start();
    engine.onGaze({ x: 120, y: 220, isTracking: true });
    vi.advanceTimersByTime(200);
    const state = engine.getState();
    expect(state.metrics.glanceCount).toBe(0);
  });

  it('produces a session record on stop', () => {
    const completeHandler = vi.fn();
    engine.on('sessionComplete', completeHandler);
    engine.start();
    engine.markManualGlance();
    vi.advanceTimersByTime(5000);
    engine.stop();
    expect(completeHandler).toHaveBeenCalled();
    const record = completeHandler.mock.calls[0][0];
    expect(record.glanceCount).toBe(1);
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it('stops cleanly', () => {
    engine.start();
    vi.advanceTimersByTime(1000);
    const record = engine.stop();
    expect(engine.isRunning()).toBe(false);
    expect(record).not.toBeNull();
  });
});
