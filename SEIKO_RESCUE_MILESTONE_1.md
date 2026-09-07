# SEIKO Rescue Milestone 1 — Orders + Packing Labels

Status: locked implementation contract for branch `rebuild/seiko-orders-labels-v1`.

## Branch policy

- `main` is untouched until explicit approval.
- `fix/veyn-milestone-one` is a reference/archive branch; no further feature work there.
- This branch is the clean recovery branch for SEIKO.
- Do not add new patch/stabilizer/enhancer layers to fix visible UI defects. Move accepted behaviour into the source-owning React component or shared domain utility.

## Product rule

Modules are standalone. Records are interconnected.

Primary SEIKO work areas:

- Home
- Orders
- Tailoring
- Billing
- Production
- Labels
- Scan
- Trace
- Clients
- Products
- Settings

Order context navigation:

- Overview
- People / Workspace
- Production
- Labels
- Packing
- Billing
- Activity

No module order is mandatory. Institutional, retail, tailoring, production, labels and billing may each be entered directly.

## Priority 0

Make Orders + Packing Labels production-ready before expanding the rest of SEIKO.

Required real workflows:

1. Home → Orders → open order → Workspace → Packing Labels → preview → print → contextual return.
2. Main menu → Labels → find order → Packing → preview → print.
3. Main menu → Orders must always navigate immediately without freezing, recursive DOM clicks, timer-based menu replay or mutation-observer navigation.

## Preserve

- authentication and business membership
- server order persistence and audit
- current `SeikoOrder` domain model
- quantity/product/measurement/specification resolution logic
- existing order data
- accepted spreadsheet/order behaviour
- accepted physical-mm label logic
- business separation and Cloudflare deployment infrastructure

## Remove / consolidate

- overlapping DOM enhancement layers that control navigation, orders, workspace, label canvas or packing interactions
- retired UI patches and dead stabilizers once import/reference checks confirm they are superseded
- timer/sessionStorage/MutationObserver/programmatic-click navigation
- duplicate CSS ownership of the same menu, canvas, drawer or workspace controls

Each interaction has one owner.

## Packing label acceptance

A single reusable person/package layout must resolve from order data per selected record.

- product applicability comes from the order/workspace row only
- resolved quantity 0 omits the product
- blank/non-applicable measurement/specification takes zero printed space
- no gender inference from a name
- no value borrowed from another product or another person's row
- mixed male/female records work with one saved layout
- order-defined person fields automatically remain available
- product-defined measurements/specifications automatically remain available
- conditional values support Never / When present / Always where configured
- product aliases, field-name visibility/bold, value bold, quantity visibility and format are user-configurable
- font resizing visibly changes text size without changing X/Y
- dragging changes X/Y only
- resizing changes box geometry only
- drop-to-remove deletes only the dragged/selected element
- preview and print share the same resolver/render model
- physical size remains 50 × 25 mm for the current Pixra packing-label workflow unless the operator selects another saved size

## Acceptance fixtures

### Primary real fixture — M S Dosvada

Use the supplied real school dataset as the main stress test. It includes:

- female and male recipients
- Kurti, Shirt, Pant, Vest, T-Shirt and Track Pant
- per-product quantities including 0, 1 and 2
- Sleeve, Chest and Waist exceptions
- obese-fit chest cases
- partially blank recipient rows
- mixed classes / streams such as 9H, 11 Sc, 11 Arts, 11 Comm and 12 Arts

This fixture must prove that sparse or mixed rows never cause cross-record or cross-product value fallback.

### Secondary fixture — A S Khambhla

Use the existing smaller order for fast interaction debugging and label-editor iteration.

### Retail guard fixture

Maintain at least one small Retail / Individual order so Orders and Labels never become school-only.

## Definition of done for Milestone 1

Do not call Orders + Packing Labels ready until the same source head passes all of the following:

- lint
- all relevant contract tests
- production build
- render checks
- branch preview deployment
- browser-level whole-app navigation smoke test
- Main menu → Orders
- Main menu → Labels
- Orders → Workspace
- Workspace → Packing Labels
- standalone Labels → order → Packing
- preview at least one male and one female M S Dosvada record using the same layout
- verify sparse/blank row behaviour
- verify font resize, drag, box resize and single-item removal
- verify print preview uses the same resolved content

Automated source assertions alone are not product acceptance.
