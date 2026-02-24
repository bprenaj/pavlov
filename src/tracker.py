"""Beam Eye Tracker SDK wrapper.

Isolates all SDK calls behind a clean interface so the rest of the app
never touches ``eyeware`` directly.  If the SDK is not installed the
tracker degrades gracefully to a NOT_INSTALLED status.

See also: ../../CLAUDE-BEAMSDK.md for full SDK reference.
"""

from __future__ import annotations

import ctypes
import logging
import sys
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class BeamStatus(Enum):
    NOT_INSTALLED = "not_installed"
    NOT_RUNNING = "not_running"
    CONNECTING = "connecting"
    TRACKING = "tracking"


@dataclass(frozen=True)
class GazeData:
    """A single gaze sample from the tracker."""

    x: float
    y: float
    confidence: int
    timestamp: float

    @property
    def is_usable(self) -> bool:
        """MEDIUM (2) or HIGH (3) confidence is required for reliable detection."""
        return self.confidence >= 2


def get_screen_resolution() -> tuple[int, int]:
    """Return the primary monitor's pixel dimensions (DPI-aware).

    Must be called *after* ``SetProcessDpiAwareness(2)`` has been set.
    """
    if sys.platform != "win32":
        return (1920, 1080)
    width = ctypes.windll.user32.GetSystemMetrics(0)
    height = ctypes.windll.user32.GetSystemMetrics(1)
    return (width, height)


class BeamTracker:
    """High-level wrapper around the Beam Eye Tracker SDK.

    Lifecycle:
      1. Instantiate (attempts to import the SDK).
      2. initialize(w, h) creates the API object with screen geometry.
      3. get_gaze() at ~30 fps to read gaze data.
      4. shutdown() to clean up.
    """

    def __init__(self) -> None:
        self._api = None
        self._beam = None
        self._sdk_available = False
        self._last_gaze_time: float = 0.0

        try:
            from eyeware import beam_eye_tracker  # type: ignore[import-untyped]

            self._beam = beam_eye_tracker
            self._sdk_available = True
            logger.info("Beam SDK imported successfully")
        except ImportError:
            logger.warning(
                "beam-eye-tracker package not found. "
                "Install with: pip install beam-eye-tracker"
            )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def initialize(self, screen_width: int, screen_height: int) -> bool:
        """Create the SDK API object.  Returns True on success."""
        if not self._sdk_available:
            return False
        try:
            viewport = self._beam.ViewportGeometry()
            viewport.point_00 = self._beam.Point(0, 0)
            viewport.point_11 = self._beam.Point(screen_width, screen_height)
            self._api = self._beam.API("Mapavlov", viewport)
            logger.info("Beam API initialised (%dx%d)", screen_width, screen_height)
            return True
        except Exception:
            logger.exception("Failed to initialise Beam API")
            return False

    def shutdown(self) -> None:
        self._api = None
        logger.info("Beam tracker shut down")

    # ------------------------------------------------------------------
    # Status & connection
    # ------------------------------------------------------------------

    def get_status(self) -> BeamStatus:
        if not self._sdk_available:
            return BeamStatus.NOT_INSTALLED
        if self._api is None:
            return BeamStatus.NOT_RUNNING
        try:
            raw = self._api.get_tracking_data_reception_status()
            status_name = str(raw)
            if "ATTEMPTING" in status_name:
                return BeamStatus.CONNECTING
            if "NOT_RECEIVING" in status_name:
                return BeamStatus.NOT_RUNNING
            if "RECEIVING" in status_name:
                return BeamStatus.TRACKING
            return BeamStatus.NOT_RUNNING
        except Exception:
            logger.debug("Status check failed", exc_info=True)
            return BeamStatus.NOT_RUNNING

    def attempt_auto_start(self) -> bool:
        """Ask Beam to start tracking (works when Beam app is open but idle)."""
        if self._api is None:
            return False
        try:
            self._api.attempt_starting_the_beam_eye_tracker()
            logger.info("Sent auto-start request to Beam")
            return True
        except Exception:
            logger.debug("Auto-start request failed", exc_info=True)
            return False

    # ------------------------------------------------------------------
    # Gaze reading
    # ------------------------------------------------------------------

    def get_gaze(self) -> Optional[GazeData]:
        """Read the latest gaze sample.  Returns None when data is invalid."""
        if self._api is None:
            return None
        try:
            tracking_state = self._api.get_latest_tracking_state_set()
            user_state = tracking_state.user_state()

            if user_state.timestamp_in_seconds == self._beam.NULL_DATA_TIMESTAMP():
                return None

            screen_gaze = user_state.unified_screen_gaze
            gaze = GazeData(
                x=screen_gaze.point_of_regard.x,
                y=screen_gaze.point_of_regard.y,
                confidence=screen_gaze.confidence,
                timestamp=user_state.timestamp_in_seconds,
            )
            if gaze.is_usable:
                self._last_gaze_time = time.time()
            return gaze
        except Exception:
            logger.debug("Gaze read failed", exc_info=True)
            return None

    @property
    def seconds_since_last_good_gaze(self) -> float:
        """Seconds elapsed since the last MEDIUM/HIGH confidence sample."""
        if self._last_gaze_time == 0.0:
            return 0.0
        return time.time() - self._last_gaze_time
