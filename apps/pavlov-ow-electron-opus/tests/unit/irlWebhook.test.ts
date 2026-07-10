import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import { IrlWebhook } from '../../src/main/services/irlWebhook';

const hooks: IrlWebhook[] = [];

function makeHook(): IrlWebhook {
  const hook = new IrlWebhook();
  hooks.push(hook);
  return hook;
}

afterEach(() => {
  while (hooks.length) hooks.pop()!.shutdown();
});

function getStatus(port: number): Promise<{ code: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/status`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ code: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

// The webhook server binds real localhost ports; use a high range to avoid clashes.
const PORT_A = 19876;
const PORT_B = 19877;

async function waitForServer(port: number, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await getStatus(port);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  throw new Error(`server on ${port} never came up`);
}

describe('IrlWebhook', () => {
  it('serves /status when enabled', async () => {
    const hook = makeHook();
    hook.configure(true, PORT_A);
    await waitForServer(PORT_A);
    const res = await getStatus(PORT_A);
    expect(res.code).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ active: false, last_event: 'none' });
  });

  it('reflects alert state in /status', async () => {
    const hook = makeHook();
    hook.configure(true, PORT_A);
    await waitForServer(PORT_A);
    hook.onAlertStart();
    let res = JSON.parse((await getStatus(PORT_A)).body);
    expect(res).toMatchObject({ active: true, last_event: 'alert_start' });
    hook.onAlertStop();
    res = JSON.parse((await getStatus(PORT_A)).body);
    expect(res).toMatchObject({ active: false, last_event: 'alert_stop' });
  });

  it('moves the server when the port changes while enabled', async () => {
    const hook = makeHook();
    hook.configure(true, PORT_A);
    await waitForServer(PORT_A);
    hook.configure(true, PORT_B);
    await waitForServer(PORT_B);
    const res = await getStatus(PORT_B);
    expect(res.code).toBe(200);
    await expect(getStatus(PORT_A)).rejects.toThrow();
  });

  it('stops serving when disabled', async () => {
    const hook = makeHook();
    hook.configure(true, PORT_A);
    await waitForServer(PORT_A);
    hook.configure(false, PORT_A);
    await new Promise((r) => setTimeout(r, 50));
    await expect(getStatus(PORT_A)).rejects.toThrow();
  });

  it('retries the bind on reconfigure after the port was taken', async () => {
    // Occupy the port so the hook's first bind fails.
    const blocker = http.createServer(() => {});
    await new Promise<void>((resolve) => blocker.listen(PORT_A, '127.0.0.1', resolve));

    const hook = makeHook();
    hook.configure(true, PORT_A);
    // Give the async 'error' event time to fire and null the dead server.
    await new Promise((r) => setTimeout(r, 100));

    await new Promise<void>((resolve) => blocker.close(() => resolve()));

    // Same port, still enabled: must retry the bind instead of staying dead.
    hook.configure(true, PORT_A);
    await waitForServer(PORT_A);
    const res = await getStatus(PORT_A);
    expect(res.code).toBe(200);
  });

  it('returns 404 for unknown routes', async () => {
    const hook = makeHook();
    hook.configure(true, PORT_A);
    await waitForServer(PORT_A);
    const code = await new Promise<number>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${PORT_A}/nope`, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on('error', reject);
    });
    expect(code).toBe(404);
  });
});
