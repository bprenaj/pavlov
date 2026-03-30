export {}

interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RegionOverlayApi {
  confirmRegion: (rect: MinimapRect) => void;
  cancelRegion: () => void;
  onInit: (callback: (payload: { currentRect: MinimapRect | null }) => void) => void;
}

const regionOverlayApi = (
  window as unknown as { regionOverlayApi: RegionOverlayApi }
).regionOverlayApi;

const canvas = document.getElementById("overlayCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

let dragging = false;
let startX = 0;
let startY = 0;
let currentRect: MinimapRect | null = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

function normalizeRect(rect: MinimapRect): MinimapRect {
  const x = Math.min(rect.x, rect.x + rect.width);
  const y = Math.min(rect.y, rect.y + rect.height);
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return { x, y, width, height };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!currentRect) {
    return;
  }
  const rect = normalizeRect(currentRect);
  if (rect.width <= 1 || rect.height <= 1) {
    return;
  }

  ctx.fillStyle = "rgba(18, 165, 255, 0.2)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "#46c7ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

canvas.addEventListener("mousedown", (event) => {
  dragging = true;
  startX = event.clientX;
  startY = event.clientY;
  currentRect = { x: startX, y: startY, width: 0, height: 0 };
  draw();
});

canvas.addEventListener("mousemove", (event) => {
  if (!dragging || !currentRect) {
    return;
  }
  currentRect = {
    x: startX,
    y: startY,
    width: event.clientX - startX,
    height: event.clientY - startY
  };
  draw();
});

canvas.addEventListener("mouseup", () => {
  dragging = false;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    regionOverlayApi.cancelRegion();
    return;
  }
  if (event.key !== "Enter" || !currentRect) {
    return;
  }
  const rect = normalizeRect(currentRect);
  if (rect.width < 10 || rect.height < 10) {
    regionOverlayApi.cancelRegion();
    return;
  }
  regionOverlayApi.confirmRegion(rect);
});

regionOverlayApi.onInit((payload) => {
  if (payload.currentRect) {
    currentRect = payload.currentRect;
    draw();
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
