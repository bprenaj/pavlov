"""Session history chart matching the MapSense UI style.

Uses matplotlib embedded in a PySide6 QDialog to display session metrics
over time. Legend on the right side lets users toggle metric lines.
"""

from __future__ import annotations

import datetime
import logging
import os
from typing import TYPE_CHECKING

from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

if TYPE_CHECKING:
    from session_history import SessionRecord

logger = logging.getLogger(__name__)

METRIC_DEFS = [
    ("mas_score", "MapSense Score", "#7B61FF", "0-100", 2.5, True),
    ("glances_per_min", "Check rate", "#FF617C", "glances/min", 1.2, False),
    ("avg_gap_s", "Response time", "#FF61BD", "seconds", 1.2, False),
    ("time_on_map_pct", "Map attention", "#61CBFF", "percent", 1.2, False),
    ("avg_glance_duration_ms", "Processing speed", "#BD61FF", "ms", 1.2, False),
    ("duration_s", "Session duration", "#6189FF", "seconds", 1.0, False),
    ("glance_count", "Map glances", "#61FFF1", "count", 1.0, False),
    ("longest_gap_s", "Longest blind spot", "#FF61FF", "seconds", 1.0, False),
    ("alerts_triggered", "Tunnel vision episodes", "#61FFB0", "count", 1.0, False),
    ("alert_free_streak_s", "Best focus streak", "#E5FF61", "seconds", 1.0, False),
]

BG_TOP = "#15171D"
BG_BOTTOM = "#0E0824"
TEXT_PRIMARY = "#E8E8ED"
TEXT_SECONDARY = "#7A7A85"
TEXT_TERTIARY = "#55555E"
CARD_BORDER = "#2A2D35"
PURPLE = "#7B61FF"


def _try_import_matplotlib():
    try:
        import matplotlib
        matplotlib.use("Agg")
        from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
        from matplotlib.figure import Figure
        return Figure, FigureCanvasQTAgg, True
    except Exception as exc:
        logger.warning("matplotlib unavailable: %s", exc, exc_info=True)
        return None, None, False


def _favicon_pixmap(size: int = 36) -> QPixmap:
    svg_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "images", "Mamapsense Favicon.svg",
    )
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


