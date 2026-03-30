/* Plain script - no module wrapper */
const rApi = (window as any).regionOverlayApi;
const selBox = document.getElementById('selection')!;
const hintMain = document.getElementById('hintMain')!;
const hintSub = document.getElementById('hintSub')!;

let startX = 0, startY = 0, dragging = false;
let pendingRect: { x: number; y: number; width: number; height: number } | null = null;

function setPendingRect(r: typeof pendingRect): void {
  pendingRect = r;
  (window as any).__pendingRect = r;
  hintSub.style.display = r ? '' : 'none';
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  setPendingRect(null);
  startX = e.clientX; startY = e.clientY; dragging = true;
  selBox.style.display = 'block';
  selBox.style.left = `${startX}px`; selBox.style.top = `${startY}px`;
  selBox.style.width = '0'; selBox.style.height = '0';
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
  const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
  selBox.style.left = `${x}px`; selBox.style.top = `${y}px`;
  selBox.style.width = `${w}px`; selBox.style.height = `${h}px`;
});

document.addEventListener('mouseup', (e) => {
  if (!dragging) return; dragging = false;
  const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
  const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
  if (w > 10 && h > 10) {
    setPendingRect({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && pendingRect && rApi) {
    rApi.confirmRegion(pendingRect);
  } else if (e.key === 'Escape' && rApi) {
    rApi.cancelRegion();
  }
});
