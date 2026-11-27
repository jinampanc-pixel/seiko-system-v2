# Financial Logic and Sequence Review — 27 November 2026

## Scope and method

This is a second logic review using independently written expected-value models, not an external accounting certification or a separate human review. No live customer records are used or changed. Procurement and production costing remain deferred.

The harness executes the actual Orders, Billing and Order Billing POST handlers against an isolated SQLite database with the real migrations. Authentication grants a synthetic owner; Cloudflare's D1 interface is adapted to SQLite. It does not replace the handlers' pricing, validation, persistence or SQL guards. The separate expected-value models use integer paise and their own physical-stock and allocation calculations. Application totals, allocation, pricing and integrity functions are checked against those answers rather than used to generate them.

## Conservation rules reviewed

- Physical quantities equal original supply plus replacement supply minus returns; returns cannot make retained stock negative.
- Cancellation, hold and reduced assignments preserve financial obligations for garments still held. Returns and explicit reviewed price changes account for reductions.
- Per-garment, complete-set plus extra-garment, and per-student pricing use their respective quantity definitions. Ordered pricing and delivery-based pricing are checked separately.
- Net billed units and principal across original invoices, supplementary invoices and credits equal the independently calculated current agreement after reconciliation. Issued invoice lines remain unchanged.
- Every received paise is either applied to an invoice or remains an unlinked payment/unused advance. Refunds reduce cash exactly once, preserve the original receipt and cannot exceed its eligible balance.
- A quick payment keeps its amount and receipt number when linked. It can become a direct invoice payment only within the outstanding balance; an order link can preserve excess as an advance. A partially refunded unlinked slip cannot be reassigned using its gross value.
- A retry under an existing payment/refund ID cannot collect or return money twice. Changed payloads conflict. A repeated completed link to the same destination is a read-only success; a different destination conflicts.
- Concurrent incoming money or order cancellation invalidates a stale quick-payment link, without a false successful-link audit record.
- GST documents reconcile their exact stored line/tax/credit amounts. Credited tax cannot exceed the source invoice's original tax. Each invoice has its own currency rounding boundary; tax rounding across separately issued documents is not silently treated as a single combined invoice.

## Reproducible sequences

Eight fixed seeds (17, 83, 101, 509, 2027, 4051, 8191, 65537) each run 160 transitions across three isolated orders. All fourteen action categories are exercised: assigned quantity changes, price changes, person states, delivery, returns, quick payments, order advances, later linking, refunds, direct invoice collection, replacements, receipt corrections, rejected excess refunds, and whole-order cancellation/reopening. The test asserts that deliveries, returns, replacements, refunds, both link destinations and receipt amendments actually succeed at least once; merely attempting a category does not count as exercising its successful path.

After every transition the test re-reads stored records, checks garment quantities and planned/delivered charges, reconciles through the actual review/apply API, checks net billed quantities/principal, and reconciles every receipt/allocation/refund and stored paise column. Repeated reads must preserve money. Failures include the seed and recent action trace for replay.

Three further seeded GST runs execute 90 changes each, starting at 5%, 12% and 18%, with mixed tax-rate changes during the sequences. Together the randomized suites cover **1,550 transitions**, in addition to deterministic retry/race/invalid-link tests. The file is part of the standard contract-test command and therefore runs in CI and guarded deployment.

## Defects reproduced and repaired

1. **Historical delivery revalidation blocked financial review after cancellation or assignment reduction.** A standalone billing validation incorrectly treated saved supply as a new delivery against the current production assignment. New-write limits now require a previous snapshot; physical return and replacement-history checks still run. The Orders API supplies the previous snapshot, including for newly created orders, so new supply remains checked.
2. **Unused order advances were absent from Customer Credit in Order Billing.** Money remained in receipts but the summary understated it. The summary now includes unused advances as well as invoice overpayment credits. Refunds and allocations are subtracted before that amount is shown.
3. **A successful quick-payment link could not safely acknowledge a lost-response retry.** It returned “already linked” even for the same destination. Identical destination retries now return the current ledger without changing the receipt or adding another link audit event. Different destinations remain rejected.

## Limits

Local validation includes the locked dependency installation, full contract/outbox suite, production build and rendered-output checks; the additional focused delivery-history regression also passed. Lint on all changed financial source and test files reports no errors or warnings. The guarded release repeats the committed test suite and full browser workflows.

This suite verifies service-level end-to-end behavior and persistence; it is not a randomized browser-click suite. The existing browser suite separately covers desktop/mobile quick payment, link-later and refund UI. SQLite provides the same SQL semantics for these tests, while live D1 network/replication failures and operating-system printer behavior remain separate operational concerns. Deterministic race injections supplement, rather than mathematically prove, every possible distributed interleaving.

The randomized fixture models specified pricing modes, not every possible catalog/conditional-rule combination. Existing focused tests cover class/gender conditions, product alternatives, fixed-price scopes, missing quantities, approved zero prices, permissions, stale order revisions and storage corruption. Passing these checks increases evidence; it does not establish universal defect freedom.
