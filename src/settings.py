"""User settings with JSON persistence.

Settings are stored in %APPDATA%/MapSense/settings.json on Windows.
Saved regions are stored in %APPDATA%/MapSense/regions.json separately.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 5.0
DEFAULT_VOLUME = 50
DEFAULT_GAZE_TOLERANCE = 10.0


def _settings_dir() -> str:
    base = os.environ.get("APPDATA", os.path.expanduser("~"))
    return os.path.join(base, "MapSense")


def _settings_path() -> str:
    return os.path.join(_settings_dir(), "settings.json")


def _regions_path() -> str:
    return os.path.join(_settings_dir(), "regions.json")


@dataclass
class AlertMode:
    audio: bool = True
    visual: bool = True


@dataclass
class MinimapRect:
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0

    @property
    def is_set(self) -> bool:
        return self.width > 0 and self.height > 0


@dataclass
class SavedRegion:
    """A named screen region that can be recalled later."""

    name: str
    x: int
    y: int
    width: int
    height: int

    def as_dict(self) -> dict:
        return {"name": self.name, "x": self.x, "y": self.y, "width": self.width, "height": self.height}

    @classmethod
    def from_dict(cls, d: dict) -> SavedRegion:
        return cls(name=d["name"], x=d["x"], y=d["y"], width=d["width"], height=d["height"])


class RegionStore:
    """Manages a list of saved regions on disk."""

    def __init__(self) -> None:
        self._regions: list[SavedRegion] = []
        self._load()

    @property
    def regions(self) -> list[SavedRegion]:
        return list(self._regions)

    def add(self, region: SavedRegion) -> None:
        self._regions = [r for r in self._regions if r.name != region.name]
        self._regions.append(region)
        self._save()

    def delete(self, name: str) -> None:
        self._regions = [r for r in self._regions if r.name != name]
        self._save()

    def get(self, name: str) -> SavedRegion | None:
        for r in self._regions:
            if r.name == name:
                return r
        return None

    def _load(self) -> None:
        path = _regions_path()
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._regions = [SavedRegion.from_dict(d) for d in data]
            logger.debug("Loaded %d saved regions", len(self._regions))
        except (json.JSONDecodeError, TypeError, KeyError):
            logger.exception("Corrupt regions file")
            self._regions = []

    def _save(self) -> None:
        dirpath = _settings_dir()
        os.makedirs(dirpath, exist_ok=True)
        path = _regions_path()
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump([r.as_dict() for r in self._regions], f, indent=2)
            logger.debug("Saved %d regions to %s", len(self._regions), path)
        except OSError:
            logger.exception("Failed to save regions")


@dataclass
class Settings:
    timeout_seconds: float = DEFAULT_TIMEOUT
    volume: int = DEFAULT_VOLUME
    gaze_tolerance: float = DEFAULT_GAZE_TOLERANCE
    alert_mode: AlertMode = field(default_factory=AlertMode)
    minimap_rect: MinimapRect = field(default_factory=MinimapRect)
    region_name: str = ""
    first_run: bool = True
    hotkey: str = ""

    @property
    def has_region(self) -> bool:
        return self.minimap_rect.is_set and len(self.region_name) > 0

    def save(self) -> None:
        """Persist settings to disk."""
        dirpath = _settings_dir()
        os.makedirs(dirpath, exist_ok=True)
        filepath = _settings_path()
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(asdict(self), f, indent=2)
            logger.debug("Settings saved to %s", filepath)
        except OSError:
            logger.exception("Failed to save settings")

    @classmethod
    def load(cls) -> Settings:
        """Load settings from disk, returning defaults if file missing or corrupt."""
        filepath = _settings_path()
        if not os.path.exists(filepath):
            logger.info("No settings file found, using defaults")
            return cls()
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            return cls(
                timeout_seconds=data.get("timeout_seconds", DEFAULT_TIMEOUT),
                volume=data.get("volume", DEFAULT_VOLUME),
                gaze_tolerance=data.get("gaze_tolerance", DEFAULT_GAZE_TOLERANCE),
                alert_mode=AlertMode(**data.get("alert_mode", {})),
                minimap_rect=MinimapRect(**data.get("minimap_rect", {})),
                region_name=data.get("region_name", ""),
                first_run=data.get("first_run", True),
                hotkey=data.get("hotkey", ""),
            )
        except (json.JSONDecodeError, TypeError, KeyError):
            logger.exception("Corrupt settings file, resetting to defaults")
            return cls()
