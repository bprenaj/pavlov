"""Tests for game presets - still available as optional suggestions."""

from game_presets import PRESETS, PRESET_ORDER, GamePreset, get_preset, preset_keys


class TestGamePresets:
    def test_all_preset_keys_exist(self):
        for key in PRESET_ORDER:
            assert key in PRESETS

    def test_preset_order_matches_presets(self):
        for key in PRESETS:
            assert key in PRESET_ORDER, f"Preset '{key}' missing from PRESET_ORDER"

    def test_get_preset(self):
        preset = get_preset("lol")
        assert preset.name == "League of Legends"

    def test_preset_keys(self):
        keys = preset_keys()
        assert "lol" in keys
        assert "custom" in keys

    def test_ratios_are_normalised(self):
        for key, preset in PRESETS.items():
            assert 0.0 <= preset.minimap_x <= 1.0, f"{key}.minimap_x out of range"
            assert 0.0 <= preset.minimap_y <= 1.0, f"{key}.minimap_y out of range"
            assert 0.0 < preset.minimap_w <= 1.0, f"{key}.minimap_w out of range"
            assert 0.0 < preset.minimap_h <= 1.0, f"{key}.minimap_h out of range"

    def test_corner_label_bottom_right(self):
        preset = get_preset("lol")
        assert preset.corner_label == "Bottom-right"

    def test_corner_label_bottom_left(self):
        preset = get_preset("dota2")
        assert preset.corner_label == "Bottom-left"

    def test_corner_label_top_left(self):
        preset = get_preset("valorant")
        assert preset.corner_label == "Top-left"

    def test_custom_preset_exists(self):
        preset = get_preset("custom")
        assert preset.name == "Custom"
