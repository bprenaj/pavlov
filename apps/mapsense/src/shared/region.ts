import type { MinimapRect } from './types';

/**
 * Expand a rect by `tolerancePx` in every direction.
 * Ensures no negative coordinates.
 */
export function withTolerance(rect: MinimapRect, tolerancePx: number): MinimapRect {
  return {
    x: Math.max(0, rect.x - tolerancePx),
    y: Math.max(0, rect.y - tolerancePx),
    width: rect.width + tolerancePx * 2,
    height: rect.height + tolerancePx * 2,
  };
}

/**
 * Check whether a point (gazeX, gazeY) falls inside the rect.
 */
export function regionContainsPoint(
  rect: MinimapRect,
  gazeX: number,
  gazeY: number,
): boolean {
  return (
    gazeX >= rect.x &&
    gazeX <= rect.x + rect.width &&
    gazeY >= rect.y &&
    gazeY <= rect.y + rect.height
  );
}

/**
 * Check gaze-in-region with tolerance expansion.
 */
export function gazeInRegion(
  rect: MinimapRect,
  tolerancePx: number,
  gazeX: number,
  gazeY: number,
): boolean {
  return regionContainsPoint(withTolerance(rect, tolerancePx), gazeX, gazeY);
}

/**
 * Convert ratio-based preset coordinates to pixel rect for a given screen size.
 */
export function ratiosToRect(
  ratioX: number,
  ratioY: number,
  ratioW: number,
  ratioH: number,
  screenW: number,
  screenH: number,
): MinimapRect {
  return {
    x: Math.round(ratioX * screenW),
    y: Math.round(ratioY * screenH),
    width: Math.round(ratioW * screenW),
    height: Math.round(ratioH * screenH),
  };
}

/**
 * Convert a pixel rect back to ratios (for saving resolution-independent data).
 */
export function rectToRatios(rect: MinimapRect, screenW: number, screenH: number) {
  return {
    ratioX: rect.x / screenW,
    ratioY: rect.y / screenH,
    ratioW: rect.width / screenW,
    ratioH: rect.height / screenH,
  };
}
