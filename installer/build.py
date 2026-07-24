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
SVG_PATH = ROOT / "images" / "Mamapsense Favicon.svg"
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
        print(f"\n[OK] PyInstaller build complete!")
        print(f"     Output: {out}")
        print(f"     Exe:    {exe} ({size_mb:.1f} MB)")
    else:
        print(f"[WARN] Build finished but exe not found at {exe}")


def _find_iscc() -> Path | None:
    """Locate ISCC.exe from common install paths and the Windows registry."""
    candidates = [
        Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
        Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
        Path(os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe")),
    ]
    for p in candidates:
        if p.exists():
            return p

    # Fall back to registry (per-user and system-wide)
    try:
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1") as key:
                    loc = winreg.QueryValueEx(key, "InstallLocation")[0]
                    p = Path(loc) / "ISCC.exe"
                    if p.exists():
                        return p
            except OSError:
                continue
    except ImportError:
        pass
    return None


def build_installer() -> None:
    """Compile the Inno Setup installer (.exe setup wizard)."""
    iss = INSTALLER / "mapsense_setup.iss"
    if not iss.exists():
        print(f"[ERR] Inno Setup script not found: {iss}")
        sys.exit(1)

    dist_exe = DIST / "MapSense" / "MapSense.exe"
    if not dist_exe.exists():
        print("[ERR] dist/MapSense/MapSense.exe not found. Run PyInstaller build first.")
        sys.exit(1)

    iscc = _find_iscc()
    if iscc is None:
        print("[ERR] Inno Setup not found. Install from https://jrsoftware.org/isdl.php")
        print("      Or run: winget install JRSoftware.InnoSetup")
        sys.exit(1)

    cmd = [str(iscc), str(iss)]
    print(f"[...] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(INSTALLER))
    if result.returncode != 0:
        print(f"[ERR] Inno Setup failed with exit code {result.returncode}")
        sys.exit(result.returncode)

    setup_exe = DIST / "MapSense_Setup_1.0.0.exe"
    if setup_exe.exists():
        size_mb = setup_exe.stat().st_size / (1024 * 1024)
        print(f"\n[OK] Installer created!")
        print(f"     Setup: {setup_exe} ({size_mb:.1f} MB)")
    else:
        print("[WARN] Inno Setup finished but output not found")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MapSense installer")
    parser.add_argument("--clean", action="store_true", help="Clean build artifacts before building")
    parser.add_argument("--clean-only", action="store_true", help="Only clean, don't build")
    parser.add_argument("--skip-ico", action="store_true", help="Skip ICO generation")
    parser.add_argument("--skip-installer", action="store_true", help="Skip Inno Setup installer creation")
    args = parser.parse_args()

    if args.clean or args.clean_only:
        clean()
        if args.clean_only:
            return

    if not args.skip_ico:
        generate_ico()

    build()

    if not args.skip_installer:
        build_installer()


if __name__ == "__main__":
    main()
