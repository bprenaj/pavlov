export {}

interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AlertOverlayApi {
  onOverlayState: (
    callback: (payload: { active: boolean; rect: MinimapRect | null }) => void
  ) => void;
}

const alertOverlayApi = (
  window as unknown as { alertOverlayApi: AlertOverlayApi }
).alertOverlayApi;

const pulseRect = document.getElementById("pulseRect");
if (!pulseRect) {
  throw new Error("Pulse rectangle element is missing.");
}

alertOverlayApi.onOverlayState((payload) => {
  if (!payload.active || !payload.rect) {
    pulseRect.style.display = "none";
    return;
  }

  pulseRect.style.display = "block";
  pulseRect.style.left = `${payload.rect.x}px`;
  pulseRect.style.top = `${payload.rect.y}px`;
  pulseRect.style.width = `${payload.rect.width}px`;
  pulseRect.style.height = `${payload.rect.height}px`;
});
