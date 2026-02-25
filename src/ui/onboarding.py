"""First-run onboarding dialog.

Shows a simple 3-step guide when the user launches MapSense for the
first time. The dialog is dismissed permanently once closed.
"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ui.styles import PURPLE, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, CARD_BORDER


class OnboardingDialog(QDialog):
    """Three-step onboarding shown on first launch."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Welcome to MapSense")
        self.setFixedSize(420, 380)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)
        self.setStyleSheet(
            f"QDialog {{ background-color: #15171D; border: 1px solid {CARD_BORDER}; border-radius: 12px; }}"
            f"QLabel {{ background: transparent; color: {TEXT_PRIMARY}; }}"
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 28, 32, 24)
        layout.setSpacing(0)

        title = QLabel("Welcome to MapSense")
        title.setStyleSheet(f"font-size: 20px; font-weight: 700; color: {TEXT_PRIMARY};")
        layout.addWidget(title)

        subtitle = QLabel("Train your minimap awareness in 3 simple steps")
        subtitle.setStyleSheet(f"font-size: 13px; color: {TEXT_SECONDARY}; margin-top: 4px;")
        layout.addWidget(subtitle)
        layout.addSpacing(24)

        steps = [
            ("1", "Mark your minimap zone",
             "Click the purple button, then drag a rectangle over your minimap and press Enter to confirm."),
            ("2", "Pick an alert style",
             "Audio beep, visual flash, or both. Choose Silent if you only want stats."),
            ("3", "Start training",
             "Press Start Training and play your game. MapSense will alert you when you forget to check the map."),
        ]

        for num, heading, desc in steps:
            step_row = QHBoxLayout()
            step_row.setSpacing(14)

            badge = QLabel(num)
            badge.setFixedSize(32, 32)
            badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
            badge.setStyleSheet(
                f"background-color: {PURPLE}; color: white; font-size: 14px; "
                f"font-weight: 700; border-radius: 16px;"
            )
            step_row.addWidget(badge, alignment=Qt.AlignmentFlag.AlignTop)

            text_col = QVBoxLayout()
            text_col.setSpacing(2)
            h = QLabel(heading)
            h.setStyleSheet(f"font-size: 14px; font-weight: 600; color: {TEXT_PRIMARY};")
            text_col.addWidget(h)
            d = QLabel(desc)
            d.setWordWrap(True)
            d.setStyleSheet(f"font-size: 12px; color: {TEXT_SECONDARY};")
            text_col.addWidget(d)
            step_row.addLayout(text_col, stretch=1)

            layout.addLayout(step_row)
            layout.addSpacing(16)

        layout.addStretch()

        self._dont_show = QCheckBox("Don't show this again")
        self._dont_show.setStyleSheet(
            f"QCheckBox {{ color: {TEXT_TERTIARY}; font-size: 11px; }}"
            f"QCheckBox::indicator {{ width: 14px; height: 14px; }}"
        )
        self._dont_show.setChecked(True)
        layout.addWidget(self._dont_show)
        layout.addSpacing(12)

        btn = QPushButton("Get Started")
        btn.setStyleSheet(
            f"QPushButton {{ background-color: {PURPLE}; color: white; border: none; "
            f"border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; }}"
            f"QPushButton:hover {{ background-color: #8F78FF; }}"
        )
        btn.clicked.connect(self.accept)
        layout.addWidget(btn)

    @property
    def dont_show_again(self) -> bool:
        return self._dont_show.isChecked()
