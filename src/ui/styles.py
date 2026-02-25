"""MapSense visual theme: clean, minimal, Apple-inspired dark UI.

Colour palette:
  - Purple accent          #7B61FF
  - Background top         #15171D
  - Background bottom      #0E0824
  - Surface (cards/inputs) #1C1F26
  - Border (very subtle)   #2A2D35
  - Inactive element       #505050
  - Error / warning        #FFFF00
"""

PURPLE = "#7B61FF"
PURPLE_HOVER = "#8F78FF"
PURPLE_PRESSED = "#6B51EF"
PURPLE_DIM = "#3D3080"

BG_TOP = "#15171D"
BG_BOTTOM = "#0E0824"
BG_DARK = BG_TOP

SURFACE = "#1C1F26"
CARD_BG = SURFACE
CARD_BORDER = "#2A2D35"

INACTIVE = "#505050"
ERROR_YELLOW = "#FFFF00"

TEXT_PRIMARY = "#E8E8ED"
TEXT_SECONDARY = "#7A7A85"
TEXT_TERTIARY = "#55555E"

SUCCESS_GREEN = "#34C759"
WARNING_AMBER = "#FFB300"

# Blood-panel metric range colors (muted, low-attention)
RANGE_GOOD = "#7ECFA0"
RANGE_WARN = "#D4C46A"
RANGE_BAD = "#D48A7E"

BORDER_RADIUS = "10px"
CARD_RADIUS = "12px"
FONT_FAMILY = '"Lato", "SF Pro Display", "Segoe UI", sans-serif'


