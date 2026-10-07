# Production handoffs — 7 October 2026

## Purpose

Production opens an operational workspace rather than a settings form. Select several shared orders, include partial product/measurement quantities, and create one handoff. A row action in Order Center opens production with that order selected. Existing order data, financial behavior, labels and order statuses are not rewritten.

## Demand and cutting

Demand uses product-owned measurements, order quantity policies, group/default exceptions and the existing product applicability resolver. Held records are excluded. Entirely blank measurement entries are shown as unresolved demand rather than silently disappearing. Optional blank waist values are valid; entered waists remain part of a garment's measurement combination. Required missing measurements/specifications and invalid whole-piece quantities prevent release of affected allocations. Order-total products are counted once, independently of person rows.

Suggestions combine matching product descriptions and measurement combinations, retaining separate cutting pattern/attribute signatures. Colours remain separate fabric splits. Suggestions do not establish physical compatibility. Optional cutting lays require the cutting master's confirmation of shape/pattern, fabric, usable width, stretch, grain, print/nap direction and checks/stripes. Every assigned allocation names its own fabric/colour stack. This is a quantity-based lay handoff, not automatic marker nesting or fabric consumption calculation.

## Shared lifecycle

Drafts do not reserve quantities. Released, In progress and Closed normal handoffs reserve their allocations. Only unused drafts/releases can be cancelled, with a reason; cancelled quantities are available again. Released allocations and instructions cannot be edited. Additional demand uses a new partial handoff; rework and extra production are explicitly identified and require an authorisation reason. Source demand changes are shown separately from fixed issued instructions. Reservations follow stable order/product/person-record identities, so correcting a size or colour cannot make already-issued garments available again. Source order version checks and SQL guards reject changes racing a release.

A small per-business revision record and a unique mutation nonce serialise concurrent writes. The revision claim and individual handoff snapshot are written in one atomic D1 batch. A losing version check cannot write a snapshot, even when another request won the same revision. Each handoff has its own row in the existing `jinam_shared_records` table, collection `production-handoffs-v1`. No database schema change is required. Existing audit triggers record these writes; full encrypted business backups already cover these rows and their change history.

## Work, team sheets and recovery

Work entries record good pieces, rejects and authorised extras per allocation and named operation, with actor/time/reason. Good completed quantities cannot exceed the allocation for the same operation, including different letter case. Rejects and extras do not increase customer quantities. Closing a handoff records a note; it does not mark orders complete or pretend all work is finished. This module does not post payroll or automatically alter stock, packing or billing.

Cutting quantities, stitching specifications, order allocations and bundle tickets have separate printable sheets. Browser Print / Save PDF produces an A4 PDF; draft and cancelled states remain visibly marked. Product tables use shared page space; clicking Trace quantity exposes contributing orders on screen. Bundle tickets have handoff, bundle-size, allocation and sequence identifiers and preserve order/product/measurement/fabric details. They do not require scanning.

Unsaved drafts are retained in the current browser tab's session storage when available, with an unload warning. Failed shared writes keep open edits and never show success. Refresh updates shared data without discarding an open draft. Source changes must be explicitly reviewed before accepting updated source details. Planning preferences remain available in a secondary screen and retain their existing browser-only scope; they do not drive payroll.

## Operational bounds

A handoff supports up to 25 source orders, 3,000 allocation rows and 100 optional lays; positive whole-piece allocations are capped at 100,000 per row. Individual stored handoffs stop accepting further history at 1.5 MiB; existing data is preserved and further work must use another handoff. Bundle print runs are bounded to 2,000 tickets. These are explicit protective limits, not paid-service requirements. Full-business backup coverage is unchanged.

## Verification

Tests cover multi-order size aggregation, colour and pattern separation, optional waist variants, held/unresolved records, order-total quantities, partial claims, source revisions and changed-variant duplicate prevention, rework reasons, lay confirmation, authorization, stale writes, simultaneous releases and a source edit occurring between validation and the atomic write. Browser tests exercise five orders, partial quantities, two differently coloured stacks in one confirmed lay, failed save retention, release, source allocation tracing, bundle tickets, PDF rendering, work entry, mobile widths and reopening shared records.

Final local verification: clean lockfile install; 286 contract/runtime tests, production build and 3 rendered-page tests passed. Full browser smoke passed for order saving, billing, the five-order handoff, shared labels and encrypted backup/recovery. Lint completed with no errors (24 existing warnings). No customer orders or production records were changed during these isolated checks.

Production cold-start correction: order preset definitions use deterministic template IDs; order setup still assigns fresh IDs when copying templates. The actual built Worker Production endpoint now has a Miniflare cold-start regression test (previously reproduced HTTP 500, now returns JSON 401 without a session). Failed initial loads show a readable retry message and do not claim the handoff list is empty. Full tests/build passed (286 runtime/contract plus 4 render/Worker checks), focused five-order browser workflow passed, lint has zero errors.

## Large order catalogues

Production order search now runs in D1 and returns 25 summaries per page, ordered by updated time and ID. Search matches order number, client and product; status and delivery-date filters apply on the server. Completed and cancelled orders are excluded by default and can be explicitly included. Literal search text is bound as data. A selection tray retains up to 25 orders while changing pages and searches; only selected source orders and an opened handoff's source orders load their person records. The quantities table shows demand, issued and remaining quantities for those orders.

Active handoffs and closed/cancelled history have separate filters, search by handoff name/number and 25 summaries per page. Opening a handoff retrieves its fixed instructions and events. Related reservations remain available for duplicate prevention, without transferring their events, history, lays or unrelated order allocations. The business revision lock and source guards remain authoritative. The catalogue has no 25-order cap; that cap applies only to one combined handoff.

Verification includes 1,006 orders in SQLite, summary payload bounds, non-overlapping pages, product search, delivery filtering, selected detail loading, selection limits, and 56 historical handoffs. Browser coverage seeds over 1,000 orders and verifies selection across server pages and searches alongside the existing five-order cutting/release/work workflow. These are correctness checks, not a production throughput benchmark; JSON product searches still inspect matching business records on the server.

The draft allocation editor shows one product at a time with product quantity totals. Switching products preserves all allocations and edits. Quantity tables and the on-screen team-sheet preview have bounded scroll areas; printed/PDF sheets remain complete and unbounded. Opening saved instructions loads their own source orders independently of the selection tray.

Before creating a draft, selected-order quantities show product totals first. Size rows load into the visible review table only after choosing a product (or explicitly All products), with 25 size/order rows per page. Changing that view does not remove other products or reset entered quantities.
