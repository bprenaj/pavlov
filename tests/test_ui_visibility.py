"""UI visibility tests.

Verifies that every user-facing element in the main window is present,
correctly labelled, and visible when it should be. These tests run
against a real MainWindow instance (no Beam SDK required).
"""

import sys

import pytest
from PySide6.QtCore import QRect, Qt
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QLabel,
    QLineEdit,
    QPushButton,
    QSlider,
)

app = QApplication.instance() or QApplication(sys.argv)

from settings import Settings
from tracker import BeamTracker
from ui.main_window import MainWindow


@pytest.fixture
def window(monkeypatch, tmp_path):
    settings_dir = str(tmp_path / "MapSense")
    monkeypatch.setattr("settings._settings_dir", lambda: settings_dir)
    monkeypatch.setattr(
        "settings._settings_path",
        lambda: str(tmp_path / "MapSense" / "settings.json"),
    )
    monkeypatch.setattr(
        "settings._regions_path",
        lambda: str(tmp_path / "MapSense" / "regions.json"),
    )
    settings = Settings()
    tracker = BeamTracker()
    win = MainWindow(tracker=tracker, settings=settings, debug=True)
    yield win
    win.close()


class TestTitleBar:
    def test_title_bar_exists(self, window):
        assert window._title_bar is not None

    def test_title_text_is_mapsense(self, window):
        assert window._title_bar._title_label.text() == "MapSense"

    def test_title_bar_has_icon(self, window):
        pixmap = window._title_bar._icon_label.pixmap()
        assert pixmap is not None

    def test_window_title_is_mapsense(self, window):
        assert window.windowTitle() == "MapSense"

    def test_window_is_frameless(self, window):
        assert window.windowFlags() & Qt.WindowType.FramelessWindowHint


class TestRegionSection:
    def test_saved_combo_exists_with_new_region(self, window):
        assert isinstance(window._saved_combo, QComboBox)
        assert window._saved_combo.count() >= 1
        assert window._saved_combo.itemText(0) == "New region"

    def test_select_on_screen_button_visible(self, window):
        assert window._set_region_btn.text() == "Select on screen"
        assert not window._new_region_panel.isHidden()

    def test_name_input_exists(self, window):
        assert isinstance(window._region_name_input, QLineEdit)
        assert window._region_name_input.placeholderText() == "Name this region..."

    def test_save_button_disabled_initially(self, window):
        assert not window._save_region_btn.isEnabled()

    def test_saved_actions_hidden_for_new_region(self, window):
        window._saved_combo.setCurrentIndex(0)
        assert not window._saved_actions.isVisible()

    def test_edit_delete_new_buttons_exist(self, window):
        assert window._edit_btn.text() == "Edit region"
        assert window._delete_btn.text() == "Delete"
        assert window._new_btn.text() == "+ New"


class TestSettingsSection:
    def test_timeout_slider_exists(self, window):
        assert isinstance(window._timeout_slider, QSlider)
        assert window._timeout_slider.minimum() == 5
        assert window._timeout_slider.maximum() == 300

    def test_volume_slider_exists(self, window):
        assert isinstance(window._volume_slider, QSlider)
        assert window._volume_slider.minimum() == 0
        assert window._volume_slider.maximum() == 100

    def test_tolerance_slider_exists(self, window):
        assert isinstance(window._tolerance_slider, QSlider)
        assert window._tolerance_slider.minimum() == 0
        assert window._tolerance_slider.maximum() == 30

    def test_slider_labels_show_values(self, window):
        assert "s" in window._timeout_label.text()
        assert "%" in window._volume_label.text()
        assert "%" in window._tolerance_label.text()


class TestAlertModeButtons:
    def test_audio_button_exists(self, window):
        assert window._audio_btn.text() == "Audio"
        assert window._audio_btn.isCheckable()

    def test_visual_button_exists(self, window):
        assert window._visual_btn.text() == "Visual"
        assert window._visual_btn.isCheckable()

    def test_silent_button_exists(self, window):
        assert window._silent_btn.text() == "Silent"
        assert window._silent_btn.isCheckable()

    def test_silent_unchecks_others(self, window):
        window._audio_btn.setChecked(False)
        window._visual_btn.setChecked(False)
        window._silent_btn.setChecked(True)
        window._on_alert_mode_changed()
        assert window._silent_btn.isChecked()
        assert not window._audio_btn.isChecked()
        assert not window._visual_btn.isChecked()


