# Stage 2 storage stabilization

The authoritative migration sequence is `migrations/*.sql`, recorded by Wrangler in D1's `d1_migrations` table. The older `drizzle/*.sql` files remain historical inputs; the empty Drizzle journal is not used for deployment. Do not apply both sequences independently.

## Schema and adoption

1. `0001_reproducible_baseline.sql` creates all 23 existing application tables and their indexes/triggers. `IF NOT EXISTS` adopts populated tables without replacing records. A contract test inventories runtime SQL and fails if an object is missing from the baseline.
2. `0002_immutable_billing_client_history.sql` adds append-only before/after history for documents, payments and clients. Existing records receive explicitly marked baseline snapshots; earlier revisions are unavailable. SQL triggers make history insertion atomic with each business mutation and reject audit-row updates/deletions. Snapshots include numbering sequences, monetary columns and creator identity. Amendments also check the original document and current payments atomically.
3. `0003_shared_labels.sql` adds business-scoped label records and append-only label history. Saves require the observed version; deletion retains a tombstone. Browser adoption only inserts absent IDs and cannot overwrite server data or resurrect deleted records.

Before applying this sequence, the migration runner upgrades only missing `version` and `created_at` columns on older shared-record tables. It fills absent creation timestamps from the existing update timestamp; this is an adoption timestamp approximation, not reconstructed creation history. It does not replace document JSON.

Use `npm run db:migrate` for local D1. Remote application uses `npm run db:migrate:remote`, which first exports D1, verifies nonempty SQL and writes a SHA-256 manifest. Failed exports or migrations stop the release. Set `SEIKO_D1_BACKUP_DIR` to an owner-controlled private directory outside the checkout to retain the export. Full database exports contain customer data and authentication/connector records; never commit them or upload them as public CI artifacts.

## Labels

Tasks, both layout libraries, custom size presets, packing presentation rules, package layouts and classification choices use `/api/erp/labels`. Existing designer writers call the shared-storage client explicitly; browser storage remains a cache and durable draft outbox.

The first authorized load preserves the original browser keys under `jinam:<business>:labels:browser-adoption-backup-v1` before migration. Existing remote IDs and tombstones win during adoption. A recovery download retains the original copy and unacknowledged drafts. Permission failures and stale-version conflicts remain visible and retain local data; they do not become confirmed shared saves. A fresh browser loads the same server libraries. Reconnection retries pending changes using their original versions, never silently overwriting another device's work.

Existing label configuration for purposes/representations already uses ERP preferences and remains there. Print/PDF activity lists, session routing and view preferences are outside this migration's scope. Follow-up order batches remain deferred.

## Release paths

`npm run deploy:cloudflare` builds committed code, checks that it is the latest GitHub main with successful SEIKO CI, exports D1, applies migrations, then deploys. It refuses dirty checkouts, superseded commits, failed CI, unavailable CI verification, failed exports and failed migrations.

GitHub's manual production workflow uses this command. Cloudflare's connected Workers build must also use `npm run deploy:cloudflare` as its deploy command; a direct `npx wrangler deploy` bypasses the gate. Verify that setting before publishing schema-dependent code. Preview databases must use their own explicit bindings and migration configuration; never point preview migrations at production.

Before the first production adoption, retain an owner-controlled live D1 export and inspect its schema. Local migration tests do not prove production adoption. After release, verify the production ledger, labels from another browser and billing/client history. No earlier billing history can be recovered by this change.

This stage does not implement the independent encrypted backups, owner restore interface or restore drill required by Stage 3. Ephemeral CI exports and D1 Time Travel do not constitute the required independent backup system.