def build_stylesheet() -> str:
    return f"""
    /* -- Base --------------------------------------------------------- */
    QMainWindow {{
        background: qlineargradient(
            x1:0, y1:0, x2:0, y2:1,
            stop:0 {BG_TOP}, stop:1 {BG_BOTTOM}
        );
    }}

    QDialog {{
        background-color: {BG_TOP};
    }}

    QWidget {{
        color: {TEXT_PRIMARY};
        font-family: {FONT_FAMILY};
        font-size: 13px;
    }}

    QToolTip {{
        background-color: #1E2028;
        color: {TEXT_PRIMARY};
        border: 1px solid {CARD_BORDER};
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
    }}

    /* Labels with tooltips show a subtle dashed underline on hover */
    QLabel[hasTooltip="true"] {{
        border-bottom: 1px dashed transparent;
        padding-bottom: 1px;
    }}

    QLabel[hasTooltip="true"]:hover {{
        color: {PURPLE_HOVER};
        border-bottom: 1px dashed {PURPLE_HOVER};
    }}

    /* -- Section containers (QGroupBox) ------------------------------ */
    QGroupBox {{
        background-color: transparent;
        border: none;
        margin-top: 6px;
        padding: 0px;
        font-size: 13px;
    }}

    QGroupBox::title {{
        subcontrol-origin: margin;
        subcontrol-position: top left;
        left: 0px;
        padding: 0;
        color: {TEXT_SECONDARY};
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
    }}

    /* -- Labels ------------------------------------------------------ */
    QLabel {{
        background: transparent;
        font-size: 13px;
    }}

    QLabel[class="heading"] {{
        font-size: 20px;
        font-weight: 700;
        color: {TEXT_PRIMARY};
    }}

    QLabel[class="section"] {{
        color: {TEXT_SECONDARY};
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
    }}

    QLabel[class="secondary"] {{
        color: {TEXT_SECONDARY};
        font-size: 12px;
    }}

    QLabel[class="value"] {{
        color: {TEXT_PRIMARY};
        font-weight: 600;
        font-size: 13px;
    }}

    /* -- Buttons ----------------------------------------------------- */
    QPushButton {{
        background-color: {SURFACE};
        color: {TEXT_PRIMARY};
        border: 1px solid {CARD_BORDER};
        border-radius: {BORDER_RADIUS};
        padding: 10px 20px;
        font-size: 13px;
        font-weight: 500;
    }}

    QPushButton:hover {{
        background-color: #252830;
        border-color: #3A3D48;
    }}

    QPushButton:pressed {{
        background-color: #181B22;
    }}

    QPushButton:disabled {{
        color: {TEXT_TERTIARY};
        border-color: #22252C;
        background-color: #161920;
    }}

    QPushButton#startButton {{
        background-color: {PURPLE};
        color: white;
        border: none;
        border-radius: 12px;
        padding: 16px 32px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.3px;
    }}

    QPushButton#startButton:hover {{
        background-color: {PURPLE_HOVER};
    }}

    QPushButton#startButton:pressed {{
        background-color: {PURPLE_PRESSED};
    }}

    QPushButton#startButton:disabled {{
        background-color: #1E2030;
        color: {TEXT_TERTIARY};
    }}

    /* -- Toggle (alert mode) ----------------------------------------- */
    QPushButton[class="toggle"] {{
        background-color: transparent;
        border: 1px solid {CARD_BORDER};
        border-radius: 8px;
        padding: 7px 18px;
        font-size: 12px;
        font-weight: 500;
    }}

    QPushButton[class="toggle"]:checked {{
        background-color: {PURPLE};
        border-color: {PURPLE};
        color: white;
        font-weight: 600;
    }}

    QPushButton[class="toggle"]:checked:hover {{
        background-color: {PURPLE_HOVER};
        border-color: {PURPLE_HOVER};
    }}

    QPushButton[class="toggle"]:hover {{
        border-color: #454852;
    }}

    /* -- Combo box --------------------------------------------------- */
    QComboBox {{
        background-color: {SURFACE};
        border: 1px solid {CARD_BORDER};
        border-radius: 8px;
        padding: 9px 14px;
        font-size: 13px;
        min-height: 20px;
    }}

    QComboBox:hover {{
        border-color: #454852;
    }}

    QComboBox:focus {{
        border-color: {PURPLE};
    }}

    QComboBox::drop-down {{
        border: none;
        width: 28px;
    }}

    QComboBox::down-arrow {{
        image: none;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 5px solid {TEXT_SECONDARY};
        margin-right: 10px;
    }}

    QComboBox QAbstractItemView {{
        background-color: #1E2028;
        color: {TEXT_PRIMARY};
        border: 1px solid {CARD_BORDER};
        selection-background-color: {PURPLE};
        selection-color: white;
        padding: 4px;
        border-radius: 4px;
        outline: 0;
    }}

    QComboBox QAbstractItemView::item {{
        background-color: #1E2028;
        color: {TEXT_PRIMARY};
        padding: 6px 10px;
        border-radius: 2px;
    }}

    QComboBox QAbstractItemView::item:hover {{
        background-color: #2A2D35;
    }}

    QComboBox QAbstractItemView::item:selected {{
        background-color: {PURPLE};
        color: white;
    }}

    /* -- Sliders ------------------------------------------------------ */
    QSlider::groove:horizontal {{
        height: 4px;
        background: #2A2D35;
        border-radius: 2px;
    }}

    QSlider::handle:horizontal {{
        width: 16px;
        height: 16px;
        margin: -6px 0;
        background: white;
        border-radius: 8px;
    }}

    QSlider::handle:horizontal:hover {{
        background: #E0E0E0;
    }}

    QSlider::sub-page:horizontal {{
        background: {PURPLE};
        border-radius: 2px;
    }}

    QSlider::add-page:horizontal {{
        background: #2A2D35;
        border-radius: 2px;
    }}

    /* -- Line edit ---------------------------------------------------- */
    QLineEdit {{
        background-color: {SURFACE};
        border: 1px solid {CARD_BORDER};
        border-radius: 8px;
        padding: 9px 14px;
        font-size: 13px;
        color: {TEXT_PRIMARY};
        selection-background-color: {PURPLE};
    }}

    QLineEdit:focus {{
        border-color: {PURPLE};
    }}

    QLineEdit:disabled {{
        color: {TEXT_TERTIARY};
        background-color: #161920;
    }}

    /* -- Scroll ------------------------------------------------------- */
    QScrollArea {{
        border: none;
        background: transparent;
    }}

    QScrollBar:vertical {{
        width: 6px;
        background: transparent;
    }}

    QScrollBar::handle:vertical {{
        background: #2A2D35;
        border-radius: 3px;
        min-height: 30px;
    }}

    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
        height: 0px;
    }}
    """
