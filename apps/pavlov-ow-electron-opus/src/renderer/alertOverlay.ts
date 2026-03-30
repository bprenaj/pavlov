/* Plain script - no module wrapper */
const flash = document.getElementById('flash')!;
(window as any).alertOverlayApi.onOverlayState((active: boolean) => {
  flash.classList.toggle('active', active);
});
