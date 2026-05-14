# Database migrations (Section E1)

Schema bootstrap for new environments still runs from **`src/common/database/index.js`** (`initDB()`), which applies idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER`-style steps.

For **production roll-forward and rollback**, prefer a dedicated migration process (e.g. `node-pg-migrate`, `sqitch`, or Flyway) that:

1. Stores applied revision IDs in a `schema_migrations` (or equivalent) table.
2. Runs ordered SQL (or JS) files in CI and deploy pipelines **before** app rollout.
3. Keeps `initDB()` limited to **non-destructive** compatibility fixes or new-greenfield setup only.

Add numbered migration files under this directory when you adopt a runner; until then, treat `initDB` as the source of truth and document manual DBA steps for breaking changes.
