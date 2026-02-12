"""CEL-to-SQL provider for Apache Doris.

Doris is MySQL-protocol compatible and supports the same JSON functions
(``JSON_EXTRACT``, ``JSON_UNQUOTE``, ``JSON_CONTAINS``, etc.).  This
provider inherits from the MySQL provider and can override methods if
Doris-specific SQL differences are discovered in the future.
"""

from keep.api.core.cel_to_sql.sql_providers.mysql import CelToMySqlProvider


class CelToDorisProvider(CelToMySqlProvider):
    """CEL-to-SQL provider for Apache Doris.

    Currently identical to the MySQL provider.  Exists as a dedicated
    class so that Doris-specific adjustments can be made without
    affecting the MySQL code path.
    """

    pass
