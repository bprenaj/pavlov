/* Plain script - no module wrapper */
interface AlertOverlayApi {
  onOverlayState(cb: (active: boolean) => void): void;
}

const flash = document.getElementById('flash')!;
(window as unknown as { alertOverlayApi: AlertOverlayApi }).alertOverlayApi.onOverlayState(
  (active: boolean) => {
    flash.classList.toggle('active', active);
  },
);
