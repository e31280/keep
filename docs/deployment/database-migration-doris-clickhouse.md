# Database Migration Analysis: Apache Doris vs ClickHouse

## Overview

This document analyzes the feasibility and impact of replacing Keep's main database with **Apache Doris** or **ClickHouse**, and recommends the minimum-impact migration path.

Keep currently supports SQLite, PostgreSQL, MySQL, and MSSQL through SQLAlchemy/SQLModel ORM with dialect-specific query branches. The application has **186 database functions** with a mixed OLTP/OLAP workload pattern.

## Recommendation: Apache Doris

**Apache Doris is the recommended choice** for a minimum-impact migration due to its MySQL protocol compatibility, which allows reuse of most existing MySQL dialect code paths.

## Comparison Matrix

| Feature | Apache Doris | ClickHouse |
|---------|-------------|------------|
| **MySQL Protocol Compatible** | ✅ Yes (native) | ❌ No (HTTP/native TCP) |
| **SQLAlchemy Support** | ✅ Via MySQL dialect (`mysql+pymysql`) | ⚠️ Limited (`clickhouse-sqlalchemy`) |
| **Standard SQL** | ✅ Full SQL support | ⚠️ ClickHouse SQL (non-standard) |
| **UPDATE/DELETE** | ✅ Unique Key Model | ⚠️ Async mutations only |
| **Transactions** | ⚠️ Limited (single-table) | ❌ No ACID transactions |
| **UPSERT Support** | ✅ Via `INSERT INTO ... ON DUPLICATE KEY UPDATE` | ❌ ReplacingMergeTree (eventual) |
| **Foreign Keys** | ⚠️ Syntax accepted, not enforced | ❌ Not supported |
| **JSON Functions** | ✅ MySQL-compatible JSON functions | ✅ Own JSON functions |
| **Aggregation** | ✅ Excellent | ✅ Excellent |
| **Real-time Ingestion** | ✅ Good | ✅ Good |
| **ORM Compatibility** | ✅ High (uses MySQL connector) | ❌ Low |
| **Migration Effort** | 🟢 Low | 🔴 High |

## Why Not ClickHouse?

ClickHouse would require a **near-complete rewrite** of the database layer:

1. **No transaction support**: Keep uses multi-statement transactions (e.g., `add_alerts_to_incident`, `merge_incidents_to_id`) that cannot be expressed in ClickHouse.
2. **No real UPDATE/DELETE**: Keep performs frequent single-row updates (user records, incident status changes, workflow state). ClickHouse's async mutations are not suitable.
3. **No SQLAlchemy ORM compatibility**: The `clickhouse-sqlalchemy` library does not support SQLModel patterns, `session.add()`, `session.flush()`, or relationship loading (`joinedload`, `subqueryload`).
4. **No foreign key support**: Keep's data model has extensive foreign key relationships across 20+ tables.
5. **Different SQL dialect**: Every dialect-specific branch (30+ locations in `db.py`) would need ClickHouse-specific code.

## Why Doris?

Apache Doris connects through the **MySQL protocol**, which means:

1. **Driver reuse**: The existing `pymysql` driver works directly with Doris.
2. **Dialect reuse**: Most `mysql` dialect branches in `db.py`, `cel_to_sql`, and `facets_query_builder` work as-is.
3. **ORM compatibility**: SQLModel/SQLAlchemy sessions, `session.add()`, `session.flush()`, relationships all work through the MySQL protocol layer.
4. **JSON functions**: Doris supports `JSON_EXTRACT`, `JSON_UNQUOTE`, `JSON_CONTAINS_PATH` — the same functions Keep already uses for MySQL.
5. **UPSERT**: `INSERT INTO ... ON DUPLICATE KEY UPDATE` is supported when using the Unique Key data model.

## Migration Plan for Apache Doris

### Phase 1: Configuration & Connection (Minimal Code Changes)

**Files changed:**
- `keep/api/core/db_utils.py` — Add Doris connection string support
- `docker-compose-with-doris.yml` — Docker Compose for local Doris development

**Connection string format:**
```
mysql+pymysql://root:@doris-fe:9030/keep
```

Doris uses the MySQL protocol on port **9030** (FE query port), so the existing `mysql+pymysql` driver works directly.

### Phase 2: Schema Adaptation

Doris requires specifying a **data model** for each table. The recommended models are:

| Keep Table | Doris Model | Key Columns | Rationale |
|-----------|-------------|-------------|-----------|
| `alert` | Duplicate Key | `(tenant_id, fingerprint, timestamp)` | Append-only alert events, optimized for time-range scans |
| `lastalert` | Unique Key | `(tenant_id, fingerprint)` | Latest state per alert, needs UPDATE |
| `incident` | Unique Key | `(id)` | Mutable incident metadata |
| `workflow` | Unique Key | `(id)` | Mutable workflow definitions |
| `workflowexecution` | Unique Key | `(id)` | Mutable execution state |
| `tenant` | Unique Key | `(id)` | Small reference table |
| `alertenrichment` | Unique Key | `(id)` | Mutable enrichment data |
| `alerttoincident` | Unique Key | `(alert_id, incident_id)` | Link table with soft-delete |
| `lastalerttoincident` | Unique Key | `(alert_id, incident_id)` | Link table, needs UPDATE |

