"""Minimal one-line Beam Eye Tracker connection indicator."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QHBoxLayout, QLabel, QWidget

from tracker import BeamStatus
from ui.styles import ERROR_YELLOW, SUCCESS_GREEN, TEXT_SECONDARY, TEXT_TERTIARY, WARNING_AMBER

_STATUS_TEXT = {
    BeamStatus.NOT_INSTALLED: (ERROR_YELLOW, "Beam Eye Tracker SDK not found"),
    BeamStatus.NOT_RUNNING: (ERROR_YELLOW, "Beam Eye Tracker not running"),
    BeamStatus.CONNECTING: (WARNING_AMBER, "Connecting to Beam Eye Tracker..."),
    BeamStatus.TRACKING: (SUCCESS_GREEN, "Beam Eye Tracker connected"),
}


class BeamStatusWidget(QWidget):

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)

        self._dot = QLabel("\u25CF")
        self._dot.setFixedWidth(18)
        self._dot.setStyleSheet(f"font-size: 14px; color: {TEXT_TERTIARY};")

        self._label = QLabel("Checking...")
        self._label.setStyleSheet(f"font-size: 11px; color: {TEXT_TERTIARY};")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(5)
        layout.addWidget(self._dot)
        layout.addWidget(self._label, stretch=1)

    def set_status(self, status: BeamStatus) -> None:
        colour, text = _STATUS_TEXT[status]
        self._dot.setStyleSheet(f"font-size: 14px; color: {colour};")
        self._label.setText(text)
        self._label.setStyleSheet(f"font-size: 11px; color: {TEXT_TERTIARY};")
