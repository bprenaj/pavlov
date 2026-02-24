"""Full-screen overlay for minimap region selection.

The user click-drags a rectangle on screen to define where the minimap
is, then presses Enter to confirm (or Escape to cancel).
"""

from __future__ import annotations

from PySide6.QtCore import QRect, Qt, Signal
from PySide6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QKeyEvent,
    QMouseEvent,
    QPainter,
    QPaintEvent,
    QPen,
)
from PySide6.QtWidgets import QWidget

from ui.styles import PURPLE, PURPLE_DIM, TEXT_PRIMARY, TEXT_TERTIARY


class MinimapSetupOverlay(QWidget):
    """Transparent full-screen overlay for click-and-drag region selection.

    Emits ``region_selected(QRect)`` when the user presses **Enter**.
    Escape cancels without emitting.
    """

    region_selected = Signal(QRect)

    _INSTRUCTIONS_MAIN = "Click and drag to select the minimap region"
    _INSTRUCTIONS_CONFIRM = "Press  ENTER  to confirm   |   ESC  to cancel"

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.Window
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.MaximizeUsingFullscreenGeometryHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.CrossCursor)

        self._region = QRect()
        self._dragging = False
        self._margin_percent: float = 0.0
        self._screen_width: int = 1920

    def set_margin(self, percent: float, screen_width: int) -> None:
        """Set the detection margin so it can be visualised on the overlay."""
        self._margin_percent = percent
        self._screen_width = screen_width

    # ── Mouse interaction ────────────────────────────────────────────

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            pos = event.position().toPoint()
            self._region = QRect(pos, pos)
            self._dragging = True
            self.update()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._dragging:
            self._region = QRect(self._region.topLeft(), event.position().toPoint())
            self.update()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = False

    # ── Keyboard ─────────────────────────────────────────────────────

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            norm = self._region.normalized()
            if norm.width() > 10 and norm.height() > 10:
                self.region_selected.emit(norm)
            self.close()
        elif event.key() == Qt.Key.Key_Escape:
            self.close()
        else:
            super().keyPressEvent(event)

    # ── Painting ─────────────────────────────────────────────────────

    def _margin_rect(self, norm: QRect) -> QRect | None:
        """Compute the expanded margin rectangle (or None if margin is 0)."""
        if self._margin_percent <= 0:
            return None
        m = int((self._margin_percent / 100.0) * self._screen_width / 2.0)
        if m < 1:
            return None
        return QRect(
            norm.x() - m, norm.y() - m,
            norm.width() + 2 * m, norm.height() + 2 * m,
        )

    def paintEvent(self, event: QPaintEvent) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        painter.fillRect(self.rect(), QColor(0, 0, 0, 190))

        norm = self._region.normalized()
        if norm.width() > 1 and norm.height() > 1:
            # ── Detection margin outline (drawn first, behind region) ──
            margin_r = self._margin_rect(norm)
            if margin_r is not None:
                margin_pen = QPen(QColor(PURPLE))
                margin_pen.setWidth(1)
                margin_pen.setStyle(Qt.PenStyle.DashLine)
                painter.setPen(margin_pen)
                painter.setBrush(QBrush(QColor(PURPLE_DIM).lighter(80)))
                painter.setOpacity(0.18)
                painter.drawRect(margin_r)
                painter.setOpacity(1.0)

                # Subtle label
                painter.setPen(QPen(QColor(TEXT_TERTIARY)))
                lbl_font = QFont("Lato", 10)
                painter.setFont(lbl_font)
                lbl_rect = QRect(margin_r.x(), margin_r.y() - 18, margin_r.width(), 16)
                painter.drawText(
                    lbl_rect,
                    Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignBottom,
                    f"Detection margin ({self._margin_percent:.0f}%)",
                )

            # ── Selected region ────────────────────────────────────────
            painter.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceOver)
            painter.fillRect(norm, QColor(0, 0, 0, 50))

            pen = QPen(QColor(PURPLE))
            pen.setWidth(3)
            painter.setPen(pen)
            painter.setBrush(QBrush(QColor(PURPLE_DIM).lighter(120)))
            painter.setOpacity(0.3)
            painter.drawRect(norm)
            painter.setOpacity(1.0)

            painter.setBrush(Qt.BrushStyle.NoBrush)
            pen.setWidth(2)
            painter.setPen(pen)
            painter.drawRect(norm)

        # ── Instruction text ─────────────────────────────────────────
        painter.setPen(QPen(QColor(TEXT_PRIMARY)))
        main_font = QFont("Lato", 20)
        main_font.setBold(True)
        painter.setFont(main_font)
        text_rect = self.rect().adjusted(0, 0, 0, -60)
        painter.drawText(
            text_rect,
            Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignVCenter,
            self._INSTRUCTIONS_MAIN,
        )

        confirm_font = QFont("Lato", 15)
        confirm_font.setBold(True)
        painter.setFont(confirm_font)
        painter.setPen(QPen(QColor(PURPLE)))
        confirm_rect = self.rect().adjusted(0, 40, 0, 0)
        painter.drawText(
            confirm_rect,
            Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignVCenter,
            self._INSTRUCTIONS_CONFIRM,
        )
        painter.end()

    def set_initial_region(self, rect: QRect) -> None:
        """Pre-populate with an existing region."""
        self._region = rect
