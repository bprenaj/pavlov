import { nativeImage } from "electron";

const BELL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A172A"/>
      <stop offset="100%" stop-color="#17314D"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C9A57C"/>
      <stop offset="100%" stop-color="#8A5C32"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>
  <path d="M132 46c0-8-6-14-14-14s-14 6-14 14v10c-24 7-41 30-41 56v26c0 12-3 22-12 31-2 3-3 6-2 9 2 4 6 6 10 6h119c4 0 8-2 10-6 1-3 0-6-2-9-9-9-12-19-12-31v-26c0-27-18-50-43-56V46z" fill="url(#metal)" stroke="#5F3D24" stroke-width="6"/>
  <circle cx="118" cy="188" r="13" fill="#4E2F1A"/>
  <path d="M86 204c8 13 18 19 32 19s24-6 32-19" stroke="#7FD9FF" stroke-width="8" stroke-linecap="round" fill="none"/>
  <path d="M72 106h18m78 0h18m-94 36h14m56 0h14" stroke="#7FD9FF" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
</svg>
`.trim();

function svgToDataUrl(svg: string): string {
  const encoded = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

export function createPavlovIcon(): Electron.NativeImage {
  return nativeImage.createFromDataURL(svgToDataUrl(BELL_SVG));
}