**Key Doris DDL differences:**
- Replace `AUTO_INCREMENT` with application-generated UUIDs (Keep already uses UUIDs)
- Add `DISTRIBUTED BY HASH(id)` or appropriate distribution key
- Add `PROPERTIES ("replication_num" = "1")` for single-node dev setup
- Remove foreign key constraints (Doris accepts but does not enforce them)

### Phase 3: Query Compatibility

Most MySQL queries work in Doris. Known differences to address:

| MySQL Feature | Doris Support | Workaround |
|--------------|---------------|------------|
| `JSON_TABLE()` | ❌ Not supported | Use `LATERAL VIEW explode_json_array_string()` |
| `FORCE INDEX` hint | ❌ Not supported | Remove hint (Doris has its own optimizer) |
| `GROUP_CONCAT` | ✅ Supported | Works as-is |
| `DATE_FORMAT` | ✅ Supported | Works as-is |
| `JSON_EXTRACT` | ✅ Supported | Works as-is |
| `JSON_UNQUOTE` | ✅ Supported | Works as-is |
| `ON DUPLICATE KEY UPDATE` | ✅ Unique Key model | Works as-is |
| `INSERT IGNORE` | ⚠️ Partial | Use `INSERT INTO ... SELECT ... WHERE NOT EXISTS` |
| `AUTO_INCREMENT` | ⚠️ Limited | Use application-generated IDs |

### Phase 4: Alembic Migrations

Doris does not fully support `ALTER TABLE` for all column changes. The migration strategy:

1. For **new deployments**: Use Doris-native DDL scripts (skip Alembic)
2. For **existing deployments**: Continue using current database, migrate data via ETL
3. Set `SKIP_DB_CREATION=true` when using pre-provisioned Doris schema

## Architecture: Hybrid Approach (Recommended)

For production deployments, the recommended architecture is:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Keep API   │────▶│  PostgreSQL/  │     │   Apache Doris   │
│  (FastAPI)  │     │  MySQL (OLTP) │────▶│   (Analytics)    │
└─────────────┘     └──────────────┘     └─────────────────┘
                         │                        │
                    CRUD operations          Dashboard queries
                    Transactions            Time-series analytics
                    User management         Alert aggregations
```

This hybrid approach:
- Keeps OLTP operations on PostgreSQL/MySQL (proven, zero migration risk)
- Routes analytical queries (distributions, MTTR, metrics) to Doris
- Uses Doris's MySQL protocol for seamless query routing
- Can be implemented incrementally per query function

## Getting Started with Doris

### Local Development

```bash
# Start Keep with Doris
docker compose -f docker-compose-with-doris.yml up -d

# Connection details
# Host: localhost
# Port: 9030 (MySQL protocol)
# User: root
# Password: (empty)
# Database: keep
```

### Configuration

Set the environment variable:
```bash
DATABASE_CONNECTION_STRING=mysql+pymysql://root:@doris-fe:9030/keep
```

## Files Modified in This Migration

| File | Change |
|------|--------|
| `docs/deployment/database-migration-doris-clickhouse.md` | This analysis document |
| `keep/api/core/db_utils.py` | `is_doris()` helper, `get_aggreated_field()` Doris branch (GROUP_CONCAT) |
| `docker-compose-with-doris.yml` | Docker Compose for Doris local development |
| `keep/api/core/db.py` | Doris-specific handling: `JSON_TABLE` → `LATERAL VIEW`, skip `FORCE INDEX`, `filter_query` uses `JSON_CONTAINS` instead of `json_overlaps` |
| `keep/api/core/cel_to_sql/sql_providers/doris.py` | New: `CelToDorisProvider` (inherits MySQL, extensible for Doris differences) |
| `keep/api/core/cel_to_sql/sql_providers/get_cel_to_sql_provider_for_dialect.py` | Route Doris to `CelToDorisProvider` |
| `keep/api/core/facets_query_builder/doris.py` | New: `DorisFacetsQueryBuilder` (uses `json_each` instead of `JSON_TABLE`, no `utf8mb4_0900_ai_ci` collation) |
| `keep/api/core/facets_query_builder/get_facets_query_builder.py` | Route Doris to `DorisFacetsQueryBuilder` |
| `tests/test_doris_support.py` | 12 unit tests covering all Doris-specific branches |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Doris `JSON_TABLE` not supported | Medium | Replace with `LATERAL VIEW` in dialect branch |
| Alembic migrations incompatible | Low | Use `SKIP_DB_CREATION=true` with pre-provisioned schema |
| Transaction isolation differences | Medium | Doris Unique Key model provides read-committed isolation |
| Foreign key not enforced | Low | Keep already handles referential integrity in application code |
| Connection pool behavior | Low | Doris supports MySQL pool semantics |
