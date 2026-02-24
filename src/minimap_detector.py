"""Minimap region definition and gaze-in-region detection.

Pure geometry, no Qt dependency so this module is easily testable
without a running display server.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class MinimapRegion:
    """Rectangular screen region representing the minimap.

    Coordinates are in OS-level pixels (DPI-aware).
    """

    x: int
    y: int
    width: int
    height: int

    @property
    def x2(self) -> int:
        return self.x + self.width

    @property
    def y2(self) -> int:
        return self.y + self.height

    @property
    def center(self) -> tuple[int, int]:
        return (self.x + self.width // 2, self.y + self.height // 2)

    def contains(self, gaze_x: float, gaze_y: float) -> bool:
        """Check whether a gaze point falls inside this region."""
        return (self.x <= gaze_x <= self.x2) and (self.y <= gaze_y <= self.y2)

    def with_tolerance(self, tolerance_percent: float, screen_width: int) -> MinimapRegion:
        """Return an expanded region that accounts for eye-tracking inaccuracy.

        ``tolerance_percent`` is a percentage of screen width added as a margin
        on every side.  A value of 10 on a 1920-wide screen adds 96 px per side.
        """
        margin = int((tolerance_percent / 100.0) * screen_width / 2.0)
        return MinimapRegion(
            x=max(0, self.x - margin),
            y=max(0, self.y - margin),
            width=self.width + 2 * margin,
            height=self.height + 2 * margin,
        )

    def as_tuple(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.width, self.height)

    def as_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}

    @classmethod
    def from_dict(cls, d: dict) -> MinimapRegion:
        return cls(x=d["x"], y=d["y"], width=d["width"], height=d["height"])

    @classmethod
    def from_ratios(
        cls,
        x_ratio: float,
        y_ratio: float,
        w_ratio: float,
        h_ratio: float,
        screen_width: int,
        screen_height: int,
    ) -> MinimapRegion:
        """Create a region from normalised [0-1] ratios of screen dimensions."""
        return cls(
            x=int(x_ratio * screen_width),
            y=int(y_ratio * screen_height),
            width=int(w_ratio * screen_width),
            height=int(h_ratio * screen_height),
        )
