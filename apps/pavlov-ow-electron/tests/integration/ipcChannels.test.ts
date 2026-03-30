import { IPC_CHANNELS } from "../../src/main/ipcChannels";

describe("IPC channel map", () => {
  test("all channel values are unique", () => {
    const values = Object.values(IPC_CHANNELS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  test("uses pavlov namespace", () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(channel.startsWith("pavlov:")).toBe(true);
    }
  });
});
