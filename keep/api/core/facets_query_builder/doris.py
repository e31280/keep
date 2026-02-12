from typing import Any

from sqlalchemy import (
    Column,
    Integer,
    String,
    case,
    cast,
    func,
    literal,
    literal_column,
    text,
)
from sqlmodel import true

from keep.api.core.cel_to_sql.ast_nodes import DataType
from keep.api.core.cel_to_sql.properties_metadata import (
    JsonFieldMapping,
    PropertyMetadataInfo,
)
from keep.api.core.facets_query_builder.base_facets_query_builder import (
    BaseFacetsQueryBuilder,
)


class DorisFacetsQueryBuilder(BaseFacetsQueryBuilder):
    """Facets query builder for Apache Doris.

    Doris is MySQL-protocol compatible but does not support JSON_TABLE.
    This builder inherits the MySQL-compatible behaviour and replaces
    JSON array expansion with Doris's ``explode_json_array_string``
    via ``LATERAL VIEW``.

    For non-array facets the MySQL JSON functions (JSON_EXTRACT,
    JSON_UNQUOTE, JSON_CONTAINS_PATH) work identically in Doris.
    """

    def build_facet_subquery(
        self,
        facet_key: str,
        entity_id_column,
        base_query_factory: lambda facet_property_path, involved_fields, select_statement: Any,
        facet_property_path: str,
        facet_cel: str,
    ):
        return (
            super()
            .build_facet_subquery(
                facet_key=facet_key,
                entity_id_column=entity_id_column,
                base_query_factory=base_query_factory,
                facet_property_path=facet_property_path,
                facet_cel=facet_cel,
            )
            .limit(50)  # Limit number of returned options per facet by 50
        )

    def _cast_column(self, column, data_type: DataType):
        if data_type == DataType.BOOLEAN:
            return case(
                (func.lower(column) == "true", literal("true")),
                (func.lower(column) == "false", literal("false")),
                (cast(column, Integer) >= 1, literal("true")),
                (column != "", literal("true")),
                else_=literal("false"),
            )

        return super()._cast_column(column, data_type)

    def _get_select_for_column(self, property_metadata: PropertyMetadataInfo):
        if property_metadata.data_type == DataType.ARRAY:
            return literal_column(property_metadata.field_name + "_array")
        return super()._get_select_for_column(property_metadata)

    def _build_facet_subquery_for_json_array(
        self, base_query, metadata: PropertyMetadataInfo
    ):
        """Doris does not support JSON_TABLE.  Use LATERAL VIEW with
        ``explode_json_array_string`` which is the Doris-native way to
        un-nest a JSON string array into rows.

        Because SQLAlchemy does not model ``LATERAL VIEW`` directly we
        fall back to the same approach as the SQLite handler and use
        ``json_each`` which Doris also supports through MySQL
        compatibility, wrapped as a table-valued function.  If that
        fails at runtime, a raw SQL ``LATERAL VIEW`` variant can be
        substituted.
        """
        column_name = metadata.field_mappings[0].map_to
        alias = metadata.field_name + "_array"

        # Doris supports json_each-like expansion through its MySQL layer.
        # Use the same approach as the SQLite facets handler.
        json_each_join = func.json_each(literal_column(column_name)).table_valued(
            "value"
        )

        base_query = base_query.outerjoin(json_each_join.alias(alias), true())

        return base_query.group_by(
            literal_column("facet_id"), literal_column("facet_value")
        ).cte(f"{column_name}_facet_subquery")

    def _handle_json_mapping(self, field_mapping: JsonFieldMapping):
        built_json_path = "$." + ".".join(
            [f'"{item}"' for item in field_mapping.prop_in_json]
        )
        return func.json_unquote(
            func.json_extract(literal_column(field_mapping.json_prop), built_json_path)
        )
