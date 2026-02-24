"""Pre-configured minimap positions for popular games.

All coordinates are stored as ratios of screen dimensions (0.0-1.0)
so they adapt to any resolution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class GamePreset:
    """Minimap position preset for a specific game."""

    name: str
    minimap_x: float
    minimap_y: float
    minimap_w: float
    minimap_h: float
    description: str = ""

    @property
    def corner_label(self) -> str:
        """Human-friendly label like 'Bottom-right'."""
        v = "Bottom" if self.minimap_y > 0.5 else "Top"
        h = "right" if self.minimap_x > 0.5 else "left"
        return f"{v}-{h}"


# Ratios calibrated for default HUD layouts at 1920x1080.
# Users can always override with the custom region selector.
PRESETS: Dict[str, GamePreset] = {
    "lol": GamePreset(
        name="League of Legends",
        minimap_x=0.8385,
        minimap_y=0.7963,
        minimap_w=0.1615,
        minimap_h=0.2037,
        description="Default minimap, bottom-right corner",
    ),
    "dota2": GamePreset(
        name="Dota 2",
        minimap_x=0.0,
        minimap_y=0.7778,
        minimap_w=0.1406,
        minimap_h=0.2222,
        description="Default minimap, bottom-left corner",
    ),
    "sc2": GamePreset(
        name="StarCraft II",
        minimap_x=0.0,
        minimap_y=0.7639,
        minimap_w=0.1302,
        minimap_h=0.2361,
        description="Default minimap, bottom-left corner",
    ),
    "valorant": GamePreset(
        name="Valorant",
        minimap_x=0.0,
        minimap_y=0.0,
        minimap_w=0.1458,
        minimap_h=0.2593,
        description="Radar, top-left corner",
    ),
    "cs2": GamePreset(
        name="Counter-Strike 2",
        minimap_x=0.0,
        minimap_y=0.0,
        minimap_w=0.1510,
        minimap_h=0.2685,
        description="Radar, top-left corner",
    ),
    "overwatch": GamePreset(
        name="Overwatch 2",
        minimap_x=0.0,
        minimap_y=0.68,
        minimap_w=0.12,
        minimap_h=0.20,
        description="Team/objective area, bottom-left",
    ),
    "smite": GamePreset(
        name="Smite",
        minimap_x=0.8438,
        minimap_y=0.7407,
        minimap_w=0.1563,
        minimap_h=0.2593,
        description="Default minimap, bottom-right corner",
    ),
    "custom": GamePreset(
        name="Custom",
        minimap_x=0.75,
        minimap_y=0.75,
        minimap_w=0.20,
        minimap_h=0.20,
        description="User-defined region",
    ),
}

PRESET_ORDER = ["lol", "dota2", "sc2", "valorant", "cs2", "overwatch", "smite", "custom"]


def get_preset(key: str) -> GamePreset:
    return PRESETS[key]


def preset_keys() -> list[str]:
    return list(PRESET_ORDER)
