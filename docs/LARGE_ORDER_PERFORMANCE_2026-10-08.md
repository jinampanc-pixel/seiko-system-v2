# Large-order performance verification — 2026-10-08

## Delivered changes

- Order Center renders 10 matching orders per page. Search includes order/client details, products/specifications and person-record values. Search and advanced filters select across the entire cached collection before pagination; changing either returns to page one.
- Initial shared-order synchronization reads keyset pages of at most 25 orders. Failed loading does not apply a partial collection. Orders created during loading are picked up by the next version check.
- A cross-device refresh fetches only changed or missing identities in batches of at most 25. Deleted identities leave the cache only after a successful refresh; failed batches preserve it. Existing version checks and draft/conflict protections remain.
- Save and status/archive/delete preflight reads target the relevant order rather than downloading every full order. The server scopes all requests to the authenticated business and rejects invalid batch/page arguments.
- Order Center's compatibility adapter reuses its parsed collection while the stored snapshot is unchanged, and reads the session safety copy when device storage is full.

## Evidence

Synthetic local SQLite: 1,000 orders with 100 records each (100,000 total), all identities and records retained across 40 pages. Largest page approximately 158 KB; one-order read approximately 6.4 KB. Foreign-business reads and unauthorized access rejected. These are local measurements, not Cloudflare timings.

The isolated Chrome scenario seeds 1,001 orders / 100,001 records and checks search for the last order, search by a person value, filtering across pages, 10-row rendering and page navigation. It is included in CI so subsequent changes must preserve this behavior. Existing browser workflows separately verify saves, stale-device conflicts, payment/receipt behavior, archive/delete, quota failure, mobile controls and production handoffs.

Run the scale scenario with `node tests/stabilization-smoke.cjs --large-orders`. Tests use synthetic SQLite/browser storage and never populate the live database.

## Operating limits

This establishes a tested 1,000-order / 100,000-record scenario, not an unlimited-data guarantee. The current compatibility application still retains complete orders in session memory after initial batched loading and serializes its local cache when orders change. Large artwork, unusually large orders, much larger history and weaker devices need separate measurements. A summary-only server search with on-demand order loading and durable browser storage remains a further architectural step for growth beyond the tested envelope.

Cloudflare D1 capacity, request quotas, internet latency and the user's device also affect performance. This change neither purchases capacity nor changes backup authorization/schedules.