class TestStartButton:
    def test_start_button_exists(self, window):
        assert window._start_btn.objectName() == "startButton"

    def test_start_disabled_without_region(self, window):
        assert not window._start_btn.isEnabled()
        assert window._start_btn.text() == "Select a Region to Begin"

    def test_start_enabled_after_region_and_name(self, window):
        from minimap_detector import MinimapRegion
        window._current_minimap_region = MinimapRegion(x=100, y=100, width=200, height=200)
        window._region_name_input.setText("Test Region")
        window._update_region_ui()
        assert window._start_btn.isEnabled()
        assert window._start_btn.text() == "Start Training"


class TestStatisticsSection:
    def test_stats_toggle_exists(self, window):
        assert "Statistics" in window._stats_toggle.text()
        assert "Beam Eye Tracker" in window._stats_toggle.text()

    def test_stats_panel_hidden_by_default(self, window):
        assert not window._stats_panel.isVisible()

    def test_stats_panel_toggles_on_click(self, window):
        window._toggle_stats()
        assert not window._stats_panel.isHidden()
        window._toggle_stats()
        assert window._stats_panel.isHidden()

    def test_all_stat_rows_exist(self, window):
        expected = {"duration", "glances", "rate", "avg_gap", "map_time"}
        assert set(window._stat_labels.keys()) == expected

    def test_stat_labels_have_initial_dash(self, window):
        for key, lbl in window._stat_labels.items():
            assert lbl.text() == "-", f"stat '{key}' should be '-' initially"

    def test_share_button_exists(self, window):
        assert window._share_btn.text() == "Share on Reddit"


class TestBeamStatus:
    def test_status_widget_exists(self, window):
        assert window._status_widget is not None

    def test_status_updates_to_tracking(self, window):
        from tracker import BeamStatus
        window._status_widget.set_status(BeamStatus.TRACKING)
        assert "Beam Eye Tracker connected" in window._status_widget._label.text()

    def test_status_updates_to_not_running(self, window):
        from tracker import BeamStatus
        window._status_widget.set_status(BeamStatus.NOT_RUNNING)
        assert "not running" in window._status_widget._label.text()


class TestDebugMode:
    def test_debug_label_visible_in_debug_mode(self, window):
        assert not window._debug_label.isHidden()

    def test_debug_label_hidden_in_normal_mode(self, monkeypatch, tmp_path):
        settings_dir = str(tmp_path / "MapSense2")
        monkeypatch.setattr("settings._settings_dir", lambda: settings_dir)
        monkeypatch.setattr(
            "settings._settings_path",
            lambda: str(tmp_path / "MapSense2" / "settings.json"),
        )
        monkeypatch.setattr(
            "settings._regions_path",
            lambda: str(tmp_path / "MapSense2" / "regions.json"),
        )
        settings = Settings()
        tracker = BeamTracker()
        win = MainWindow(tracker=tracker, settings=settings, debug=False)
        assert not win._debug_label.isVisible()
        win.close()


class TestTooltips:
    def test_combo_has_tooltip(self, window):
        assert len(window._saved_combo.toolTip()) > 0

    def test_select_button_has_tooltip(self, window):
        assert len(window._set_region_btn.toolTip()) > 0

    def test_name_input_has_tooltip(self, window):
        assert len(window._region_name_input.toolTip()) > 0

    def test_timeout_slider_has_tooltip(self, window):
        assert len(window._timeout_slider.toolTip()) > 0

    def test_volume_slider_has_tooltip(self, window):
        assert len(window._volume_slider.toolTip()) > 0

    def test_tolerance_slider_has_tooltip(self, window):
        assert "margin" in window._tolerance_slider.toolTip().lower() or \
               "inaccuracy" in window._tolerance_slider.toolTip().lower()

    def test_audio_btn_has_tooltip(self, window):
        assert len(window._audio_btn.toolTip()) > 0

    def test_visual_btn_has_tooltip(self, window):
        assert len(window._visual_btn.toolTip()) > 0

    def test_silent_btn_has_tooltip(self, window):
        assert len(window._silent_btn.toolTip()) > 0
