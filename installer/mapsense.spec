# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for MapSense.

Usage:
    pyinstaller installer/mapsense.spec --noconfirm

Output lands in dist/MapSense/ as a one-folder bundle.
"""

import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).parent
SRC = ROOT / "src"
ASSETS = SRC / "assets"
IMAGES = ROOT / "images"
ICON_ICO = ROOT / "installer" / "mapsense.ico"

block_cipher = None

# Collect every matplotlib sub-module, data file, and binary
mpl_datas, mpl_binaries, mpl_hiddenimports = collect_all("matplotlib")

a = Analysis(
    [str(SRC / "main.py")],
    pathex=[str(SRC)],
    binaries=mpl_binaries,
    datas=[
        (str(ASSETS / "alert.wav"), "assets"),
        (str(ASSETS / "Lato-Regular.ttf"), "assets"),
        (str(ASSETS / "Lato-Bold.ttf"), "assets"),
        (str(IMAGES / "Mapavlov Favicon.svg"), "images"),
    ] + mpl_datas,
    hiddenimports=[
        "app",
        "tracker",
        "settings",
        "minimap_detector",
        "alert_manager",
        "session_history",
        "irl_webhook",
        "utils",
        "ui",
        "ui.main_window",
        "ui.setup_overlay",
        "ui.alert_overlay",
        "ui.beam_status_widget",
        "ui.onboarding",
        "ui.history_chart",
        "ui.tray_icon",
        "ui.styles",
        "PySide6.QtSvg",
        "PySide6.QtMultimedia",
        "matplotlib",
        "matplotlib.backends.backend_qtagg",
        "matplotlib.backends.backend_agg",
        "matplotlib.backends.backend_qt",
        "unittest",
        "unittest.mock",
        "pyparsing",
        "pyparsing.testing",
    ] + mpl_hiddenimports,
    hookspath=[],
    hooksconfig={
        "matplotlib": {
            "backends": ["Agg", "qtagg"],
        },
    },
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "pydoc",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MapSense",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON_ICO) if ICON_ICO.exists() else None,
    version_info=None,
    manifest=None,
    uac_admin=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="MapSense",
)
