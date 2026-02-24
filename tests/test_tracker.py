"""Tests for BeamTracker — uses mocking since the real SDK needs hardware."""

from unittest.mock import MagicMock, patch

import pytest
from tracker import BeamStatus, BeamTracker, GazeData


class TestGazeData:
    def test_usable_at_medium_confidence(self):
        g = GazeData(x=100, y=200, confidence=2, timestamp=1.0)
        assert g.is_usable

    def test_usable_at_high_confidence(self):
        g = GazeData(x=100, y=200, confidence=3, timestamp=1.0)
        assert g.is_usable

    def test_not_usable_at_low_confidence(self):
        g = GazeData(x=100, y=200, confidence=1, timestamp=1.0)
        assert not g.is_usable

    def test_not_usable_at_lost_tracking(self):
        g = GazeData(x=0, y=0, confidence=0, timestamp=1.0)
        assert not g.is_usable


class TestBeamTrackerWithoutSDK:
    """Tests that run even when beam-eye-tracker is NOT installed."""

    def test_status_without_sdk(self):
        with patch.dict("sys.modules", {"eyeware": None, "eyeware.beam_eye_tracker": None}):
            # Force reimport to test the ImportError path
            tracker = BeamTracker.__new__(BeamTracker)
            tracker._api = None
            tracker._beam = None
            tracker._sdk_available = False
            tracker._last_gaze_time = 0.0
            assert tracker.get_status() == BeamStatus.NOT_INSTALLED

    def test_get_gaze_returns_none_without_api(self):
        tracker = BeamTracker.__new__(BeamTracker)
        tracker._api = None
        tracker._beam = None
        tracker._sdk_available = False
        tracker._last_gaze_time = 0.0
        assert tracker.get_gaze() is None

    def test_attempt_auto_start_returns_false_without_api(self):
        tracker = BeamTracker.__new__(BeamTracker)
        tracker._api = None
        tracker._beam = None
        tracker._sdk_available = False
        tracker._last_gaze_time = 0.0
        assert tracker.attempt_auto_start() is False


class TestBeamTrackerWithMockedSDK:
    """Tests using a mocked Beam SDK."""

    def _make_tracker(self):
        tracker = BeamTracker.__new__(BeamTracker)
        tracker._beam = MagicMock()
        tracker._sdk_available = True
        tracker._api = MagicMock()
        tracker._last_gaze_time = 0.0
        return tracker

    def test_initialize_success(self):
        tracker = self._make_tracker()
        tracker._api = None  # not yet initialized
        result = tracker.initialize(1920, 1080)
        assert result is True
        assert tracker._api is not None

    def test_get_status_tracking(self):
        tracker = self._make_tracker()
        tracker._api.get_tracking_data_reception_status.return_value = "RECEIVING_TRACKING_DATA"
        assert tracker.get_status() == BeamStatus.TRACKING

    def test_get_status_not_receiving(self):
        tracker = self._make_tracker()
        tracker._api.get_tracking_data_reception_status.return_value = "NOT_RECEIVING_TRACKING_DATA"
        assert tracker.get_status() == BeamStatus.NOT_RUNNING

    def test_get_status_attempting(self):
        tracker = self._make_tracker()
        tracker._api.get_tracking_data_reception_status.return_value = "ATTEMPTING_TRACKING_AUTO_START"
        assert tracker.get_status() == BeamStatus.CONNECTING

    def test_get_gaze_valid_data(self):
        tracker = self._make_tracker()
        tracker._beam.NULL_DATA_TIMESTAMP.return_value = -1.0

        mock_state = MagicMock()
        mock_state.user_state.return_value.timestamp_in_seconds = 12345.0
        mock_state.user_state.return_value.unified_screen_gaze.point_of_regard.x = 500.0
        mock_state.user_state.return_value.unified_screen_gaze.point_of_regard.y = 600.0
        mock_state.user_state.return_value.unified_screen_gaze.confidence = 3
        tracker._api.get_latest_tracking_state_set.return_value = mock_state

        gaze = tracker.get_gaze()
        assert gaze is not None
        assert gaze.x == 500.0
        assert gaze.y == 600.0
        assert gaze.confidence == 3

    def test_get_gaze_null_timestamp(self):
        tracker = self._make_tracker()
        tracker._beam.NULL_DATA_TIMESTAMP.return_value = -1.0

        mock_state = MagicMock()
        mock_state.user_state.return_value.timestamp_in_seconds = -1.0
        tracker._api.get_latest_tracking_state_set.return_value = mock_state

        gaze = tracker.get_gaze()
        assert gaze is None

    def test_attempt_auto_start(self):
        tracker = self._make_tracker()
        result = tracker.attempt_auto_start()
        assert result is True
        tracker._api.attempt_starting_the_beam_eye_tracker.assert_called_once()

    def test_shutdown(self):
        tracker = self._make_tracker()
        tracker.shutdown()
        assert tracker._api is None
