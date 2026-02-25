"""Tests for Settings and RegionStore persistence."""

import json
import os

import pytest
from settings import (
    AlertMode,
    MinimapRect,
    RegionStore,
    SavedRegion,
    Settings,
)


@pytest.fixture
def tmp_settings(monkeypatch, tmp_path):
    """Redirect settings I/O to a temporary directory."""
    settings_dir = str(tmp_path / "MapSense")
    monkeypatch.setattr("settings._settings_dir", lambda: settings_dir)
    monkeypatch.setattr(
        "settings._settings_path",
        lambda: os.path.join(settings_dir, "settings.json"),
    )
    monkeypatch.setattr(
        "settings._regions_path",
        lambda: os.path.join(settings_dir, "regions.json"),
    )
    return settings_dir


class TestSettings:
    def test_defaults(self):
        s = Settings()
        assert s.timeout_seconds == 5.0
        assert s.volume == 50
        assert s.gaze_tolerance == 10.0
        assert s.alert_mode.audio is True
        assert s.alert_mode.visual is True
        assert s.region_name == ""
        assert s.first_run is True

    def test_has_region_requires_both_rect_and_name(self):
        s = Settings()
        assert s.has_region is False
        s.minimap_rect = MinimapRect(x=10, y=20, width=100, height=100)
        assert s.has_region is False
        s.region_name = "LoL"
        assert s.has_region is True

    def test_minimap_rect_is_set(self):
        assert MinimapRect().is_set is False
        assert MinimapRect(x=0, y=0, width=0, height=0).is_set is False
        assert MinimapRect(x=0, y=0, width=100, height=100).is_set is True

    def test_save_and_load(self, tmp_settings):
        s = Settings(timeout_seconds=3.0, volume=80, region_name="Dota 2")
        s.save()
        loaded = Settings.load()
        assert loaded.timeout_seconds == 3.0
        assert loaded.volume == 80
        assert loaded.region_name == "Dota 2"

    def test_load_returns_defaults_on_missing_file(self, tmp_settings):
        loaded = Settings.load()
        assert loaded.timeout_seconds == 5.0
        assert loaded.first_run is True

    def test_load_returns_defaults_on_corrupt_json(self, tmp_settings):
        dirpath = tmp_settings
        os.makedirs(dirpath, exist_ok=True)
        with open(os.path.join(dirpath, "settings.json"), "w") as f:
            f.write("{invalid json{{{{")
        loaded = Settings.load()
        assert loaded.timeout_seconds == 5.0

    def test_alert_mode_roundtrip(self, tmp_settings):
        s = Settings()
        s.alert_mode = AlertMode(audio=False, visual=True)
        s.save()
        loaded = Settings.load()
        assert loaded.alert_mode.audio is False
        assert loaded.alert_mode.visual is True

    def test_minimap_rect_roundtrip(self, tmp_settings):
        s = Settings()
        s.minimap_rect = MinimapRect(x=100, y=200, width=300, height=400)
        s.save()
        loaded = Settings.load()
        assert loaded.minimap_rect.x == 100
        assert loaded.minimap_rect.width == 300

    def test_region_name_roundtrip(self, tmp_settings):
        s = Settings(region_name="Bottom-right (LoL)")
        s.save()
        loaded = Settings.load()
        assert loaded.region_name == "Bottom-right (LoL)"

    def test_load_handles_old_format_gracefully(self, tmp_settings):
        dirpath = tmp_settings
        os.makedirs(dirpath, exist_ok=True)
        with open(os.path.join(dirpath, "settings.json"), "w") as f:
            json.dump({"timeout_seconds": 4.0, "volume": 60, "game_preset": "lol"}, f)
        loaded = Settings.load()
        assert loaded.timeout_seconds == 4.0
        assert loaded.region_name == ""


class TestRegionStore:
    def test_add_and_retrieve(self, tmp_settings):
        store = RegionStore()
        store.add(SavedRegion(name="LoL", x=10, y=20, width=100, height=100))
        assert len(store.regions) == 1
        assert store.get("LoL").x == 10

    def test_add_replaces_by_name(self, tmp_settings):
        store = RegionStore()
        store.add(SavedRegion(name="LoL", x=10, y=20, width=100, height=100))
        store.add(SavedRegion(name="LoL", x=50, y=60, width=200, height=200))
        assert len(store.regions) == 1
        assert store.get("LoL").x == 50

    def test_delete(self, tmp_settings):
        store = RegionStore()
        store.add(SavedRegion(name="LoL", x=10, y=20, width=100, height=100))
        store.delete("LoL")
        assert len(store.regions) == 0
        assert store.get("LoL") is None

    def test_persistence(self, tmp_settings):
        store1 = RegionStore()
        store1.add(SavedRegion(name="Dota", x=0, y=0, width=300, height=250))
        store1.add(SavedRegion(name="CS2", x=0, y=0, width=280, height=290))

        store2 = RegionStore()
        assert len(store2.regions) == 2
        assert store2.get("Dota").width == 300
        assert store2.get("CS2").width == 280

    def test_get_nonexistent(self, tmp_settings):
        store = RegionStore()
        assert store.get("nope") is None

    def test_delete_nonexistent_is_safe(self, tmp_settings):
        store = RegionStore()
        store.delete("nope")
        assert len(store.regions) == 0

    def test_saved_region_dict_roundtrip(self):
        r = SavedRegion(name="Test", x=1, y=2, width=3, height=4)
        d = r.as_dict()
        restored = SavedRegion.from_dict(d)
        assert restored.name == "Test"
        assert restored.x == 1
        assert restored.width == 3
