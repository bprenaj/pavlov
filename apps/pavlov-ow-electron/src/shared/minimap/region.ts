import type { MinimapRect } from "../models/types";

export function isRegionSet(region: MinimapRect): boolean {
  return region.width > 0 && region.height > 0;
}

export function expandRegionWithTolerance(
  region: MinimapRect,
  tolerancePx: number
): MinimapRect {
  const pad = Math.max(0, tolerancePx);
  return {
    x: region.x - pad,
    y: region.y - pad,
    width: region.width + pad * 2,
    height: region.height + pad * 2
  };
}

export function regionContainsPoint(
  region: MinimapRect,
  pointX: number,
  pointY: number,
  tolerancePx = 0
): boolean {
  const expanded = expandRegionWithTolerance(region, tolerancePx);
  return (
    pointX >= expanded.x &&
    pointX <= expanded.x + expanded.width &&
    pointY >= expanded.y &&
    pointY <= expanded.y + expanded.height
  );
}

export function normalizedToScreenPoint(
  nx: number,
  ny: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  return {
    x: Math.round(nx * screenWidth),
    y: Math.round(ny * screenHeight)
  };
}
