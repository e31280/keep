"""Tests for Apache Doris database support helpers in db_utils."""

import os
from unittest.mock import patch

import pytest


def test_is_doris_returns_false_by_default():
    """is_doris() should return False when KEEP_DATABASE_TYPE is not set."""
    with patch.dict(os.environ, {}, clear=False):
        # Remove the env var if present
        os.environ.pop("KEEP_DATABASE_TYPE", None)
        # Re-import to pick up default
        import importlib
        import keep.api.core.db_utils as mod

        importlib.reload(mod)
        assert mod.is_doris() is False


def test_is_doris_returns_true_when_set():
    """is_doris() should return True when KEEP_DATABASE_TYPE=doris."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "doris"}):
        import importlib
        import keep.api.core.db_utils as mod

        importlib.reload(mod)
        assert mod.is_doris() is True


def test_is_doris_case_insensitive():
    """is_doris() should be case-insensitive."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "Doris"}):
        import importlib
        import keep.api.core.db_utils as mod

        importlib.reload(mod)
        assert mod.is_doris() is True


def test_is_doris_returns_false_for_other_values():
    """is_doris() should return False for non-doris values."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "mysql"}):
        import importlib
        import keep.api.core.db_utils as mod

        importlib.reload(mod)
        assert mod.is_doris() is False
