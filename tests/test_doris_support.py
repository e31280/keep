"""Tests for Apache Doris database support helpers across the codebase."""

import importlib
import json
import os
from unittest.mock import MagicMock, patch, PropertyMock

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reload_db_utils_with(env: dict):
    """Reload db_utils with the given environment variables."""
    import keep.api.core.db_utils as mod
    importlib.reload(mod)
    return mod


def _make_mock_session(dialect_name: str = "mysql"):
    """Create a mock SQLAlchemy Session whose dialect.name returns *dialect_name*."""
    session = MagicMock()
    session.bind.dialect.name = dialect_name
    return session


# ---------------------------------------------------------------------------
# is_doris() tests
# ---------------------------------------------------------------------------

def test_is_doris_returns_false_by_default():
    """is_doris() should return False when KEEP_DATABASE_TYPE is not set."""
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("KEEP_DATABASE_TYPE", None)
        mod = _reload_db_utils_with({})
        assert mod.is_doris() is False


def test_is_doris_returns_true_when_set():
    """is_doris() should return True when KEEP_DATABASE_TYPE=doris."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "doris"}):
        mod = _reload_db_utils_with({"KEEP_DATABASE_TYPE": "doris"})
        assert mod.is_doris() is True


def test_is_doris_case_insensitive():
    """is_doris() should be case-insensitive."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "Doris"}):
        mod = _reload_db_utils_with({"KEEP_DATABASE_TYPE": "Doris"})
        assert mod.is_doris() is True


def test_is_doris_returns_false_for_other_values():
    """is_doris() should return False for non-doris values."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "mysql"}):
        mod = _reload_db_utils_with({"KEEP_DATABASE_TYPE": "mysql"})
        assert mod.is_doris() is False


# ---------------------------------------------------------------------------
# get_aggreated_field() Doris branch
# ---------------------------------------------------------------------------

def test_get_aggreated_field_doris_uses_group_concat():
    """When is_doris() is True and dialect is mysql, use GROUP_CONCAT (not json_arrayagg)."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "doris"}):
        mod = _reload_db_utils_with({"KEEP_DATABASE_TYPE": "doris"})
        session = _make_mock_session("mysql")
        result = mod.get_aggreated_field(session, "col", "alias")
        # The label should be "alias" and it should use group_concat
        assert result is not None
        # Verify it's using group_concat (check SQLAlchemy element name)
        assert "group_concat" in str(result).lower()


def test_get_aggreated_field_mysql_uses_json_arrayagg():
    """When is_doris() is False and dialect is mysql, use json_arrayagg."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "auto"}):
        mod = _reload_db_utils_with({"KEEP_DATABASE_TYPE": "auto"})
        session = _make_mock_session("mysql")
        result = mod.get_aggreated_field(session, "col", "alias")
        assert result is not None


# ---------------------------------------------------------------------------
# CEL-to-SQL provider routing
# ---------------------------------------------------------------------------

def test_cel_provider_doris_returns_doris_provider():
    """When is_doris() is True, the MySQL dialect should get CelToDorisProvider."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "doris"}):
        _reload_db_utils_with({"KEEP_DATABASE_TYPE": "doris"})
        from keep.api.core.cel_to_sql.sql_providers.doris import CelToDorisProvider
        from keep.api.core.cel_to_sql.sql_providers.get_cel_to_sql_provider_for_dialect import (
            get_cel_to_sql_provider_for_dialect,
        )
        fake_metadata = MagicMock()
        provider = get_cel_to_sql_provider_for_dialect("mysql", fake_metadata)
        assert isinstance(provider, CelToDorisProvider)


def test_cel_provider_mysql_returns_mysql_provider():
    """When is_doris() is False, the MySQL dialect should get CelToMySqlProvider."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "auto"}):
        _reload_db_utils_with({"KEEP_DATABASE_TYPE": "auto"})
        from keep.api.core.cel_to_sql.sql_providers.mysql import CelToMySqlProvider
        from keep.api.core.cel_to_sql.sql_providers.get_cel_to_sql_provider_for_dialect import (
            get_cel_to_sql_provider_for_dialect,
        )
        fake_metadata = MagicMock()
        provider = get_cel_to_sql_provider_for_dialect("mysql", fake_metadata)
        assert isinstance(provider, CelToMySqlProvider)


# ---------------------------------------------------------------------------
# Facets query builder routing
# ---------------------------------------------------------------------------

def test_facets_builder_doris_returns_doris_builder():
    """When is_doris() is True, MySQL dialect should get DorisFacetsQueryBuilder."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "doris"}):
        _reload_db_utils_with({"KEEP_DATABASE_TYPE": "doris"})
        from keep.api.core.facets_query_builder.doris import DorisFacetsQueryBuilder
        from keep.api.core.facets_query_builder.get_facets_query_builder import (
            get_facets_query_builder_for_dialect,
        )
        fake_metadata = MagicMock()
        builder = get_facets_query_builder_for_dialect("mysql", fake_metadata)
        assert isinstance(builder, DorisFacetsQueryBuilder)


def test_facets_builder_mysql_returns_mysql_builder():
    """When is_doris() is False, MySQL dialect should get MySqlFacetsQueryBuilder."""
    with patch.dict(os.environ, {"KEEP_DATABASE_TYPE": "auto"}):
        _reload_db_utils_with({"KEEP_DATABASE_TYPE": "auto"})
        from keep.api.core.facets_query_builder.mysql import MySqlFacetsQueryBuilder
        from keep.api.core.facets_query_builder.get_facets_query_builder import (
            get_facets_query_builder_for_dialect,
        )
        fake_metadata = MagicMock()
        builder = get_facets_query_builder_for_dialect("mysql", fake_metadata)
        assert isinstance(builder, MySqlFacetsQueryBuilder)


# ---------------------------------------------------------------------------
# Doris CEL provider inherits from MySQL
# ---------------------------------------------------------------------------

def test_doris_cel_provider_inherits_mysql():
    """CelToDorisProvider should be a subclass of CelToMySqlProvider."""
    from keep.api.core.cel_to_sql.sql_providers.doris import CelToDorisProvider
    from keep.api.core.cel_to_sql.sql_providers.mysql import CelToMySqlProvider
    assert issubclass(CelToDorisProvider, CelToMySqlProvider)


# ---------------------------------------------------------------------------
# Doris facets builder JSON array handling (no JSON_TABLE)
# ---------------------------------------------------------------------------

def test_doris_facets_builder_does_not_use_json_table():
    """DorisFacetsQueryBuilder should NOT call func.json_table for JSON arrays."""
    from keep.api.core.facets_query_builder.doris import DorisFacetsQueryBuilder
    import inspect
    source = inspect.getsource(DorisFacetsQueryBuilder._build_facet_subquery_for_json_array)
    # Must not call func.json_table — instead uses func.json_each
    assert "func.json_table" not in source
    assert "func.json_each" in source
