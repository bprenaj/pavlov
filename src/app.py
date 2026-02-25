"""MapSense application lifecycle.

Creates the QApplication, loads settings, initialises the tracker,
applies the global stylesheet, and opens the main window.
"""

from __future__ import annotations

import logging
import sys

from PySide6.QtWidgets import QApplication

from settings import Settings
from tracker import BeamTracker, get_screen_resolution
from ui.main_window import MainWindow
from ui.styles import build_stylesheet

logger = logging.getLogger(__name__)


class MapSenseApp:
    """Owns the Qt application and coordinates top-level objects."""

    def __init__(self, debug: bool = False) -> None:
        self._debug = debug
        self._qt_app = QApplication.instance() or QApplication(sys.argv)
        self._qt_app.setApplicationName("MapSense")
        self._qt_app.setOrganizationName("Eyeware Tech SA")
        self._qt_app.setApplicationVersion("0.1.0")

        # Load bundled fonts, then apply global stylesheet
        from utils import load_bundled_fonts
        load_bundled_fonts()
        self._qt_app.setStyleSheet(build_stylesheet())

        # Settings
        self._settings = Settings.load()
        logger.info("Settings loaded (first_run=%s)", self._settings.first_run)

        # Tracker
        self._tracker = BeamTracker()
        screen_w, screen_h = get_screen_resolution()
        if self._tracker._sdk_available:
            self._tracker.initialize(screen_w, screen_h)
            logger.info("Screen resolution: %dx%d", screen_w, screen_h)
        else:
            logger.warning("Beam SDK not available, tracker will not function")

        # Main window
        self._window = MainWindow(
            tracker=self._tracker,
            settings=self._settings,
            debug=self._debug,
        )
        self._qt_app.setWindowIcon(self._window.windowIcon())

    def run(self) -> int:
        """Show the window and enter the Qt event loop."""
        self._window.show()
        logger.info("MapSense ready")
        return self._qt_app.exec()
