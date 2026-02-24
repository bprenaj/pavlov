"""Mapavlov main window."""

from __future__ import annotations

import logging
import os
import time
import urllib.parse
import webbrowser

from PySide6.QtCore import QPoint, QRect, QSize, Qt, QTimer
from PySide6.QtGui import QCloseEvent, QColor, QIcon, QMouseEvent, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QSlider,
    QSystemTrayIcon,
    QVBoxLayout,
    QWidget,
)

from alert_manager import AlertManager, AlertMode
from minimap_detector import MinimapRegion
from settings import MinimapRect, RegionStore, SavedRegion, Settings
from tracker import BeamStatus, BeamTracker, get_screen_resolution
from ui.alert_overlay import AlertOverlay
from ui.beam_status_widget import BeamStatusWidget
from ui.setup_overlay import MinimapSetupOverlay
from ui.styles import (
    CARD_BORDER,
    PURPLE,
    SUCCESS_GREEN,
    SURFACE,
    TEXT_PRIMARY,
    TEXT_SECONDARY,
    TEXT_TERTIARY,
)
from ui.tray_icon import TrayIcon

logger = logging.getLogger(__name__)

POLL_INTERVAL_MS = 33
STATUS_CHECK_INTERVAL_MS = 2000


# -- Helpers ---------------------------------------------------------------

def _section_header(text: str) -> QLabel:
    lbl = QLabel(text.upper())
    lbl.setProperty("class", "section")
    return lbl


def _divider() -> QFrame:
    line = QFrame()
    line.setFrameShape(QFrame.Shape.HLine)
    line.setFixedHeight(1)
    line.setStyleSheet(f"background-color: {CARD_BORDER}; border: none;")
    return line


def _spacer(h: int = 8) -> QWidget:
    w = QWidget()
    w.setFixedHeight(h)
    w.setStyleSheet("background: transparent;")
    return w


# -- Custom title bar ------------------------------------------------------

class _TitleBar(QWidget):

    def __init__(self, parent: QMainWindow) -> None:
        super().__init__(parent)
        self._window = parent
        self._drag_pos: QPoint | None = None
        self.setFixedHeight(90)
        self.setStyleSheet("background: transparent;")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(24, 0, 8, 0)
        layout.setSpacing(0)

        self._icon_label = QLabel()
        favicon = MainWindow._favicon_pixmap(56)
        if not favicon.isNull():
            self._icon_label.setPixmap(favicon)
        self._icon_label.setFixedSize(60, 60)
        self._icon_label.setStyleSheet("background: transparent;")
        layout.addWidget(self._icon_label)
        layout.addSpacing(12)

        self._title_label = QLabel("Mapavlov")
        self._title_label.setStyleSheet(
            f"font-size: 28px; font-weight: 700; color: {TEXT_PRIMARY};"
        )
        layout.addWidget(self._title_label)
        layout.addStretch()

        btn_css = (
            "QPushButton {{ background: transparent; border: none; "
            f"color: {TEXT_TERTIARY}; font-size: 15px; "
            "padding: 0; min-width: 36px; min-height: 36px; }}"
            "QPushButton:hover {{ color: {hover}; background: {bg}; "
            "border-radius: 6px; }}"
        )
        for symbol, hover, bg, slot in [
            ("\u2013", TEXT_PRIMARY, "#2A2D35", parent.showMinimized),
            ("\u25A1", TEXT_PRIMARY, "#2A2D35", self._toggle_max),
            ("\u2715", "#FFF", "#E53935", parent.close),
        ]:
            btn = QPushButton(symbol)
            btn.setStyleSheet(btn_css.format(hover=hover, bg=bg))
            btn.clicked.connect(slot)
            layout.addWidget(btn)

    def _toggle_max(self) -> None:
        if self._window.isMaximized():
            self._window.showNormal()
        else:
            self._window.showMaximized()

    def mousePressEvent(self, ev: QMouseEvent) -> None:
        if ev.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = ev.globalPosition().toPoint() - self._window.frameGeometry().topLeft()

    def mouseMoveEvent(self, ev: QMouseEvent) -> None:
        if self._drag_pos and ev.buttons() & Qt.MouseButton.LeftButton:
            self._window.move(ev.globalPosition().toPoint() - self._drag_pos)

    def mouseReleaseEvent(self, ev: QMouseEvent) -> None:
        self._drag_pos = None

    def mouseDoubleClickEvent(self, ev: QMouseEvent) -> None:
        self._toggle_max()


