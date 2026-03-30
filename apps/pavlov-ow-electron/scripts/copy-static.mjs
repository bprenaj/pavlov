import { cp, copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const distRoot = path.resolve(projectRoot, "dist");
const rendererSrc = path.resolve(projectRoot, "src", "renderer");
const rendererDist = path.resolve(distRoot, "renderer");
const assetsDist = path.resolve(rendererDist, "assets");

const imageMappings = [
  {
    source: path.resolve(
      workspaceRoot,
      "images",
      "Pavlov's Bell - Main Image.jpg"
    ),
    target: path.resolve(assetsDist, "pavlov-main.jpg")
  },
  {
    source: path.resolve(
      workspaceRoot,
      "images",
      "Pavlov's Bell - Example image in header of overwolf.jpg"
    ),
    target: path.resolve(assetsDist, "pavlov-header.jpg")
  }
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(rendererDist, { recursive: true });
  await mkdir(assetsDist, { recursive: true });

  await copyFile(
    path.resolve(rendererSrc, "index.html"),
    path.resolve(rendererDist, "index.html")
  );
  await copyFile(
    path.resolve(rendererSrc, "region-overlay.html"),
    path.resolve(rendererDist, "region-overlay.html")
  );
  await copyFile(
    path.resolve(rendererSrc, "alert-overlay.html"),
    path.resolve(rendererDist, "alert-overlay.html")
  );
  await copyFile(
    path.resolve(rendererSrc, "styles.css"),
    path.resolve(rendererDist, "styles.css")
  );

  const uiAssetsSrc = path.resolve(rendererSrc, "assets");
  if (await exists(uiAssetsSrc)) {
    await cp(uiAssetsSrc, assetsDist, { recursive: true, force: true });
  }

  for (const mapping of imageMappings) {
    if (await exists(mapping.source)) {
      await copyFile(mapping.source, mapping.target);
    } else {
      console.warn(`[copy-static] Missing image asset: ${mapping.source}`);
    }
  }

  console.log("[copy-static] Renderer assets copied.");
}

main().catch((err) => {
  console.error("[copy-static] Failed to copy assets:", err);
  process.exitCode = 1;
});
