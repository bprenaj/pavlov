import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

describe("renderer layout", () => {
  test("contains guided coach, history, and settings surfaces", () => {
    const htmlPath = path.resolve(
      __dirname,
      "..",
      "..",
      "src",
      "renderer",
      "index.html"
    );
    const html = readFileSync(htmlPath, "utf8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    expect(document.querySelector("#navCoach")).not.toBeNull();
    expect(document.querySelector("#navHistory")).not.toBeNull();
    expect(document.querySelector("#navSettings")).not.toBeNull();
    expect(document.querySelector("#regionSelectPrimary")).not.toBeNull();
    expect(document.querySelector("#selectRegionBtn")).not.toBeNull();
    expect(document.querySelector("#regionNameInput")).not.toBeNull();
    expect(document.querySelector("#startBtn")).not.toBeNull();
    expect(document.querySelector("#silentBtn")).not.toBeNull();
    expect(document.querySelector("#visualBtn")).not.toBeNull();
    expect(document.querySelector("#audioBtn")).not.toBeNull();
    expect(document.querySelector("#freeModeBtn")).not.toBeNull();
    expect(document.querySelector("#paidModeBtn")).not.toBeNull();
    expect(document.querySelector("#cmpBtn")).not.toBeNull();
    expect(document.querySelector("#onboardingModal")).not.toBeNull();
    expect(document.querySelector("owadview")).not.toBeNull();
    expect(document.querySelector("#historyChart")).not.toBeNull();
  });
});