# -- Main window -----------------------------------------------------------

class MainWindow(QMainWindow):

    def __init__(self, tracker: BeamTracker, settings: Settings, debug: bool = False) -> None:
        super().__init__()
        self._tracker = tracker
        self._settings = settings
        self._debug = debug
        self._region_store = RegionStore()

        self._training_active = False
        self._last_minimap_glance = 0.0
        self._current_beam_status = BeamStatus.NOT_RUNNING
        self._current_minimap_region: MinimapRegion | None = None

        # Session stats (reset each training run)
        self._session_start: float = 0.0
        self._glance_count: int = 0
        self._total_glance_time: float = 0.0
        self._last_glance_entered: float = 0.0
        self._in_region: bool = False

        screen_w, screen_h = get_screen_resolution()
        self._physical_screen_w = screen_w
        self._physical_screen_h = screen_h

        self._setup_window()
        screen = self.screen()
        self._dpr = screen.devicePixelRatio() if screen else 1.0
        self._screen_width = int(screen_w / self._dpr)
        self._screen_height = int(screen_h / self._dpr)

        self._build_ui()
        self._create_alert_system()
        self._create_tray_icon()
        self._create_timers()
        self._load_settings_into_ui()
        self._tracker.attempt_auto_start()

    # ==================================================================
    # Window
    # ==================================================================

    def _setup_window(self) -> None:
        self.setWindowTitle("Mapavlov")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.setMinimumSize(380, 560)
        self.resize(420, 700)
        self.setWindowIcon(self._app_icon())

    @staticmethod
    def _favicon_path() -> str:
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "images", "Mapavlov Favicon.svg",
        )

    @classmethod
    def _app_icon(cls) -> QIcon:
        svg_path = cls._favicon_path()
        if os.path.isfile(svg_path):
            return QIcon(svg_path)
        from PySide6.QtGui import QPainter, QBrush
        px = QPixmap(64, 64)
        px.fill(Qt.GlobalColor.transparent)
        p = QPainter(px)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setBrush(QBrush(QColor(PURPLE)))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(4, 4, 56, 56, 14, 14)
        p.setPen(QColor("white"))
        f = p.font(); f.setPixelSize(34); f.setBold(True); p.setFont(f)
        p.drawText(px.rect(), Qt.AlignmentFlag.AlignCenter, "M")
        p.end()
        return QIcon(px)

    @classmethod
    def _favicon_pixmap(cls, size: int = 20) -> QPixmap:
        """Render the SVG favicon to a QPixmap at the given size."""
        svg_path = cls._favicon_path()
        if os.path.isfile(svg_path):
            from PySide6.QtGui import QPainter
            renderer = QSvgRenderer(svg_path)
            px = QPixmap(QSize(size, size))
            px.fill(Qt.GlobalColor.transparent)
            p = QPainter(px)
            renderer.render(p)
            p.end()
            return px
        return QPixmap()

    # ==================================================================
    # UI
    # ==================================================================

    def _build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)
        outer = QVBoxLayout(central)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        self._title_bar = _TitleBar(self)
        outer.addWidget(self._title_bar)

        content = QWidget()
        root = QVBoxLayout(content)
        root.setContentsMargins(28, 8, 28, 18)
        root.setSpacing(0)
        outer.addWidget(content, stretch=1)

        # -- Region -------------------------------------------------------
        root.addWidget(_section_header("Region"))
        root.addWidget(_spacer(10))

        combo_row = QHBoxLayout()
        combo_row.setSpacing(8)
        self._saved_combo = QComboBox()
        self._saved_combo.setToolTip(
            "Select a saved screen region, or choose \"New region\" to create one"
        )
        self._saved_combo.currentIndexChanged.connect(self._on_saved_region_selected)
        combo_row.addWidget(self._saved_combo, stretch=1)
        root.addLayout(combo_row)
        root.addWidget(_spacer(8))

        # New-region panel (name + select + save)
        self._new_region_panel = QWidget()
        self._new_region_panel.setStyleSheet("background: transparent;")
        nr = QVBoxLayout(self._new_region_panel)
        nr.setContentsMargins(0, 0, 0, 0)
        nr.setSpacing(8)

        self._set_region_btn = QPushButton("Select on screen")
        self._set_region_btn.setToolTip(
            "Opens a full-screen overlay.\n"
            "Click and drag to mark the region, then press Enter."
        )
        self._set_region_btn.setMinimumHeight(40)
        self._set_region_btn.clicked.connect(self._open_region_overlay)
        nr.addWidget(self._set_region_btn)

        name_row = QHBoxLayout()
        name_row.setSpacing(8)
        self._region_name_input = QLineEdit()
        self._region_name_input.setPlaceholderText("Name this region...")
        self._region_name_input.setMaxLength(40)
        self._region_name_input.setToolTip("A label for this region (e.g. LoL, Dota 2)")
        self._region_name_input.textChanged.connect(self._on_region_name_changed)
        name_row.addWidget(self._region_name_input, stretch=1)
        self._save_region_btn = QPushButton("Save")
        self._save_region_btn.setToolTip("Save this region so you can use it again later")
        self._save_region_btn.setEnabled(False)
        self._save_region_btn.setFixedHeight(38)
        self._save_region_btn.clicked.connect(self._on_save_region)
        name_row.addWidget(self._save_region_btn)
        nr.addLayout(name_row)
        root.addWidget(self._new_region_panel)

        # Inline actions for saved regions
        self._saved_actions = QWidget()
        self._saved_actions.setStyleSheet("background: transparent;")
        sa = QHBoxLayout(self._saved_actions)
        sa.setContentsMargins(0, 0, 0, 0)
        sa.setSpacing(0)
        self._edit_btn = QPushButton("Edit region")
        self._edit_btn.setStyleSheet(
            f"border: none; background: transparent; color: {TEXT_SECONDARY}; "
            f"font-size: 12px; padding: 4px 0;"
        )
        self._edit_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._edit_btn.setToolTip("Redefine this region on screen")
        self._edit_btn.clicked.connect(self._open_region_overlay)
        sa.addWidget(self._edit_btn)

        dot_lbl = QLabel("\u00b7")
        dot_lbl.setStyleSheet(f"color: {TEXT_TERTIARY}; font-size: 12px; padding: 0 6px;")
        sa.addWidget(dot_lbl)

        self._delete_btn = QPushButton("Delete")
        self._delete_btn.setStyleSheet(
            f"border: none; background: transparent; color: {TEXT_SECONDARY}; "
            f"font-size: 12px; padding: 4px 0;"
        )
        self._delete_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._delete_btn.setToolTip("Remove this saved region")
        self._delete_btn.clicked.connect(self._on_delete_region)
        sa.addWidget(self._delete_btn)

        dot_lbl2 = QLabel("\u00b7")
        dot_lbl2.setStyleSheet(f"color: {TEXT_TERTIARY}; font-size: 12px; padding: 0 6px;")
        sa.addWidget(dot_lbl2)

        self._new_btn = QPushButton("+ New")
        self._new_btn.setStyleSheet(
            f"border: none; background: transparent; color: {PURPLE}; "
            f"font-size: 12px; padding: 4px 0; font-weight: 600;"
        )
        self._new_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._new_btn.setToolTip("Create a new region")
        self._new_btn.clicked.connect(self._switch_to_new_region)
        sa.addWidget(self._new_btn)
        sa.addStretch()
        root.addWidget(self._saved_actions)

        root.addWidget(_spacer(14))
        root.addWidget(_divider())
        root.addWidget(_spacer(14))

        # -- Settings -----------------------------------------------------
        root.addWidget(_section_header("Settings"))
        root.addWidget(_spacer(12))

        self._build_slider_row(
            root, "Alarm timeout",
            "How many seconds you can look away before the alert fires.\nLower = stricter training.",
            5, 300, int(self._settings.timeout_seconds * 10),
        )
        self._timeout_slider = self._last_slider
        self._timeout_label = self._last_value_label
        self._timeout_slider.valueChanged.connect(self._on_timeout_changed)
        root.addWidget(_spacer(12))

        self._build_slider_row(
            root, "Volume",
            "Alert sound volume. Set to 0 to mute.",
            0, 100, self._settings.volume,
        )
        self._volume_slider = self._last_slider
        self._volume_label = self._last_value_label
        self._volume_slider.valueChanged.connect(self._on_volume_changed)
        root.addWidget(_spacer(12))

        # Alert type (with Silent)
        mode_row = QHBoxLayout()
        mode_lbl = QLabel("Alert type")
        mode_lbl.setToolTip(
            "Choose how Mapavlov reminds you to check the minimap:\n\n"
            "Audio: plays an alarm sound\n"
            "Visual: flashes an overlay on the region\n"
            "Silent: no alerts at all, just tracks your stats\n\n"
            "You can combine Audio and Visual.\n"
            "Pick Silent if you only want to measure your awareness."
        )
        mode_row.addWidget(mode_lbl)
        mode_row.addStretch()

        self._mode_buttons: list[QPushButton] = []
        for label in ("Audio", "Visual", "Silent"):
            btn = QPushButton(label)
            btn.setProperty("class", "toggle")
            btn.setCheckable(True)
            btn.setToolTip({
                "Audio": "Play an alarm sound",
                "Visual": "Flash an overlay on the region",
                "Silent": "No alerts, track stats only",
            }[label])
            btn.clicked.connect(self._on_alert_mode_changed)
            mode_row.addWidget(btn)
            mode_row.addSpacing(4)
            self._mode_buttons.append(btn)

        self._audio_btn, self._visual_btn, self._silent_btn = self._mode_buttons
        self._audio_btn.setChecked(self._settings.alert_mode.audio)
        self._visual_btn.setChecked(self._settings.alert_mode.visual)
        if not self._settings.alert_mode.audio and not self._settings.alert_mode.visual:
            self._silent_btn.setChecked(True)
        root.addLayout(mode_row)
        root.addWidget(_spacer(12))

        self._build_slider_row(
            root, "Detection margin",
            "Adds an invisible border around the region to compensate\n"
            "for eye-tracking inaccuracy. Higher = more forgiving.",
            0, 30, int(self._settings.gaze_tolerance),
        )
        self._tolerance_slider = self._last_slider
        self._tolerance_label = self._last_value_label
        self._tolerance_slider.valueChanged.connect(self._on_tolerance_changed)

        root.addWidget(_spacer(20))

        # -- Start button -------------------------------------------------
        self._start_btn = QPushButton("Select a Region to Begin")
        self._start_btn.setObjectName("startButton")
        self._start_btn.setMinimumHeight(50)
        self._start_btn.setEnabled(False)
        self._start_btn.clicked.connect(self._toggle_training)
        root.addWidget(self._start_btn)

        root.addWidget(_spacer(10))

        # -- Statistics (collapsible) -------------------------------------
        self._stats_toggle = QPushButton("Statistics  (powered by the Beam Eye Tracker)  \u25B8")
        self._stats_toggle.setStyleSheet(
            f"border: none; background: transparent; color: {TEXT_SECONDARY}; "
            f"font-size: 12px; font-weight: 600; padding: 4px 0; text-align: left;"
        )
        self._stats_toggle.setCursor(Qt.CursorShape.PointingHandCursor)
        self._stats_toggle.clicked.connect(self._toggle_stats)
        root.addWidget(self._stats_toggle)

        self._stats_panel = QWidget()
        self._stats_panel.setVisible(False)
        self._stats_panel.setStyleSheet("background: transparent;")
        sp = QVBoxLayout(self._stats_panel)
        sp.setContentsMargins(0, 14, 0, 8)
        sp.setSpacing(8)

        self._stat_labels: dict[str, QLabel] = {}
        for key, label in [
            ("duration", "Session duration"),
            ("glances", "Map glances"),
            ("rate", "Glances / min"),
            ("avg_gap", "Avg. time between glances"),
            ("map_time", "Time on map"),
        ]:
            row = QHBoxLayout()
            row.setContentsMargins(0, 0, 0, 0)
            name_lbl = QLabel(label)
            name_lbl.setStyleSheet(f"font-size: 12px; color: {TEXT_PRIMARY};")
            row.addWidget(name_lbl)
            row.addStretch()
            val_lbl = QLabel("-")
            val_lbl.setStyleSheet(f"font-size: 12px; color: {TEXT_PRIMARY}; font-weight: 600;")
            row.addWidget(val_lbl)
            sp.addLayout(row)
            self._stat_labels[key] = val_lbl

        sp.addWidget(_spacer(10))

        self._share_btn = QPushButton("Share on Reddit")
        self._share_btn.setStyleSheet(
            f"border: 1px solid {CARD_BORDER}; background: transparent; "
            f"color: {TEXT_SECONDARY}; font-size: 11px; font-weight: 600; "
            f"padding: 6px 14px; border-radius: 6px;"
        )
        self._share_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._share_btn.setToolTip("Share your session stats on Reddit")
        self._share_btn.clicked.connect(self._share_to_reddit)
        sp.addWidget(self._share_btn)

        root.addWidget(self._stats_panel)

        # Debug
        self._debug_label = QLabel("")
        self._debug_label.setStyleSheet(f"color: {TEXT_TERTIARY}; font-size: 10px;")
        self._debug_label.setVisible(self._debug)
        root.addWidget(self._debug_label)

        root.addStretch()

        # -- Beam status ---------------------------------------------------
        self._status_widget = BeamStatusWidget()
        root.addWidget(self._status_widget)

        self._update_slider_labels()
        self._update_region_ui()

    def _build_slider_row(self, parent: QVBoxLayout, label: str, tooltip: str,
                          min_v: int, max_v: int, value: int) -> None:
        header = QHBoxLayout()
        header.setContentsMargins(0, 0, 0, 0)
        lbl = QLabel(label)
        lbl.setToolTip(tooltip)
        header.addWidget(lbl)
        header.addStretch()
        val_lbl = QLabel()
        val_lbl.setProperty("class", "value")
        val_lbl.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        header.addWidget(val_lbl)
        parent.addLayout(header)
        parent.addSpacing(4)
        slider = QSlider(Qt.Orientation.Horizontal)
        slider.setRange(min_v, max_v)
        slider.setValue(value)
        slider.setToolTip(tooltip)
        parent.addWidget(slider)
        self._last_slider = slider
        self._last_value_label = val_lbl

    # ==================================================================
    # Alert system
    # ==================================================================

    def _create_alert_system(self) -> None:
        self._alert_manager = AlertManager(self)
        self._alert_overlay = AlertOverlay()
        self._alert_manager.visual_alert_started.connect(self._show_visual_alert)
        self._alert_manager.visual_alert_stopped.connect(self._alert_overlay.stop_flash)
        self._alert_manager.set_volume(self._settings.volume)
        self._apply_alert_mode()
        self._setup_overlay = MinimapSetupOverlay()
        self._setup_overlay.region_selected.connect(self._on_region_selected)

    def _apply_alert_mode(self) -> None:
        a = self._audio_btn.isChecked()
        v = self._visual_btn.isChecked()
        s = self._silent_btn.isChecked()
        if s:
            self._alert_manager.set_mode(AlertMode.SILENT)
        elif a and v:
            self._alert_manager.set_mode(AlertMode.BOTH)
        elif a:
            self._alert_manager.set_mode(AlertMode.AUDIO)
        elif v:
            self._alert_manager.set_mode(AlertMode.VISUAL)
        else:
            self._alert_manager.set_mode(AlertMode.SILENT)

    def _show_visual_alert(self) -> None:
        r = self._current_minimap_region
        if r:
            self._alert_overlay.flash_at(QRect(r.x, r.y, r.width, r.height))

    # ==================================================================
    # Tray
    # ==================================================================

    def _create_tray_icon(self) -> None:
        self._tray = TrayIcon(self._app_icon(), self)
        self._tray.show_requested.connect(self._show_from_tray)
        self._tray.toggle_training.connect(self._toggle_training)
        self._tray.quit_requested.connect(self._quit_app)
        self._tray.show()

    def _show_from_tray(self) -> None:
        self.showNormal(); self.activateWindow(); self.raise_()

    def _quit_app(self) -> None:
        self._stop_training(); self._tray.hide(); QApplication.quit()

    # ==================================================================
    # Timers
    # ==================================================================

    def _create_timers(self) -> None:
        self._poll_timer = QTimer(self)
        self._poll_timer.timeout.connect(self._poll_gaze)
        self._status_timer = QTimer(self)
        self._status_timer.timeout.connect(self._check_beam_status)
        self._status_timer.start(STATUS_CHECK_INTERVAL_MS)
        QTimer.singleShot(500, self._check_beam_status)
        self._stats_timer = QTimer(self)
        self._stats_timer.timeout.connect(self._refresh_stats)

    # ==================================================================
    # Settings / UI
    # ==================================================================

    def _load_settings_into_ui(self) -> None:
        self._refresh_saved_combo()
        rect = self._settings.minimap_rect
        if rect.is_set:
            self._current_minimap_region = MinimapRegion(
                x=rect.x, y=rect.y, width=rect.width, height=rect.height,
            )
        name = self._settings.region_name
        self._region_name_input.setText(name)
        if name:
            idx = self._saved_combo.findText(name)
            if idx >= 0:
                self._saved_combo.blockSignals(True)
                self._saved_combo.setCurrentIndex(idx)
                self._saved_combo.blockSignals(False)
        self._update_region_ui()
        self._update_slider_labels()

    def _save_settings(self) -> None:
        self._settings.timeout_seconds = self._timeout_slider.value() / 10.0
        self._settings.volume = self._volume_slider.value()
        self._settings.gaze_tolerance = float(self._tolerance_slider.value())
        self._settings.alert_mode.audio = self._audio_btn.isChecked()
        self._settings.alert_mode.visual = self._visual_btn.isChecked()
        self._settings.region_name = self._region_name_input.text().strip()
        r = self._current_minimap_region
        if r:
            self._settings.minimap_rect = MinimapRect(x=r.x, y=r.y, width=r.width, height=r.height)
        self._settings.first_run = False
        self._settings.save()

    # ==================================================================
    # Region management
    # ==================================================================

    def _refresh_saved_combo(self) -> None:
        self._saved_combo.blockSignals(True)
        self._saved_combo.clear()
        self._saved_combo.addItem("New region", None)
        for r in self._region_store.regions:
            self._saved_combo.addItem(r.name, r.name)
        self._saved_combo.blockSignals(False)

    def _on_saved_region_selected(self, index: int) -> None:
        name = self._saved_combo.currentData()
        if name is None:
            self._current_minimap_region = None
            self._region_name_input.clear()
        else:
            region = self._region_store.get(name)
            if region:
                self._current_minimap_region = MinimapRegion(
                    x=region.x, y=region.y, width=region.width, height=region.height,
                )
                self._region_name_input.setText(region.name)
                self._save_settings()
                logger.info("Loaded saved region: %s", name)
        self._update_region_ui()

    def _on_save_region(self) -> None:
        name = self._region_name_input.text().strip()
        r = self._current_minimap_region
        if not name or not r:
            return
        self._region_store.add(SavedRegion(name=name, x=r.x, y=r.y, width=r.width, height=r.height))
        self._refresh_saved_combo()
        idx = self._saved_combo.findText(name)
        if idx >= 0:
            self._saved_combo.blockSignals(True)
            self._saved_combo.setCurrentIndex(idx)
            self._saved_combo.blockSignals(False)
        self._update_region_ui()
        self._save_settings()
        logger.info("Saved region: %s", name)

    def _on_delete_region(self) -> None:
        name = self._saved_combo.currentData()
        if not name:
            return
        self._region_store.delete(name)
        self._refresh_saved_combo()
        self._saved_combo.setCurrentIndex(0)
        self._update_region_ui()
        logger.info("Deleted region: %s", name)

    def _switch_to_new_region(self) -> None:
        self._saved_combo.setCurrentIndex(0)

    def _open_region_overlay(self) -> None:
        if self._current_minimap_region:
            r = self._current_minimap_region
            self._setup_overlay.set_initial_region(QRect(r.x, r.y, r.width, r.height))
        self._setup_overlay.set_margin(
            float(self._tolerance_slider.value()), self._screen_width,
        )
        self._setup_overlay.showFullScreen()

    def _on_region_selected(self, rect: QRect) -> None:
        self._current_minimap_region = MinimapRegion(
            x=rect.x(), y=rect.y(), width=rect.width(), height=rect.height(),
        )
        self._update_region_ui()
        self._save_settings()
        logger.info("Region set: (%d,%d) %dx%d", rect.x(), rect.y(), rect.width(), rect.height())
        if not self._region_name_input.text().strip():
            self._region_name_input.setFocus()

    def _on_region_name_changed(self, text: str) -> None:
        self._update_region_ui()
        self._save_settings()

    def _update_region_ui(self) -> None:
        is_saved = self._saved_combo.currentData() is not None
        has_region = (self._current_minimap_region is not None
                      and self._current_minimap_region.width > 0)
        has_name = bool(self._region_name_input.text().strip())

        self._new_region_panel.setVisible(not is_saved)
        self._saved_actions.setVisible(is_saved)
        self._save_region_btn.setEnabled(has_region and has_name and not is_saved)

        ready = has_region and (has_name or is_saved)
        if not self._training_active:
            self._start_btn.setEnabled(ready)
            self._start_btn.setText("Start Training" if ready else "Select a Region to Begin")

        self._start_btn.style().unpolish(self._start_btn)
        self._start_btn.style().polish(self._start_btn)

    # ==================================================================
    # Slider / mode slots
    # ==================================================================

    def _on_timeout_changed(self, v: int) -> None:
        self._update_slider_labels(); self._save_settings()

    def _on_volume_changed(self, v: int) -> None:
        self._alert_manager.set_volume(v); self._update_slider_labels(); self._save_settings()

    def _on_tolerance_changed(self, v: int) -> None:
        self._update_slider_labels(); self._save_settings()

    def _on_alert_mode_changed(self) -> None:
        sender = self.sender()
        if sender == self._silent_btn and self._silent_btn.isChecked():
            self._audio_btn.setChecked(False)
            self._visual_btn.setChecked(False)
        elif sender in (self._audio_btn, self._visual_btn):
            self._silent_btn.setChecked(False)
            if not self._audio_btn.isChecked() and not self._visual_btn.isChecked():
                self._silent_btn.setChecked(True)
        self._apply_alert_mode()
        self._save_settings()

    def _update_slider_labels(self) -> None:
        self._timeout_label.setText(f"{self._timeout_slider.value() / 10.0:.1f}s")
        self._volume_label.setText(f"{self._volume_slider.value()}%")
        self._tolerance_label.setText(f"{self._tolerance_slider.value()}%")

    # ==================================================================
    # Stats
    # ==================================================================

    _STATS_EXPAND_PX = 220

    def _toggle_stats(self) -> None:
        vis = self._stats_panel.isHidden()
        self._stats_panel.setVisible(vis)
        self._stats_toggle.setText(
            "Statistics  (powered by the Beam Eye Tracker)  \u25BE"
            if vis else
            "Statistics  (powered by the Beam Eye Tracker)  \u25B8"
        )
        delta = self._STATS_EXPAND_PX if vis else -self._STATS_EXPAND_PX
        self.resize(self.width(), self.height() + delta)

    def _refresh_stats(self) -> None:
        if not self._training_active:
            return
        elapsed = time.time() - self._session_start
        mins = elapsed / 60.0

        self._stat_labels["duration"].setText(self._fmt_duration(elapsed))
        self._stat_labels["glances"].setText(str(self._glance_count))

        rate = (self._glance_count / mins) if mins > 0 else 0
        self._stat_labels["rate"].setText(f"{rate:.1f}")

        avg_gap = (elapsed / self._glance_count) if self._glance_count > 0 else 0
        self._stat_labels["avg_gap"].setText(f"{avg_gap:.1f}s")

        pct = (self._total_glance_time / elapsed * 100) if elapsed > 0 else 0
        self._stat_labels["map_time"].setText(f"{pct:.1f}%")

    @staticmethod
    def _fmt_duration(s: float) -> str:
        m, sec = divmod(int(s), 60)
        h, m = divmod(m, 60)
        return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"

    def _reset_stats(self) -> None:
        self._session_start = time.time()
        self._glance_count = 0
        self._total_glance_time = 0.0
        self._last_glance_entered = 0.0
        self._in_region = False
        for lbl in self._stat_labels.values():
            lbl.setText("-")

    def _share_to_reddit(self) -> None:
        """Open Reddit submit page with pre-filled stats summary."""
        dur = self._stat_labels["duration"].text()
        glances = self._stat_labels["glances"].text()
        rate = self._stat_labels["rate"].text()
        avg = self._stat_labels["avg_gap"].text()
        pct = self._stat_labels["map_time"].text()

        title = (
            f"My Mapavlov session: {glances} map glances, "
            f"{rate}/min, {pct} time on map "
            f"(powered by the Beam Eye Tracker)"
        )
        url = "https://beameyetracker.com"
        reddit_url = (
            f"https://www.reddit.com/submit"
            f"?url={urllib.parse.quote(url, safe='')}"
            f"&title={urllib.parse.quote(title, safe='')}"
        )
        webbrowser.open(reddit_url)

    # ==================================================================
    # Training
    # ==================================================================

    def _toggle_training(self) -> None:
        if self._training_active:
            self._stop_training()
        else:
            self._start_training()

    def _start_training(self) -> None:
        if not self._current_minimap_region:
            return
        self._training_active = True
        self._last_minimap_glance = time.time()
        self._alert_manager.stop()
        self._reset_stats()

        if self._tracker.get_status() != BeamStatus.TRACKING:
            self._tracker.attempt_auto_start()

        self._poll_timer.start(POLL_INTERVAL_MS)
        self._stats_timer.start(1000)

        self._start_btn.setText("Stop Training")
        self._start_btn.setEnabled(True)
        self._start_btn.setStyleSheet(
            "background-color: #E53935; color: white; border: none; "
            "border-radius: 12px; padding: 16px 32px; font-size: 15px; font-weight: 700;"
        )
        self._set_controls_enabled(False)
        self._tray.set_training_state(True)
        self._save_settings()
        logger.info("Training started")

    def _stop_training(self) -> None:
        if self._in_region:
            self._total_glance_time += time.time() - self._last_glance_entered
            self._in_region = False
        self._training_active = False
        self._poll_timer.stop()
        self._stats_timer.stop()
        self._alert_manager.stop()
        self._refresh_stats()

        self._start_btn.setStyleSheet("")
        self._set_controls_enabled(True)
        self._update_region_ui()
        self._tray.set_training_state(False)
        self._debug_label.setText("")
        logger.info("Training stopped")

    def _set_controls_enabled(self, enabled: bool) -> None:
        self._set_region_btn.setEnabled(enabled)
        self._region_name_input.setEnabled(enabled)
        self._saved_combo.setEnabled(enabled)
        self._save_region_btn.setEnabled(enabled)
        self._timeout_slider.setEnabled(enabled)
        self._tolerance_slider.setEnabled(enabled)

    # ==================================================================
    # Gaze polling
    # ==================================================================

    def _poll_gaze(self) -> None:
        gaze = self._tracker.get_gaze()

        if gaze is None or not gaze.is_usable:
            if self._tracker.seconds_since_last_good_gaze > 3.0:
                self._last_minimap_glance = time.time()
                if self._alert_manager.is_active:
                    self._alert_manager.stop()
            if self._in_region:
                self._total_glance_time += time.time() - self._last_glance_entered
                self._in_region = False
            return

        gaze_x = gaze.x / self._dpr
        gaze_y = gaze.y / self._dpr

        region = self._get_current_region_with_tolerance()
        in_now = region is not None and region.contains(gaze_x, gaze_y)

        if in_now and not self._in_region:
            self._glance_count += 1
            self._last_glance_entered = time.time()
            self._in_region = True
        elif not in_now and self._in_region:
            self._total_glance_time += time.time() - self._last_glance_entered
            self._in_region = False

        if in_now:
            self._last_minimap_glance = time.time()
            if self._alert_manager.is_active:
                self._alert_manager.stop()

        timeout = self._timeout_slider.value() / 10.0
        elapsed = time.time() - self._last_minimap_glance
        if elapsed > timeout and not self._alert_manager.is_active:
            self._alert_manager.trigger()

        if self._debug:
            self._debug_label.setText(
                f"Gaze: ({gaze_x:.0f}, {gaze_y:.0f}) "
                f"[phys {gaze.x:.0f},{gaze.y:.0f}] dpr={self._dpr}"
            )

    # ==================================================================
    # Beam status
    # ==================================================================

    def _check_beam_status(self) -> None:
        status = self._tracker.get_status()
        if status != self._current_beam_status:
            self._current_beam_status = status
            self._status_widget.set_status(status)
            logger.info("Beam status: %s", status.value)
            if status == BeamStatus.NOT_RUNNING and self._tracker._sdk_available:
                self._tracker.attempt_auto_start()

    # ==================================================================
    # Helpers
    # ==================================================================

    def _get_current_region_with_tolerance(self) -> MinimapRegion | None:
        r = self._current_minimap_region
        if r is None:
            return None
        tol = float(self._tolerance_slider.value())
        return r.with_tolerance(tol, self._screen_width) if tol > 0 else r

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._tray.isVisible():
            self.hide()
            self._tray.showMessage(
                "Mapavlov", "Running in background.",
                QSystemTrayIcon.MessageIcon.Information, 2000,
            )
            event.ignore()
        else:
            self._quit_app()
            event.accept()
