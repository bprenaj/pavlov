"""Build MapSense into a distributable Windows executable.

Usage:
    python installer/build.py          # full build
    python installer/build.py --clean  # wipe build artifacts first

Steps:
    1. Generate mapsense.ico from the SVG favicon (if not present)
    2. Run PyInstaller with the spec file
    3. Print output location
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
INSTALLER = ROOT / "installer"
DIST = ROOT / "dist"
BUILD = ROOT / "build"
SVG_PATH = ROOT / "images" / "Mapavlov Favicon.svg"
ICO_PATH = INSTALLER / "mapsense.ico"


def generate_ico() -> None:
    """Convert SVG favicon to .ico using PySide6 (no extra dependencies)."""
    if ICO_PATH.exists():
        print(f"[OK] Icon already exists: {ICO_PATH}")
        return

    print("[...] Generating mapsense.ico from SVG...")
    try:
        from PySide6.QtCore import QSize, Qt
        from PySide6.QtGui import QGuiApplication, QImage, QPainter, QPixmap
        from PySide6.QtSvg import QSvgRenderer
    except ImportError:
        print("[WARN] PySide6 not available, skipping ICO generation.")
        print("       Install PySide6 or provide installer/mapsense.ico manually.")
        return

    app = QGuiApplication.instance() or QGuiApplication(sys.argv)

    if not SVG_PATH.exists():
        print(f"[WARN] SVG not found: {SVG_PATH}")
        return

    renderer = QSvgRenderer(str(SVG_PATH))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images: list[QImage] = []

    for sz in sizes:
        px = QPixmap(QSize(sz, sz))
        px.fill(Qt.GlobalColor.transparent)
        p = QPainter(px)
        renderer.render(p)
        p.end()
        images.append(px.toImage())

    # Write multi-resolution ICO
    _write_ico(images, str(ICO_PATH))
    print(f"[OK] Generated: {ICO_PATH}")


def _write_ico(images: list, path: str) -> None:
    """Write a multi-resolution .ico file from QImage list."""
    import struct

    png_data_list: list[bytes] = []
    for img in images:
        from PySide6.QtCore import QBuffer, QIODevice
        buf = QBuffer()
        buf.open(QIODevice.OpenModeFlag.WriteOnly)
        img.save(buf, "PNG")
        png_data_list.append(bytes(buf.data()))
        buf.close()

    num = len(png_data_list)
    header = struct.pack("<HHH", 0, 1, num)
    offset = 6 + num * 16

    entries = b""
    for i, png_bytes in enumerate(png_data_list):
        w = images[i].width()
        h = images[i].height()
        w_byte = 0 if w >= 256 else w
        h_byte = 0 if h >= 256 else h
        entries += struct.pack(
            "<BBBBHHII",
            w_byte, h_byte, 0, 0, 1, 32,
            len(png_bytes), offset,
        )
        offset += len(png_bytes)

    with open(path, "wb") as f:
        f.write(header)
        f.write(entries)
        for png_bytes in png_data_list:
            f.write(png_bytes)


def clean() -> None:
    """Remove build artifacts."""
    for d in (BUILD, DIST):
        if d.exists():
            print(f"[...] Removing {d}")
            shutil.rmtree(d)
    print("[OK] Clean complete")


def build() -> None:
    """Run PyInstaller."""
    spec = INSTALLER / "mapsense.spec"
    if not spec.exists():
        print(f"[ERR] Spec file not found: {spec}")
        sys.exit(1)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        str(spec),
        "--noconfirm",
        "--distpath", str(DIST),
        "--workpath", str(BUILD),
    ]
    print(f"[...] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(ROOT))
    if result.returncode != 0:
        print(f"[ERR] PyInstaller failed with exit code {result.returncode}")
        sys.exit(result.returncode)

    out = DIST / "MapSense"
    exe = out / "MapSense.exe"
    if exe.exists():
        size_mb = exe.stat().st_size / (1024 * 1024)
        print(f"\n[OK] Build complete!")
        print(f"     Output: {out}")
        print(f"     Exe:    {exe} ({size_mb:.1f} MB)")
        print(f"\n     To run: {exe}")
    else:
        print(f"[WARN] Build finished but exe not found at {exe}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MapSense installer")
    parser.add_argument("--clean", action="store_true", help="Clean build artifacts before building")
    parser.add_argument("--clean-only", action="store_true", help="Only clean, don't build")
    parser.add_argument("--skip-ico", action="store_true", help="Skip ICO generation")
    args = parser.parse_args()

    if args.clean or args.clean_only:
        clean()
        if args.clean_only:
            return

    if not args.skip_ico:
        generate_ico()

    build()


if __name__ == "__main__":
    main()
