"""Transparent overlay that flashes over the minimap when the alarm fires."""

from __future__ import annotations

import time

from PySide6.QtCore import QRect, QTimer, Qt
from PySide6.QtGui import QBrush, QColor, QPainter, QPaintEvent
from PySide6.QtWidgets import QWidget

from ui.styles import PURPLE, PURPLE_HOVER


class AlertOverlay(QWidget):
    """Flashing semi-transparent overlay positioned on top of the minimap.

    Uses the brand purple instead of aggressive red for a less jarring
    but still attention-getting effect during gameplay.
    """

    _FLASH_PERIOD = 0.45

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.Window
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)

        self._visible_phase = False
        self._start_time = 0.0

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.setInterval(30)

    def flash_at(self, rect: QRect) -> None:
        """Start flashing over the given screen rectangle."""
        self.setGeometry(rect)
        self._start_time = time.time()
        self._visible_phase = True
        self._timer.start()
        self.show()
        self.raise_()

    def stop_flash(self) -> None:
        self._timer.stop()
        self._visible_phase = False
        self.hide()

    def _tick(self) -> None:
        elapsed = (time.time() - self._start_time) % self._FLASH_PERIOD
        new_phase = elapsed < (self._FLASH_PERIOD / 2.0)
        if new_phase != self._visible_phase:
            self._visible_phase = new_phase
            self.update()

    def paintEvent(self, event: QPaintEvent) -> None:
        if not self._visible_phase:
            return
        painter = QPainter(self)
        colour = QColor(PURPLE)
        colour.setAlpha(90)
        painter.fillRect(self.rect(), colour)

        border = QColor(PURPLE_HOVER)
        border.setAlpha(160)
        painter.setPen(border)
        painter.drawRect(self.rect().adjusted(1, 1, -2, -2))
        painter.end()
