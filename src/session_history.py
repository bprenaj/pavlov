"""Session history storage and Map Awareness Score (MAS) calculation.

Stores completed training sessions in %APPDATA%/MapSense/history.json
and computes composite awareness scores from raw gaze metrics.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, asdict, field
from typing import Optional

logger = logging.getLogger(__name__)


def _history_path() -> str:
    base = os.environ.get("APPDATA", os.path.expanduser("~"))
    return os.path.join(base, "MapSense", "history.json")


@dataclass
class SessionRecord:
    """A single completed training session."""
    timestamp: float  # time.time() when session ended
    duration_s: float  # total session length in seconds
    glance_count: int  # total minimap glances
    glances_per_min: float  # glance frequency
    avg_glance_duration_ms: float  # average duration of each glance in ms
    avg_gap_s: float  # average seconds between glances
    longest_gap_s: float  # worst tunnel vision episode
    alerts_triggered: int  # number of times the alert fired
    alert_free_streak_s: float  # longest period without triggering an alert
    time_on_map_pct: float  # percentage of session spent looking at minimap
    mas_score: float  # composite Map Awareness Score (0-100)
    region_name: str = ""  # which region was being tracked

    def as_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> SessionRecord:
        return cls(**{k: d[k] for k in cls.__dataclass_fields__ if k in d})


def compute_mas(
    glances_per_min: float,
    avg_gap_s: float,
    avg_glance_duration_ms: float,
    gap_std_dev_s: float,
) -> float:
    """Compute the Map Awareness Score (0-100).

    Weighted blend:
      - Check rate / glance frequency: 40%
      - Response time (inverse of avg gap): 25%
      - Processing speed (shorter glance = better): 20%
      - Consistency (lower std dev of gaps = better): 15%

    Each component is normalized to 0-100 using reasonable benchmarks
    derived from esports research (pro players average ~6-8 glances/min).
    """
    # Check rate: 0 glances/min = 0, 8+ glances/min = 100
    freq_score = min(100.0, (glances_per_min / 8.0) * 100.0)

    # Response time: 10s+ gap = 0, 2s gap = 100
    if avg_gap_s <= 0:
        resp_score = 100.0
    else:
        resp_score = max(0.0, min(100.0, (1.0 - (avg_gap_s - 2.0) / 8.0) * 100.0))

    # Processing speed: 800ms+ = 0, 200ms = 100
    if avg_glance_duration_ms <= 0:
        proc_score = 50.0
    else:
        proc_score = max(0.0, min(100.0, (1.0 - (avg_glance_duration_ms - 200.0) / 600.0) * 100.0))

    # Consistency: 5s+ std dev = 0, 0s std dev = 100
    consist_score = max(0.0, min(100.0, (1.0 - gap_std_dev_s / 5.0) * 100.0))

    mas = (
        0.40 * freq_score
        + 0.25 * resp_score
        + 0.20 * proc_score
        + 0.15 * consist_score
    )
    return round(max(0.0, min(100.0, mas)), 1)


class SessionHistory:
    """Manages the list of past sessions on disk."""

    def __init__(self) -> None:
        self._records: list[SessionRecord] = []
        self._load()

    @property
    def records(self) -> list[SessionRecord]:
        return list(self._records)

    def add(self, record: SessionRecord) -> None:
        self._records.append(record)
        self._save()

    def clear(self) -> None:
        self._records.clear()
        self._save()

    def _load(self) -> None:
        path = _history_path()
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._records = [SessionRecord.from_dict(d) for d in data]
            logger.debug("Loaded %d session records", len(self._records))
        except (json.JSONDecodeError, TypeError, KeyError):
            logger.exception("Corrupt history file")
            self._records = []

    def _save(self) -> None:
        path = _history_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump([r.as_dict() for r in self._records], f, indent=2)
            logger.debug("Saved %d session records", len(self._records))
        except OSError:
            logger.exception("Failed to save session history")
