import * as http from 'http';
import * as https from 'https';
import { IRL_DEFAULT_PORT } from '../../shared/constants';

export class IrlWebhook {
  private server: http.Server | null = null;
  private enabled = false;
  private port = IRL_DEFAULT_PORT;
  private webhookUrl = '';
  private alertActive = false;
  private lastEvent = 'none';

  configure(enabled: boolean, port: number = IRL_DEFAULT_PORT, webhookUrl: string = ''): void {
    this.webhookUrl = webhookUrl.trim();
    const portChanged = port !== this.port;
    this.port = port;

    if (enabled && !this.enabled) {
      this.startServer();
    } else if (!enabled && this.enabled) {
      this.stopServer();
    } else if (enabled && this.enabled && (portChanged || !this.server)) {
      // !this.server: a previous bind failed (e.g. port in use); retry now
      // that the user re-applied settings instead of staying dead silently.
      this.stopServer();
      this.startServer();
    }
    this.enabled = enabled;
  }

  onAlertStart(): void {
    if (!this.enabled) return;
    this.alertActive = true;
    this.lastEvent = 'alert_start';
    this.sendEvent('alert_start');
  }

  onAlertStop(): void {
    if (!this.enabled) return;
    this.alertActive = false;
    this.lastEvent = 'alert_stop';
    this.sendEvent('alert_stop');
  }

  shutdown(): void {
    this.stopServer();
  }

  private startServer(): void {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/status') {
        const payload = JSON.stringify({
          active: this.alertActive,
          last_event: this.lastEvent,
        });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(payload);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[IrlWebhook] Server started on port ${this.port}`);
    });

    this.server.on('error', (err) => {
      console.error(`[IrlWebhook] Server error on port ${this.port}:`, err.message);
      this.server = null;
    });
  }

  private stopServer(): void {
    if (this.server) {
      // Drop keep-alive sockets too; close() alone waits for them and can
      // stall quit indefinitely.
      this.server.closeAllConnections();
      this.server.close();
      this.server = null;
      console.log('[IrlWebhook] Server stopped');
    }
  }

  private sendEvent(event: string): void {
    if (!this.webhookUrl) return;
    const payload = JSON.stringify({ event, source: 'Pavlov' });

    try {
      const url = new URL(this.webhookUrl);
      const isHttps = url.protocol === 'https:';
      const opts: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 2000,
      };

      const req = (isHttps ? https : http).request(opts, (res) => {
        res.resume();
        console.log(`[IrlWebhook] POST ${event} -> ${res.statusCode}`);
      });
      req.on('timeout', () => {
        // Without this the 2s timeout option only sets a socket flag and a
        // black-holed endpoint keeps the request open forever.
        req.destroy(new Error('timed out after 2000ms'));
      });
      req.on('error', (err) => {
        console.log(`[IrlWebhook] POST ${event} failed:`, err.message);
      });
      req.write(payload);
      req.end();
    } catch (err: unknown) {
      console.log('[IrlWebhook] POST failed:', (err as Error).message);
    }
  }
}