class HistoryChartDialog(QDialog):

    def __init__(self, records: list[SessionRecord], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("MapSense - Historical Data")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Dialog)
        self.setMinimumSize(860, 520)
        self.resize(920, 560)
        self.setStyleSheet(
            f"QDialog {{ background: qlineargradient("
            f"x1:0, y1:0, x2:0, y2:1, stop:0 {BG_TOP}, stop:1 {BG_BOTTOM}); }}"
            f"QLabel {{ background: transparent; color: {TEXT_PRIMARY}; }}"
        )

        self._records = records
        self._lines = {}
        self._legend_buttons = {}
        self._drag_pos = None

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # Title bar matching main window
        title_bar = QWidget()
        title_bar.setFixedHeight(56)
        title_bar.setStyleSheet("background: transparent;")
        tb_layout = QHBoxLayout(title_bar)
        tb_layout.setContentsMargins(16, 0, 8, 0)
        tb_layout.setSpacing(0)

        icon_label = QLabel()
        fav = _favicon_pixmap(36)
        if not fav.isNull():
            icon_label.setPixmap(fav)
        icon_label.setFixedSize(40, 40)
        icon_label.setStyleSheet("background: transparent;")
        tb_layout.addWidget(icon_label)
        tb_layout.addSpacing(10)

        title = QLabel("MapSense")
        title.setStyleSheet(f"font-size: 18px; font-weight: 700; color: {TEXT_PRIMARY};")
        tb_layout.addWidget(title)
        tb_layout.addSpacing(8)

        subtitle = QLabel("Historical Data")
        subtitle.setStyleSheet(f"font-size: 14px; font-weight: 400; color: {TEXT_SECONDARY};")
        tb_layout.addWidget(subtitle)
        tb_layout.addStretch()

        close_btn = QPushButton("\u2715")
        close_btn.setStyleSheet(
            f"QPushButton {{ background: transparent; border: none; color: {TEXT_TERTIARY}; "
            f"font-size: 15px; min-width: 36px; min-height: 36px; }}"
            f"QPushButton:hover {{ color: #FFF; background: #E53935; border-radius: 6px; }}"
        )
        close_btn.clicked.connect(self.close)
        tb_layout.addWidget(close_btn)
        outer.addWidget(title_bar)

        # Content area
        content = QHBoxLayout()
        content.setContentsMargins(16, 0, 16, 16)
        content.setSpacing(12)

        Figure, FigureCanvasQTAgg, available = _try_import_matplotlib()

        if not available or len(records) < 1:
            msg = "Install matplotlib to view charts." if not available else "No sessions recorded yet."
            placeholder = QLabel(msg)
            placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
            placeholder.setStyleSheet(f"font-size: 14px; color: {TEXT_SECONDARY}; padding: 40px;")
            content.addWidget(placeholder)
            outer.addLayout(content)
            return

        self._fig = Figure(figsize=(7, 3.5), dpi=100, facecolor=BG_TOP)
        self._ax = self._fig.add_subplot(111)
        self._canvas = FigureCanvasQTAgg(self._fig)
        content.addWidget(self._canvas, stretch=1)

        # Vertical legend on the right
        legend_panel = QVBoxLayout()
        legend_panel.setSpacing(4)
        legend_title = QLabel("Metrics")
        legend_title.setStyleSheet(f"font-size: 11px; font-weight: 600; color: {TEXT_SECONDARY};")
        legend_panel.addWidget(legend_title)
        legend_panel.addSpacing(4)

        for key, label, color, unit, width, visible in METRIC_DEFS:
            btn = QPushButton(f"  {label}")
            btn.setCheckable(True)
            btn.setChecked(visible)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet(self._legend_btn_style(color, visible))
            btn.setFixedWidth(180)
            btn.setToolTip(f"Unit: {unit}")
            btn.clicked.connect(lambda checked, k=key, c=color: self._toggle_metric(k, c, checked))
            legend_panel.addWidget(btn)
            self._legend_buttons[key] = (btn, color)

        legend_panel.addStretch()
        content.addLayout(legend_panel)
        outer.addLayout(content)

        self._plot(records)

        # Make title bar draggable
        title_bar.mousePressEvent = self._tb_press
        title_bar.mouseMoveEvent = self._tb_move
        title_bar.mouseReleaseEvent = self._tb_release

    def _tb_press(self, ev):
        if ev.button() == Qt.MouseButton.LeftButton:
            self._drag_pos = ev.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def _tb_move(self, ev):
        if self._drag_pos and ev.buttons() & Qt.MouseButton.LeftButton:
            self.move(ev.globalPosition().toPoint() - self._drag_pos)

    def _tb_release(self, ev):
        self._drag_pos = None

    def _legend_btn_style(self, color: str, active: bool) -> str:
        if active:
            return (
                f"QPushButton {{ background: #1C1F26; color: {TEXT_PRIMARY}; text-align: left; "
                f"border-left: 4px solid {color}; border-top: none; border-right: none; border-bottom: none; "
                f"font-size: 11px; font-weight: 600; "
                f"padding: 5px 8px; border-radius: 4px; }}"
                f"QPushButton:hover {{ background: #252830; }}"
            )
        return (
            f"QPushButton {{ background: #1C1F26; color: {TEXT_TERTIARY}; text-align: left; "
            f"border-left: 4px solid {TEXT_TERTIARY}; border-top: none; border-right: none; border-bottom: none; "
            f"font-size: 11px; "
            f"padding: 5px 8px; border-radius: 4px; }}"
            f"QPushButton:hover {{ background: #252830; color: {TEXT_SECONDARY}; }}"
        )

    def _toggle_metric(self, key: str, color: str, checked: bool) -> None:
        btn, _ = self._legend_buttons[key]
        btn.setStyleSheet(self._legend_btn_style(color, checked))
        if key in self._lines:
            self._lines[key].set_visible(checked)
            self._update_y_label()
            self._rescale_y()
            self._canvas.draw_idle()

    def _update_y_label(self) -> None:
        visible = [(k, lbl, unit) for k, lbl, _c, unit, _w, _v in METRIC_DEFS
                    if k in self._lines and self._lines[k].get_visible()]
        if len(visible) == 1:
            _, name, unit = visible[0]
            self._ax.set_ylabel(f"{name} ({unit})", color=TEXT_SECONDARY, fontsize=10)
        elif len(visible) == 0:
            self._ax.set_ylabel("", color=TEXT_SECONDARY, fontsize=10)
        else:
            units = list({u for _, _, u in visible})
            if len(units) == 1:
                self._ax.set_ylabel(units[0], color=TEXT_SECONDARY, fontsize=10)
            else:
                self._ax.set_ylabel("(mixed units)", color=TEXT_SECONDARY, fontsize=10)

    def _rescale_y(self) -> None:
        """Auto-scale Y axis to fit only the currently visible lines."""
        all_vals: list[float] = []
        for key, line in self._lines.items():
            if line.get_visible():
                ydata = line.get_ydata()
                if len(ydata) > 0:
                    all_vals.extend(float(v) for v in ydata)
        if not all_vals:
            self._ax.set_ylim(0, 1)
            return
        lo, hi = min(all_vals), max(all_vals)
        if lo == hi:
            margin = max(abs(lo) * 0.1, 0.5)
            lo -= margin
            hi += margin
        else:
            span = hi - lo
            lo -= span * 0.08
            hi += span * 0.08
        self._ax.set_ylim(lo, hi)

    def _plot(self, records: list[SessionRecord]) -> None:
        ax = self._ax
        ax.set_facecolor(BG_BOTTOM)
        ax.tick_params(colors=TEXT_SECONDARY, labelsize=9)
        for spine in ax.spines.values():
            spine.set_color(CARD_BORDER)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, alpha=0.12, color=TEXT_SECONDARY)

        dates = [datetime.datetime.fromtimestamp(r.timestamp) for r in records]

        for key, label, color, unit, width, visible in METRIC_DEFS:
            values = [getattr(r, key, 0) for r in records]
            (line,) = ax.plot(
                dates, values,
                color=color,
                linewidth=width,
                marker="o" if len(records) < 30 else None,
                markersize=4 if len(records) < 30 else 0,
                alpha=0.9,
                label=label,
                visible=visible,
            )
            self._lines[key] = line

        ax.set_xlabel("Session", color=TEXT_SECONDARY, fontsize=10)
        self._update_y_label()
        self._rescale_y()

        if len(dates) > 1:
            self._fig.autofmt_xdate(rotation=30, ha="right")

        self._fig.tight_layout(pad=1.5)
        self._canvas.draw()
