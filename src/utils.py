"""Shared utilities: audio generation, path helpers, font loading."""

from __future__ import annotations

import math
import os
import struct
import wave

ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")


def ensure_assets_dir() -> str:
    os.makedirs(ASSETS_DIR, exist_ok=True)
    return ASSETS_DIR


def load_bundled_fonts() -> None:
    """Register bundled Lato font files with Qt."""
    from PySide6.QtGui import QFontDatabase

    for name in ("Lato-Regular.ttf", "Lato-Bold.ttf"):
        path = os.path.join(ASSETS_DIR, name)
        if os.path.isfile(path):
            QFontDatabase.addApplicationFont(path)


def generate_alert_wav(
    filepath: str | None = None,
    frequency: float = 880.0,
    duration: float = 1.8,
    sample_rate: int = 44100,
) -> str:
    """Generate a repeating alert tone as a PCM WAV file.

    Structure: 200 ms silence (avoids QMediaPlayer startup click),
    then two short pings with a gap, then 200 ms silence tail for
    clean looping.
    """
    if filepath is None:
        filepath = os.path.join(ensure_assets_dir(), "alert.wav")

    if os.path.exists(filepath):
        return filepath

    ensure_assets_dir()
    n_samples = int(sample_rate * duration)

    LEAD_SILENCE = 0.20
    TAIL_SILENCE = 0.20
    PING_STARTS = (LEAD_SILENCE, LEAD_SILENCE + 0.65)

    with wave.open(filepath, "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)

        for i in range(n_samples):
            t = i / sample_rate
            sample_val = 0.0
            for ping_start in PING_STARTS:
                dt = t - ping_start
                if 0.0 <= dt < 0.3:
                    envelope = math.exp(-dt * 12.0) * 0.55
                    sample_val += envelope * math.sin(2.0 * math.pi * frequency * dt)
            sample_val = max(-1.0, min(1.0, sample_val))
            wav.writeframes(struct.pack("<h", int(sample_val * 32767)))

    return filepath
