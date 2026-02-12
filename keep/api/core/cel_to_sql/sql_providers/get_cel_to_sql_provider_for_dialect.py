from keep.api.core.cel_to_sql.properties_metadata import PropertiesMetadata
from keep.api.core.cel_to_sql.sql_providers.base import BaseCelToSqlProvider
from keep.api.core.cel_to_sql.sql_providers.doris import CelToDorisProvider
from keep.api.core.cel_to_sql.sql_providers.postgresql import CelToPostgreSqlProvider
from keep.api.core.cel_to_sql.sql_providers.sqlite import CelToSqliteProvider
from keep.api.core.cel_to_sql.sql_providers.mysql import CelToMySqlProvider
from keep.api.core.db import engine
from keep.api.core.db_utils import is_doris


def get_cel_to_sql_provider(
    properties_metadata: PropertiesMetadata,
) -> BaseCelToSqlProvider:
    return get_cel_to_sql_provider_for_dialect(engine.dialect.name, properties_metadata)


def get_cel_to_sql_provider_for_dialect(
    dialect_name: str,
    properties_metadata: PropertiesMetadata,
) -> BaseCelToSqlProvider:
    if dialect_name == "sqlite":
        return CelToSqliteProvider(engine.dialect, properties_metadata)
    elif dialect_name == "mysql":
        if is_doris():
            return CelToDorisProvider(engine.dialect, properties_metadata)
        return CelToMySqlProvider(engine.dialect, properties_metadata)
    elif dialect_name == "postgresql":
        return CelToPostgreSqlProvider(engine.dialect, properties_metadata)

    else:
        raise ValueError(f"Unsupported dialect: {engine.dialect.name}")
