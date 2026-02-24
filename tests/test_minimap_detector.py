"""Tests for MinimapRegion geometry and tolerance logic."""

import pytest
from minimap_detector import MinimapRegion


class TestMinimapRegion:
    def test_contains_center(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert region.contains(200.0, 200.0)

    def test_contains_top_left_corner(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert region.contains(100.0, 100.0)

    def test_contains_bottom_right_corner(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert region.contains(300.0, 300.0)

    def test_does_not_contain_outside_left(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert not region.contains(50.0, 200.0)

    def test_does_not_contain_outside_above(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert not region.contains(200.0, 50.0)

    def test_does_not_contain_outside_right(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert not region.contains(350.0, 200.0)

    def test_does_not_contain_outside_below(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert not region.contains(200.0, 350.0)

    def test_with_tolerance_expands_region(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        expanded = region.with_tolerance(10.0, 1920)
        assert expanded.x < region.x
        assert expanded.y < region.y
        assert expanded.width > region.width
        assert expanded.height > region.height

    def test_with_tolerance_zero_is_unchanged(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        same = region.with_tolerance(0.0, 1920)
        assert same.x == region.x
        assert same.y == region.y
        assert same.width == region.width
        assert same.height == region.height

    def test_with_tolerance_clamps_to_zero(self):
        """Tolerance should not push coordinates negative."""
        region = MinimapRegion(x=10, y=10, width=50, height=50)
        expanded = region.with_tolerance(5.0, 1920)
        assert expanded.x >= 0
        assert expanded.y >= 0

    def test_from_ratios(self):
        region = MinimapRegion.from_ratios(0.5, 0.5, 0.25, 0.25, 1920, 1080)
        assert region.x == 960
        assert region.y == 540
        assert region.width == 480
        assert region.height == 270

    def test_x2_y2_properties(self):
        region = MinimapRegion(x=100, y=200, width=300, height=400)
        assert region.x2 == 400
        assert region.y2 == 600

    def test_center_property(self):
        region = MinimapRegion(x=100, y=100, width=200, height=200)
        assert region.center == (200, 200)

    def test_dict_roundtrip(self):
        region = MinimapRegion(x=10, y=20, width=30, height=40)
        d = region.as_dict()
        restored = MinimapRegion.from_dict(d)
        assert restored == region

    def test_as_tuple(self):
        region = MinimapRegion(x=1, y=2, width=3, height=4)
        assert region.as_tuple() == (1, 2, 3, 4)
