"""IRL Webhook server for physical alert devices.

Runs a lightweight localhost HTTP server that broadcasts alert events.
Makers can connect physical devices (Raspberry Pi, Arduino, etc.) that
listen for POST requests to trigger motors, LEDs, flags, or other
real-world feedback mechanisms.

Endpoints:
  GET  /status          Returns {"active": true/false, "event": "..."}
  POST events are sent TO configured webhook URL, not received.

Architecture: MapSense POSTs to a user-configured URL when alerts fire.
This keeps it simple: the user runs their own listener on their device.
"""

from __future__ import annotations

import json
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

logger = logging.getLogger(__name__)

DEFAULT_PORT = 9876


class _StatusHandler(BaseHTTPRequestHandler):
    """Serves GET /status so devices can poll alert state."""

    server: "WebhookServer"

    def do_GET(self) -> None:
        if self.path == "/status":
            payload = json.dumps({
                "active": self.server.alert_active,
                "last_event": self.server.last_event,
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args) -> None:
        logger.debug("Webhook server: %s", format % args)


class WebhookServer(HTTPServer):
    """HTTP server extended with alert state."""

    alert_active: bool = False
    last_event: str = "none"


class IRLWebhook:
    """Manages the IRL webhook: local status server + outbound POST notifications."""

    def __init__(self) -> None:
        self._enabled = False
        self._port = DEFAULT_PORT
        self._webhook_url: str = ""
        self._server: Optional[WebhookServer] = None
        self._thread: Optional[threading.Thread] = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def port(self) -> int:
        return self._port

    @property
    def webhook_url(self) -> str:
        return self._webhook_url

    def configure(self, enabled: bool, port: int = DEFAULT_PORT, webhook_url: str = "") -> None:
        self._webhook_url = webhook_url.strip()
        self._port = port

        if enabled and not self._enabled:
            self._start_server()
        elif not enabled and self._enabled:
            self._stop_server()
        self._enabled = enabled

    def on_alert_start(self) -> None:
        if not self._enabled:
            return
        if self._server:
            self._server.alert_active = True
            self._server.last_event = "alert_start"
        self._send_event("alert_start")

    def on_alert_stop(self) -> None:
        if not self._enabled:
            return
        if self._server:
            self._server.alert_active = False
            self._server.last_event = "alert_stop"
        self._send_event("alert_stop")

    def shutdown(self) -> None:
        self._stop_server()

    def _start_server(self) -> None:
        if self._server is not None:
            return
        try:
            self._server = WebhookServer(("127.0.0.1", self._port), _StatusHandler)
            self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            self._thread.start()
            logger.info("IRL webhook server started on port %d", self._port)
        except OSError:
            logger.exception("Failed to start webhook server on port %d", self._port)
            self._server = None

    def _stop_server(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server = None
            self._thread = None
            logger.info("IRL webhook server stopped")

    def _send_event(self, event: str) -> None:
        if not self._webhook_url:
            return
        payload = json.dumps({"event": event, "source": "MapSense"}).encode()
        req = Request(
            self._webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        def _do_post():
            try:
                with urlopen(req, timeout=2) as resp:
                    logger.debug("Webhook POST %s -> %d", event, resp.status)
            except (URLError, OSError):
                logger.debug("Webhook POST failed for %s", event, exc_info=True)
        threading.Thread(target=_do_post, daemon=True).start()
