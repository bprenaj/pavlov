/** Renderer for the branded update flyout (update-flyout.html). */

interface UpdateFlyoutApi {
  onInit(cb: (version: string) => void): void;
  install(): void;
  later(): void;
}

declare global {
  interface Window {
    updateFlyoutApi: UpdateFlyoutApi;
  }
}

const api = window.updateFlyoutApi;

api.onInit((version) => {
  const el = document.getElementById('flyoutVersion');
  if (el) el.textContent = `v${version}`;
});

document.getElementById('btnFlyoutInstall')?.addEventListener('click', () => api.install());
document.getElementById('btnFlyoutLater')?.addEventListener('click', () => api.later());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.later();
});

export {};
