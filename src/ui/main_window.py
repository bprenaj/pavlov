"""MapSense main window."""

from __future__ import annotations

import logging
import math
import os
import shutil
import time
import urllib.parse
import webbrowser

from PySide6.QtCore import QEvent, QObject, QPoint, QRect, QSize, Qt, QTimer
from PySide6.QtGui import QCloseEvent, QColor, QIcon, QMouseEvent, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QFileDialog,
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
from irl_webhook import IRLWebhook
from minimap_detector import MinimapRegion
from session_history import SessionHistory, SessionRecord, compute_mas
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

DISCORD_URL = "https://discord.gg/khk2dq8Bj3"

logger = logging.getLogger(__name__)

POLL_INTERVAL_MS = 33
STATUS_CHECK_INTERVAL_MS = 2000


# -- Tooltip positioning filter -------------------------------------------

class _TooltipBelow(QObject):
    """Repositions tooltips so they appear below the widget, not on top."""

    def eventFilter(self, obj: QObject, event: QEvent) -> bool:
        if event.type() == QEvent.Type.ToolTip:
            from PySide6.QtWidgets import QToolTip
            widget = obj
            if hasattr(widget, "toolTip") and widget.toolTip():
                pos = widget.mapToGlobal(QPoint(0, widget.height() + 4))
                QToolTip.showText(pos, widget.toolTip(), widget)
                return True
        return super().eventFilter(obj, event)


_tooltip_filter: _TooltipBelow | None = None


def _get_tooltip_filter() -> _TooltipBelow:
    global _tooltip_filter
    if _tooltip_filter is None:
        _tooltip_filter = _TooltipBelow()
    return _tooltip_filter


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


