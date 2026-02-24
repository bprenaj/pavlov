"""Mapavlov: Minimap Awareness Trainer.

Entry point.  DPI awareness is set before any other imports to ensure
correct coordinate handling on high-DPI displays.

Usage:
    python src/main.py            # normal mode
    python src/main.py --debug    # verbose logging + debug overlay
"""

# CRITICAL: DPI awareness must be set before ANY UI framework imports.
# Without this, all screen coordinates will be wrong on scaled displays.
import ctypes
import sys

if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass

import argparse
import logging
import os

# Ensure sibling modules are importable when running as `python src/main.py`
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def setup_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO
    fmt = "%(asctime)s [%(levelname)-7s] %(name)s: %(message)s"
    datefmt = "%H:%M:%S"

    logging.basicConfig(level=level, format=fmt, datefmt=datefmt)

    # File log in %APPDATA%/Mapavlov/
    log_dir = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "Mapavlov")
    os.makedirs(log_dir, exist_ok=True)
    fh = logging.FileHandler(os.path.join(log_dir, "mapavlov.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter(fmt, datefmt=datefmt))
    fh.setLevel(logging.DEBUG)
    logging.getLogger().addHandler(fh)


def main() -> int:
    parser = argparse.ArgumentParser(description="Mapavlov: Minimap Awareness Trainer")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging and UI overlay")
    args = parser.parse_args()

    setup_logging(debug=args.debug)
    logger = logging.getLogger("mapavlov")
    logger.info("Mapavlov starting (debug=%s)", args.debug)

    from app import MapavlovApp

    app = MapavlovApp(debug=args.debug)
    rc = app.run()
    logger.info("Mapavlov exiting with code %d", rc)
    return rc


if __name__ == "__main__":
    sys.exit(main())
