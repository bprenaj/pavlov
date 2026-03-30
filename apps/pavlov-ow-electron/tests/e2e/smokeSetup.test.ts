import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("project smoke setup", () => {
  test("package scripts include ow-electron and quality gates", () => {
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["start:ow-electron"]).toBeTruthy();
    expect(packageJson.scripts["build:ow-electron"]).toBeTruthy();
    expect(packageJson.scripts["lint"]).toBeTruthy();
    expect(packageJson.scripts["test"]).toBeTruthy();
  });

  test("critical source files exist", () => {
    const expectedFiles = [
      "src/main/index.ts",
      "src/main/preload.ts",
      "src/main/overlayPreload.ts",
      "src/main/services/beamBridge.ts",
      "src/main/services/sessionEngine.ts",
      "src/renderer/index.html",
      "src/renderer/pavlovApp.ts",
      "src/renderer/region-overlay.html",
      "src/renderer/alert-overlay.html"
    ];
    for (const filePath of expectedFiles) {
      const absolute = path.resolve(__dirname, "..", "..", filePath);
      expect(existsSync(absolute)).toBe(true);
    }
  });
});