def _enable_tooltip_below(widget: QWidget) -> None:
    """Mark a widget for hover styling and below-widget tooltip positioning."""
    widget.setProperty("hasTooltip", True)
    widget.installEventFilter(_get_tooltip_filter())


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

        self._title_label = QLabel("MapSense")
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
        self._alert_count: int = 0
        self._longest_gap: float = 0.0
        self._gap_times: list[float] = []
        self._last_gap_start: float = 0.0
        self._alert_free_start: float = 0.0
        self._best_alert_free: float = 0.0
        self._glance_durations: list[float] = []

        self._session_history = SessionHistory()
        self._irl_webhook = IRLWebhook()

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

        if self._settings.first_run:
            QTimer.singleShot(300, self._show_onboarding)

    # ==================================================================
    # Window
    # ==================================================================

    def _setup_window(self) -> None:
        self.setWindowTitle("MapSense")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.setMinimumWidth(480)
        self.resize(520, 100)
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
        root.setContentsMargins(28, 0, 28, 18)
        root.setSpacing(0)
        outer.addWidget(content)

        # -- Beam status (top) --------------------------------------------
        self._status_widget = BeamStatusWidget()
        root.addWidget(self._status_widget)
        root.addWidget(_spacer(16))

        # -- Minimap Region -----------------------------------------------
        root.addWidget(_section_header("Minimap Region"))
        root.addWidget(_spacer(10))

        # Primary CTA for first-time users (no region yet)
        self._region_cta = QPushButton("Select zone on screen")
        self._region_cta.setObjectName("startButton")
        self._region_cta.setMinimumHeight(50)
        self._region_cta.setToolTip(
            "Opens a full-screen overlay.\n"
            "Click and drag to mark your minimap, then press Enter to confirm."
        )
        self._region_cta.clicked.connect(self._open_region_overlay)
        root.addWidget(self._region_cta)
        root.addWidget(_spacer(6))

        self._region_cta_hint = QLabel("Mark the minimap area on your screen to get started")
        self._region_cta_hint.setStyleSheet(
            f"font-size: 11px; color: {TEXT_TERTIARY};"
        )
        self._region_cta_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self._region_cta_hint)

        # Returning-user region management (combo + actions)
        self._region_manager = QWidget()
        self._region_manager.setStyleSheet("background: transparent;")
        rm = QVBoxLayout(self._region_manager)
        rm.setContentsMargins(0, 0, 0, 0)
        rm.setSpacing(0)

        combo_row = QHBoxLayout()
        combo_row.setSpacing(8)
        self._saved_combo = QComboBox()
        self._saved_combo.setToolTip(
            "Select a saved screen region, or choose \"New region\" to create one"
        )
        self._saved_combo.currentIndexChanged.connect(self._on_saved_region_selected)
        combo_row.addWidget(self._saved_combo, stretch=1)
        rm.addLayout(combo_row)
        rm.addSpacing(8)

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
        rm.addWidget(self._new_region_panel)

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
        rm.addWidget(self._saved_actions)

        root.addWidget(self._region_manager)

        root.addWidget(_spacer(14))
        root.addWidget(_divider())
        root.addWidget(_spacer(14))

        # == Everything below here is inside _config_panel ================
        # Hidden until the user has at least one region.
        self._config_panel = QWidget()
        self._config_panel.setStyleSheet("QWidget { background: transparent; }")
        cp = QVBoxLayout(self._config_panel)
        cp.setContentsMargins(0, 0, 0, 0)
        cp.setSpacing(0)

        # -- Settings -----------------------------------------------------
        cp.addWidget(_section_header("Settings"))
        cp.addWidget(_spacer(12))

        self._build_slider_row(
            cp, "Alarm timeout",
            "How many seconds you can look away before the alert fires.\nLower = stricter training.",
            5, 300, int(self._settings.timeout_seconds * 10),
        )
        self._timeout_slider = self._last_slider
        self._timeout_label = self._last_value_label
        self._timeout_slider.valueChanged.connect(self._on_timeout_changed)
        cp.addWidget(_spacer(12))

        self._build_slider_row(
            cp, "Volume",
            "Alert sound volume. Set to 0 to mute.",
            0, 100, self._settings.volume,
        )
        self._volume_slider = self._last_slider
        self._volume_label = self._last_value_label
        self._volume_slider.valueChanged.connect(self._on_volume_changed)
        cp.addWidget(_spacer(12))

        # Alert type
        mode_lbl = QLabel("Alert type")
        mode_lbl.setToolTip(
            "Choose how MapSense alerts you when you forget the minimap.\n"
            "You can combine Audio, Visual, and IRL.\n"
            "Pick Silent to disable all alerts and only track metrics."
        )
        _enable_tooltip_below(mode_lbl)
        cp.addWidget(mode_lbl)
        cp.addWidget(_spacer(6))

        mode_row = QHBoxLayout()
        mode_row.setSpacing(4)

        _tooltips = {
            "Silent": (
                "No alerts at all. MapSense silently tracks your gaze\n"
                "and records all metrics and your MapSense Score.\n"
                "Use this when you just want to measure your awareness\n"
                "without being interrupted."
            ),
            "Visual": (
                "Flashes a purple overlay on top of the minimap region.\n"
                "Visible even over fullscreen games.\n"
                "Stops flashing the moment you glance at the map."
            ),
            "Audio": (
                "Plays a repeating alarm sound when you forget to check the map.\n"
                "Adjust volume with the slider above.\n"
                "The alarm stops instantly when you look at the minimap."
            ),
            "IRL": (
                "Triggers a physical device when you forget the minimap.\n"
                "MapSense sends HTTP webhooks that your hardware listens for.\n"
                "Build fun projects like LED strips, desk flags, or buzzers."
            ),
        }

        self._mode_buttons: list[QPushButton] = []
        self._custom_btn = None
        for label in ("Silent", "Visual", "Audio", "IRL"):
            btn = QPushButton(label)
            btn.setProperty("class", "toggle")
            btn.setCheckable(True)
            btn.setToolTip(_tooltips[label])
            btn.clicked.connect(self._on_alert_mode_changed)
            mode_row.addWidget(btn)
            self._mode_buttons.append(btn)

        (self._silent_btn, self._visual_btn, self._audio_btn,
         self._irl_btn) = self._mode_buttons
        self._audio_btn.setChecked(self._settings.alert_mode.audio)
        self._visual_btn.setChecked(self._settings.alert_mode.visual)
        if not self._settings.alert_mode.audio and not self._settings.alert_mode.visual:
            self._silent_btn.setChecked(True)
        cp.addLayout(mode_row)
        cp.addWidget(_spacer(4))

        # Sub-links under Audio and IRL
        sub_links = QHBoxLayout()
        sub_links.setContentsMargins(0, 0, 0, 0)
        sub_links.setSpacing(0)

        # Spacer for Silent + Visual columns
        sub_links.addStretch(2)

        # "Custom Sound" under Audio
        audio_sub = QHBoxLayout()
        audio_sub.setSpacing(4)
        self._custom_sound_link = QPushButton("Custom Sound")
        self._custom_sound_link.setStyleSheet(
            f"QPushButton {{ border: none; background: transparent; color: {TEXT_PRIMARY}; "
            f"font-size: 10px; padding: 0; text-decoration: underline; max-width: 90px; }}"
            f"QPushButton:hover {{ color: {PURPLE}; }}"
        )
        self._custom_sound_link.setCursor(Qt.CursorShape.PointingHandCursor)
        self._custom_sound_link.setToolTip(
            "Upload your own alert sound (MP3, WAV, OGG, FLAC).\n"
            "Replaces the default beep. The file is saved across sessions."
        )
        self._custom_sound_link.clicked.connect(self._upload_custom_sound)
        audio_sub.addWidget(self._custom_sound_link)

        self._custom_sound_clear = QPushButton("\u2715")
        self._custom_sound_clear.setStyleSheet(
            f"QPushButton {{ border: none; background: transparent; color: {TEXT_TERTIARY}; "
            f"font-size: 9px; padding: 0 2px; min-width: 12px; }}"
            f"QPushButton:hover {{ color: #FF4444; }}"
        )
        self._custom_sound_clear.setCursor(Qt.CursorShape.PointingHandCursor)
        self._custom_sound_clear.setToolTip("Revert to default alert sound")
        self._custom_sound_clear.setVisible(False)
        self._custom_sound_clear.clicked.connect(self._revert_custom_sound)
        audio_sub.addWidget(self._custom_sound_clear)
        audio_sub.addStretch()
        sub_links.addLayout(audio_sub, stretch=1)

        # "Ask an AI" under IRL
        _chatgpt_prompt = (
            "I am using MapSense (https://beameyetracker.com), a desktop app that trains "
            "minimap awareness for gamers using the Beam Eye Tracker. When I forget to check "
            "my minimap, MapSense sends HTTP POST webhooks from localhost:9876 with JSON body "
            "{\"event\": \"alert_start\"} or {\"event\": \"alert_stop\"}. "
            "It also exposes GET http://localhost:9876/status for polling.\n\n"
            "I want to build a fun, safe, desk-friendly physical alert gadget that lights up "
            "or makes noise when I get a webhook. Give me concise, exact, copy-paste-ready "
            "instructions for:\n"
            "1. Hardware shopping list (Raspberry Pi, Arduino, or ESP32 based)\n"
            "2. Wiring diagram for an LED strip, desk light, small buzzer, or mini flag\n"
            "3. Complete Python or Arduino code that listens for the MapSense webhooks "
            "and activates the hardware\n"
            "4. How to connect the device to MapSense on my local network\n\n"
            "Keep it practical, safe, and implementable in one sitting. "
            "No theory, just step-by-step build instructions."
        )
        irl_sub = QHBoxLayout()
        irl_sub.setSpacing(0)
        self._irl_ai_link = QPushButton("Ask an AI")
        self._irl_ai_link.setStyleSheet(
            f"QPushButton {{ border: none; background: transparent; color: {TEXT_PRIMARY}; "
            f"font-size: 10px; padding: 0; text-decoration: underline; }}"
            f"QPushButton:hover {{ color: {PURPLE}; }}"
        )
        self._irl_ai_link.setCursor(Qt.CursorShape.PointingHandCursor)
        self._irl_ai_link.setToolTip(
            "Opens ChatGPT with a detailed prompt that will give you\n"
            "step-by-step hardware and code instructions for building\n"
            "a fun desk gadget that reacts to MapSense alerts."
        )
        self._irl_ai_link.clicked.connect(
            lambda: webbrowser.open(
                f"https://chatgpt.com/?q={urllib.parse.quote(_chatgpt_prompt)}"
            )
        )
        irl_sub.addWidget(self._irl_ai_link)
        irl_sub.addStretch()
        sub_links.addLayout(irl_sub, stretch=1)

        cp.addLayout(sub_links)
        cp.addWidget(_spacer(12))

        self._build_slider_row(
            cp, "Detection margin",
            "Adds an invisible border around the region to compensate\n"
            "for eye-tracking inaccuracy. Higher = more forgiving.",
            0, 30, int(self._settings.gaze_tolerance),
        )
        self._tolerance_slider = self._last_slider
        self._tolerance_label = self._last_value_label
        self._tolerance_slider.valueChanged.connect(self._on_tolerance_changed)

        cp.addWidget(_spacer(20))

        # -- Start button -------------------------------------------------
        self._start_btn = QPushButton("Start Training")
        self._start_btn.setObjectName("trainButton")
        self._start_btn.setMinimumHeight(50)
        self._start_btn.setEnabled(False)
        self._start_btn.setStyleSheet(
            f"QPushButton {{ background-color: {PURPLE}; color: white; border: none; "
            f"border-radius: 12px; padding: 16px 32px; font-size: 15px; "
            f"font-weight: 700; letter-spacing: 0.3px; }}"
            f"QPushButton:hover {{ background-color: #8F78FF; }}"
            f"QPushButton:pressed {{ background-color: #6B51EF; }}"
            f"QPushButton:disabled {{ background-color: #1E2030; color: {TEXT_TERTIARY}; }}"
        )
        self._start_btn.clicked.connect(self._toggle_training)
        cp.addWidget(self._start_btn)

        cp.addWidget(_spacer(14))
        cp.addWidget(_divider())
        cp.addWidget(_spacer(14))

        # -- Metrics ------------------------------------------------------
        metrics_header = QHBoxLayout()
        metrics_lbl = QLabel("METRICS")
        metrics_lbl.setStyleSheet(
            f"font-size: 11px; font-weight: 600; color: {TEXT_SECONDARY}; "
            f"letter-spacing: 0.5px;"
        )
        metrics_powered = QLabel("powered by the Beam Eye Tracker")
        metrics_powered.setStyleSheet(f"font-size: 10px; color: {TEXT_TERTIARY};")
        metrics_header.addWidget(metrics_lbl)
        metrics_header.addSpacing(6)
        metrics_header.addWidget(metrics_powered)
        metrics_header.addStretch()
        cp.addLayout(metrics_header)
        cp.addWidget(_spacer(10))

        # MapSense Score hero
        mas_row = QHBoxLayout()
        mas_row.setContentsMargins(0, 0, 0, 0)
        mas_name = QLabel("MapSense Score")
        mas_name.setStyleSheet(
            f"QLabel {{ font-size: 14px; font-weight: 600; color: {TEXT_PRIMARY}; }}"
            f"QToolTip {{ font-size: 12px; font-weight: 400; }}"
        )
        mas_name.setToolTip(
            "Your overall minimap awareness rating from 0 to 100.\n\n"
            "Calculated from four components:\n"
            "  - Check rate (40%): how many times per minute you glance at the map.\n"
            "    Pro players average 6-8 glances/min.\n"
            "  - Response time (25%): how quickly you remember to check the map\n"
            "    after looking away. Lower average gap = higher score.\n"
            "  - Processing speed (20%): how long each glance lasts.\n"
            "    Shorter glances mean faster information extraction, like a pro.\n"
            "  - Consistency (15%): how steady your checking rhythm is.\n"
            "    Low variation between gaps = disciplined habit.\n\n"
            "Score 80+ = excellent. Score 50-80 = good. Below 50 = keep practicing."
        )
        _enable_tooltip_below(mas_name)
        mas_row.addWidget(mas_name)
        mas_row.addStretch()
        self._mas_label = QLabel("-")
        self._mas_label.setStyleSheet(
            f"QLabel {{ font-size: 22px; font-weight: 700; color: {TEXT_PRIMARY}; }}"
            f"QToolTip {{ font-size: 12px; font-weight: 400; }}"
        )
        self._mas_label.setToolTip(
            "Your overall minimap awareness rating from 0 to 100.\n\n"
            "Score 80+ = excellent. Score 50-80 = good. Below 50 = keep practicing."
        )
        _enable_tooltip_below(self._mas_label)
        mas_row.addWidget(self._mas_label)
        cp.addLayout(mas_row)
        cp.addWidget(_spacer(10))

        _metric_tooltips = {
            "duration": "Total time elapsed since you pressed Start Training.",
            "glances": (
                "Total number of times your eyes entered the minimap region.\n"
                "Each time your gaze moves into the region counts as one glance."
            ),
            "rate": (
                "How many times per minute you check the minimap.\n"
                "This is the single strongest predictor of map awareness.\n"
                "Pro players average 6-8 glances per minute."
            ),
            "avg_gap": (
                "Average number of seconds between consecutive map glances.\n"
                "Lower is better. If this is above your alarm timeout,\n"
                "you are regularly triggering alerts."
            ),
            "proc_speed": (
                "Average duration of each minimap glance.\n"
                "Shorter glances indicate faster information extraction.\n"
                "Pro players extract map info in very brief glances."
            ),
            "longest_gap": (
                "The single longest period you went without checking the map.\n"
                "This is your worst tunnel vision moment in the session.\n"
                "Try to keep this as low as possible."
            ),
            "alerts": (
                "Number of times the alert fired because you exceeded the timeout.\n"
                "Each alert means you stared elsewhere too long without checking the map.\n"
                "Fewer alerts = better awareness."
            ),
            "alert_free": (
                "The longest continuous period where you checked the map\n"
                "frequently enough that the alert never had to fire.\n"
                "Longer streaks mean sustained, consistent awareness."
            ),
            "map_time": (
                "Percentage of the session your eyes spent inside the minimap region.\n"
                "Healthy range is 8-12%. Too low means you ignore the map.\n"
                "Too high might mean you are staring at it instead of playing."
            ),
        }

        self._stat_labels: dict[str, QLabel] = {}
        for key, label in [
            ("rate", "Check rate"),
            ("avg_gap", "Response time"),
            ("map_time", "Map attention"),
            ("proc_speed", "Processing speed"),
            ("duration", "Session duration"),
            ("glances", "Map glances"),
            ("longest_gap", "Longest blind spot"),
            ("alerts", "Tunnel vision episodes"),
            ("alert_free", "Best focus streak"),
        ]:
            row = QHBoxLayout()
            row.setContentsMargins(0, 2, 0, 2)
            name_lbl = QLabel(label)
            name_lbl.setStyleSheet(f"font-size: 13px; color: {TEXT_PRIMARY};")
            name_lbl.setToolTip(_metric_tooltips[key])
            _enable_tooltip_below(name_lbl)
            row.addWidget(name_lbl)
            row.addStretch()
            val_lbl = QLabel("-")
            val_lbl.setStyleSheet(f"font-size: 13px; color: {TEXT_PRIMARY}; font-weight: 600;")
            row.addWidget(val_lbl)
            cp.addLayout(row)
            self._stat_labels[key] = val_lbl

        cp.addWidget(_spacer(12))
        cp.addWidget(_divider())
        cp.addWidget(_spacer(10))

        # Bottom buttons: social icons left, Historical Data right
        bottom_row = QHBoxLayout()
        bottom_row.setSpacing(8)

        _icon_btn_css = (
            f"QPushButton {{ border: 1px solid {CARD_BORDER}; background: transparent; "
            f"font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; }}"
        )

        self._share_btn = QPushButton("reddit")
        self._share_btn.setStyleSheet(
            _icon_btn_css
            + f"QPushButton {{ color: #FF4500; }}"
            + f"QPushButton:hover {{ background: #FF450018; border-color: #FF450055; }}"
        )
        self._share_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._share_btn.setToolTip("Share your session stats on Reddit")
        self._share_btn.clicked.connect(self._share_to_reddit)
        bottom_row.addWidget(self._share_btn)

        self._discord_btn = QPushButton("discord")
        self._discord_btn.setStyleSheet(
            _icon_btn_css
            + f"QPushButton {{ color: #5865F2; }}"
            + f"QPushButton:hover {{ background: #5865F218; border-color: #5865F255; }}"
        )
        self._discord_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._discord_btn.setToolTip("Join the Beam Eye Tracker Discord community")
        self._discord_btn.clicked.connect(lambda: webbrowser.open(DISCORD_URL))
        bottom_row.addWidget(self._discord_btn)

        bottom_row.addStretch()

        self._history_btn = QPushButton("Historical Data")
        self._history_btn.setStyleSheet(
            _icon_btn_css
            + f"QPushButton {{ color: {TEXT_SECONDARY}; font-weight: 600; padding: 6px 14px; }}"
            + f"QPushButton:hover {{ background: #252830; border-color: #3A3D48; }}"
        )
        self._history_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._history_btn.setToolTip("View your MapSense Score and metrics over past sessions as charts")
        self._history_btn.clicked.connect(self._show_history)
        bottom_row.addWidget(self._history_btn)

        cp.addLayout(bottom_row)

        root.addWidget(self._config_panel)

        # Debug
        self._debug_label = QLabel("")
        self._debug_label.setStyleSheet(f"color: {TEXT_TERTIARY}; font-size: 10px;")
        self._debug_label.setVisible(self._debug)
        root.addWidget(self._debug_label)

        self._update_slider_labels()
        self._update_region_ui()
        self.adjustSize()

    def _build_slider_row(self, parent: QVBoxLayout, label: str, tooltip: str,
                          min_v: int, max_v: int, value: int) -> None:
        header = QHBoxLayout()
        header.setContentsMargins(0, 0, 0, 0)
        lbl = QLabel(label)
        lbl.setToolTip(tooltip)
        _enable_tooltip_below(lbl)
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
        has_any_saved = self._region_store.regions if hasattr(self, "_region_store") else []

        # First-time vs returning user
        ever_had_region = has_region or bool(has_any_saved)
        self._region_cta.setVisible(not ever_had_region)
        self._region_cta_hint.setVisible(not ever_had_region)
        self._region_manager.setVisible(ever_had_region)
        self._config_panel.setVisible(ever_had_region)

        # Within region manager
        self._new_region_panel.setVisible(not is_saved)
        self._saved_actions.setVisible(is_saved)
        self._save_region_btn.setEnabled(has_region and has_name and not is_saved)

        ready = has_region and (has_name or is_saved)
        if not self._training_active:
            self._start_btn.setEnabled(ready)
            self._start_btn.setText("Start Training" if ready else "Select a Region to Begin")

        self._start_btn.style().unpolish(self._start_btn)
        self._start_btn.style().polish(self._start_btn)

        self.adjustSize()

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
            self._irl_btn.setChecked(False)
        elif sender in (self._audio_btn, self._visual_btn, self._irl_btn):
            self._silent_btn.setChecked(False)
            if (not self._audio_btn.isChecked()
                    and not self._visual_btn.isChecked()
                    and not self._irl_btn.isChecked()):
                self._silent_btn.setChecked(True)
        self._apply_alert_mode()
        self._irl_webhook.configure(enabled=self._irl_btn.isChecked())
        self._save_settings()

    def _update_slider_labels(self) -> None:
        self._timeout_label.setText(f"{self._timeout_slider.value() / 10.0:.1f}s")
        self._volume_label.setText(f"{self._volume_slider.value()}%")
        self._tolerance_label.setText(f"{self._tolerance_slider.value()}%")

    # ==================================================================
    # Stats
    # ==================================================================

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

        avg_dur_s = 0.0
        if self._glance_durations:
            avg_dur_s = sum(self._glance_durations) / len(self._glance_durations)
        avg_dur_ms = avg_dur_s * 1000
        self._stat_labels["proc_speed"].setText(f"{avg_dur_s:.2f}s")
        self._stat_labels["longest_gap"].setText(f"{self._longest_gap:.1f}s")
        self._stat_labels["alerts"].setText(str(self._alert_count))
        self._stat_labels["alert_free"].setText(f"{self._best_alert_free:.1f}s")

        pct = (self._total_glance_time / elapsed * 100) if elapsed > 0 else 0
        self._stat_labels["map_time"].setText(f"{pct:.1f}%")

        # Live MAS
        gap_std = 0.0
        if len(self._gap_times) >= 2:
            mean_g = sum(self._gap_times) / len(self._gap_times)
            gap_std = math.sqrt(sum((g - mean_g) ** 2 for g in self._gap_times) / len(self._gap_times))
        mas = compute_mas(rate, avg_gap, avg_dur_ms, gap_std)
        self._mas_label.setText(f"{mas:.0f}")

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
        self._alert_count = 0
        self._longest_gap = 0.0
        self._gap_times = []
        self._last_gap_start = time.time()
        self._alert_free_start = time.time()
        self._best_alert_free = 0.0
        self._glance_durations = []
        self._mas_label.setText("-")
        for lbl in self._stat_labels.values():
            lbl.setText("-")

    def _save_session_to_history(self) -> None:
        elapsed = time.time() - self._session_start
        if elapsed < 10:
            return
        mins = elapsed / 60.0
        rate = (self._glance_count / mins) if mins > 0 else 0
        avg_gap = (elapsed / self._glance_count) if self._glance_count > 0 else 0
        avg_dur_ms = 0.0
        if self._glance_durations:
            avg_dur_ms = sum(self._glance_durations) / len(self._glance_durations) * 1000
        gap_std = 0.0
        if len(self._gap_times) >= 2:
            mean_g = sum(self._gap_times) / len(self._gap_times)
            gap_std = math.sqrt(sum((g - mean_g) ** 2 for g in self._gap_times) / len(self._gap_times))
        pct = (self._total_glance_time / elapsed * 100) if elapsed > 0 else 0
        mas = compute_mas(rate, avg_gap, avg_dur_ms, gap_std)

        record = SessionRecord(
            timestamp=time.time(),
            duration_s=elapsed,
            glance_count=self._glance_count,
            glances_per_min=round(rate, 2),
            avg_glance_duration_ms=round(avg_dur_ms, 1),
            avg_gap_s=round(avg_gap, 2),
            longest_gap_s=round(self._longest_gap, 2),
            alerts_triggered=self._alert_count,
            alert_free_streak_s=round(self._best_alert_free, 2),
            time_on_map_pct=round(pct, 2),
            mas_score=mas,
            region_name=self._region_name_input.text().strip(),
        )
        self._session_history.add(record)
        logger.info("Session saved: MAS=%.1f, %d glances, %.1f glances/min", mas, self._glance_count, rate)

    def _share_to_reddit(self) -> None:
        glances = self._stat_labels["glances"].text()
        rate = self._stat_labels["rate"].text()
        pct = self._stat_labels["map_time"].text()
        mas = self._mas_label.text()

        title = (
            f"My MapSense Score: {mas} - {glances} map glances, "
            f"{rate}/min, {pct} map attention "
            f"(powered by the Beam Eye Tracker)"
        )
        url = "https://beameyetracker.com"
        reddit_url = (
            f"https://www.reddit.com/submit"
            f"?url={urllib.parse.quote(url, safe='')}"
            f"&title={urllib.parse.quote(title, safe='')}"
        )
        webbrowser.open(reddit_url)

    def _show_history(self) -> None:
        from ui.history_chart import HistoryChartDialog
        dlg = HistoryChartDialog(self._session_history.records, parent=self)
        dlg.exec()

    def _show_onboarding(self) -> None:
        from ui.onboarding import OnboardingDialog
        dlg = OnboardingDialog(parent=self)
        if dlg.exec() and dlg.dont_show_again:
            self._settings.first_run = False
            self._settings.save()

    def _upload_custom_sound(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Select alert sound",
            "", "Audio files (*.mp3 *.wav *.ogg *.flac);;All files (*)",
        )
        if not path:
            return
        sounds_dir = os.path.join(
            os.environ.get("APPDATA", os.path.expanduser("~")),
            "MapSense", "sounds",
        )
        os.makedirs(sounds_dir, exist_ok=True)
        dest = os.path.join(sounds_dir, os.path.basename(path))
        shutil.copy2(path, dest)
        self._alert_manager.set_custom_sound(dest)
        name = os.path.basename(path)
        stem = os.path.splitext(name)[0]
        if len(stem) > 12:
            stem = stem[:10] + ".."
        self._custom_sound_link.setText(stem)
        self._custom_sound_clear.setVisible(True)
        logger.info("Custom sound set: %s", dest)

    def _revert_custom_sound(self) -> None:
        self._alert_manager.set_custom_sound("")
        self._custom_sound_link.setText("Custom Sound")
        self._custom_sound_clear.setVisible(False)
        logger.info("Reverted to default alert sound")

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
            "QPushButton { background-color: #E53935; color: white; border: none; "
            "border-radius: 12px; padding: 16px 32px; font-size: 15px; font-weight: 700; }"
            "QPushButton:hover { background-color: #F44336; }"
            "QPushButton:pressed { background-color: #C62828; }"
        )
        self._set_controls_enabled(False)
        self._tray.set_training_state(True)
        self._save_settings()
        logger.info("Training started")

    def _stop_training(self) -> None:
        if self._in_region:
            dur = time.time() - self._last_glance_entered
            self._total_glance_time += dur
            self._glance_durations.append(dur)
            self._in_region = False
        self._training_active = False
        self._poll_timer.stop()
        self._stats_timer.stop()
        self._alert_manager.stop()
        self._irl_webhook.on_alert_stop()
        self._refresh_stats()
        self._save_session_to_history()

        self._start_btn.setStyleSheet(
            f"QPushButton {{ background-color: {PURPLE}; color: white; border: none; "
            f"border-radius: 12px; padding: 16px 32px; font-size: 15px; "
            f"font-weight: 700; letter-spacing: 0.3px; }}"
            f"QPushButton:hover {{ background-color: #8F78FF; }}"
            f"QPushButton:pressed {{ background-color: #6B51EF; }}"
            f"QPushButton:disabled {{ background-color: #1E2030; color: {TEXT_TERTIARY}; }}"
        )
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
                    self._irl_webhook.on_alert_stop()
            if self._in_region:
                dur = time.time() - self._last_glance_entered
                self._total_glance_time += dur
                self._glance_durations.append(dur)
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
            gap = time.time() - self._last_gap_start
            self._gap_times.append(gap)
            if gap > self._longest_gap:
                self._longest_gap = gap
        elif not in_now and self._in_region:
            dur = time.time() - self._last_glance_entered
            self._total_glance_time += dur
            self._glance_durations.append(dur)
            self._in_region = False
            self._last_gap_start = time.time()

        if in_now:
            self._last_minimap_glance = time.time()
            if self._alert_manager.is_active:
                self._alert_manager.stop()
                self._irl_webhook.on_alert_stop()
                streak = time.time() - self._alert_free_start
                if streak > self._best_alert_free:
                    self._best_alert_free = streak

        timeout = self._timeout_slider.value() / 10.0
        elapsed = time.time() - self._last_minimap_glance
        if elapsed > timeout and not self._alert_manager.is_active:
            self._alert_manager.trigger()
            self._irl_webhook.on_alert_start()
            self._alert_count += 1
            self._alert_free_start = time.time()

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
                "MapSense", "Running in background.",
                QSystemTrayIcon.MessageIcon.Information, 2000,
            )
            event.ignore()
        else:
            self._quit_app()
            event.accept()
