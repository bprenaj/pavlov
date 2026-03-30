import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src', 'renderer');
const dest = resolve(root, 'dist', 'renderer');
const imgSrc = resolve(root, '..', '..', 'images');

mkdirSync(resolve(dest, 'assets'), { recursive: true });

const staticFiles = [
  'index.html',
  'styles.css',
  'alert-overlay.html',
  'region-overlay.html',
];

for (const f of staticFiles) {
  const s = resolve(src, f);
  if (existsSync(s)) cpSync(s, resolve(dest, f));
}

const assetDir = resolve(src, 'assets');
if (existsSync(assetDir)) {
  cpSync(assetDir, resolve(dest, 'assets'), { recursive: true });
}

const imageMap = {
  "Pavlov's Bell - Main Image.jpg": 'pavlov-main.jpg',
  "Pavlov's Bell - Example image in header of overwolf.jpg": 'pavlov-header.jpg',
};

for (const [from, to] of Object.entries(imageMap)) {
  const s = resolve(imgSrc, from);
  if (existsSync(s)) cpSync(s, resolve(dest, 'assets', to));
}

console.log('[copy-static] Renderer assets copied.');
