"""Audio and visual alert management.

Uses QMediaPlayer for smooth, looping WAV playback.
A cooldown prevents rapid stop/retrigger jitter when the player's
gaze wobbles near the minimap edge.
"""

from __future__ import annotations

import logging
import time
from enum import Enum

from PySide6.QtCore import QObject, QUrl, Signal
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer

from utils import generate_alert_wav

logger = logging.getLogger(__name__)

RETRIGGER_COOLDOWN_S = 0.5


class AlertMode(Enum):
    AUDIO = "audio"
    VISUAL = "visual"
    BOTH = "both"
    SILENT = "silent"


class AlertManager(QObject):

    visual_alert_started = Signal()
    visual_alert_stopped = Signal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._active = False
        self._mode = AlertMode.BOTH
        self._volume: float = 0.5
        self._last_stop_time: float = 0.0

        wav_path = generate_alert_wav()

        self._audio_output = QAudioOutput(self)
        self._audio_output.setVolume(self._volume)

        self._player = QMediaPlayer(self)
        self._player.setAudioOutput(self._audio_output)
        self._player.setSource(QUrl.fromLocalFile(wav_path))
        self._player.setLoops(QMediaPlayer.Loops.Infinite.value)

        logger.debug("Alert sound loaded from %s", wav_path)

    @property
    def is_active(self) -> bool:
        return self._active

    def trigger(self) -> None:
        if self._active:
            return
        if self._mode == AlertMode.SILENT:
            return

        elapsed_since_stop = time.time() - self._last_stop_time
        if elapsed_since_stop < RETRIGGER_COOLDOWN_S:
            return

        self._active = True
        logger.info("Alert triggered")

        if self._mode in (AlertMode.AUDIO, AlertMode.BOTH):
            self._player.play()

        if self._mode in (AlertMode.VISUAL, AlertMode.BOTH):
            self.visual_alert_started.emit()

    def stop(self) -> None:
        if not self._active:
            return
        self._active = False
        self._last_stop_time = time.time()
        self._player.stop()
        self.visual_alert_stopped.emit()
        logger.info("Alert stopped")

    def set_mode(self, mode: AlertMode) -> None:
        self._mode = mode
        logger.debug("Alert mode set to %s", mode.value)

    def set_volume(self, percent: int) -> None:
        self._volume = max(0.0, min(1.0, percent / 100.0))
        self._audio_output.setVolume(self._volume)
        logger.debug("Volume set to %d%%", percent)
