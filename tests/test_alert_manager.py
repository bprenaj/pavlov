"""Tests for AlertManager — requires a QApplication instance."""

import sys
import time

import pytest

from PySide6.QtWidgets import QApplication

app = QApplication.instance() or QApplication(sys.argv)

from alert_manager import AlertManager, AlertMode, RETRIGGER_COOLDOWN_S


class TestAlertManager:
    def test_initial_state(self):
        am = AlertManager()
        assert am.is_active is False

    def test_trigger_activates(self):
        am = AlertManager()
        am.trigger()
        assert am.is_active is True
        am.stop()

    def test_stop_deactivates(self):
        am = AlertManager()
        am.trigger()
        am.stop()
        assert am.is_active is False

    def test_double_trigger_is_idempotent(self):
        am = AlertManager()
        am.trigger()
        am.trigger()
        assert am.is_active is True
        am.stop()

    def test_double_stop_is_safe(self):
        am = AlertManager()
        am.stop()
        am.stop()
        assert am.is_active is False

    def test_set_volume(self):
        am = AlertManager()
        am.set_volume(0)
        am.set_volume(100)
        am.set_volume(50)

    def test_set_mode(self):
        am = AlertManager()
        am.set_mode(AlertMode.AUDIO)
        am.set_mode(AlertMode.VISUAL)
        am.set_mode(AlertMode.BOTH)
        am.set_mode(AlertMode.SILENT)

    def test_silent_mode_suppresses_trigger(self):
        am = AlertManager()
        am.set_mode(AlertMode.SILENT)
        am.trigger()
        assert am.is_active is False

    def test_retrigger_cooldown_blocks(self):
        """Immediately after stop(), trigger() should be suppressed."""
        am = AlertManager()
        am.trigger()
        am.stop()
        am.trigger()
        assert am.is_active is False  # cooldown prevents retrigger

    def test_retrigger_after_cooldown_works(self):
        """After the cooldown period, trigger() should work again."""
        am = AlertManager()
        am.trigger()
        am.stop()
        am._last_stop_time = time.time() - RETRIGGER_COOLDOWN_S - 0.1
        am.trigger()
        assert am.is_active is True
        am.stop()
