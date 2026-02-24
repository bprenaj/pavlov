"""System-tray icon with context menu.

Mapavlov minimises to the tray rather than the taskbar so it stays
out of the way during gameplay.
"""

from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtGui import QAction, QIcon
from PySide6.QtWidgets import QMenu, QSystemTrayIcon, QWidget


class TrayIcon(QSystemTrayIcon):
    """Tray icon with Show / Start-Stop / Quit actions."""

    show_requested = Signal()
    toggle_training = Signal()
    quit_requested = Signal()

    def __init__(self, icon: QIcon, parent: QWidget | None = None) -> None:
        super().__init__(icon, parent)
        self.setToolTip("Mapavlov: Minimap Awareness Trainer")

        menu = QMenu()
        menu.setStyleSheet(
            "QMenu { background: #23262E; color: #F0F0F0; border: 1px solid #333640; }"
            "QMenu::item:selected { background: #7B61FF; }"
        )

        self._show_action = QAction("Show Mapavlov", self)
        self._show_action.triggered.connect(self.show_requested.emit)
        menu.addAction(self._show_action)

        menu.addSeparator()

        self._toggle_action = QAction("Start Training", self)
        self._toggle_action.triggered.connect(self.toggle_training.emit)
        menu.addAction(self._toggle_action)

        menu.addSeparator()

        quit_action = QAction("Quit", self)
        quit_action.triggered.connect(self.quit_requested.emit)
        menu.addAction(quit_action)

        self.setContextMenu(menu)
        self.activated.connect(self._on_activated)

    def set_training_state(self, running: bool) -> None:
        self._toggle_action.setText("Stop Training" if running else "Start Training")

    def _on_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_requested.emit()
