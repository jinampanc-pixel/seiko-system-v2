# SEIKO Priority 0 Acceptance Contract

This document is authoritative for the clean `rebuild/seiko-orders-labels-v1` runtime.

## Development rule

No patch-on-patch UI development is accepted.

Every visible interaction must be owned by the React component responsible for that feature. Historical DOM enhancers may remain as reference source only while the clean replacement is incomplete; they must not control the Priority 0 runtime.

Shared data logic belongs in domain/model helpers. Module-specific UI and state belong in the module that renders them. CSS must be scoped to the clean SEIKO runtime and loaded after retained legacy styles.

## Priority 0 operational scope

The production-critical modules are:

1. Orders and Workspace
2. Packing Labels
3. Reports and PDF/CSV export
4. Billing: Invoice and Delivery Challan

Orders are the source of truth. The other three modules derive their order, person, product, quantity, measurement and specification data from the same order records.

## Required journeys

### Orders

- Home → Orders opens Order Center without reload loops or DOM-replayed clicks.
- Existing orders open normally.
- Order Setup and Workspace remain editable.
- Workspace rows, dynamic person fields, products, quantities, measurements and specifications remain source-backed.
- Returning from Workspace must not lose or invent order data.

### Packing Labels

- Home or menu → Packing Labels shows active orders.
- Order → Packing Labels opens the dedicated person/package packing designer.
- Product applicability is resolved per record.
- Missing/non-applicable conditional values occupy zero printed space.
- Font resize changes font size only, never X/Y.
- Drag changes X/Y only.
- Drop-to-remove deletes only the dragged item.
- Saved packing sets/layouts remain order-aware.
- Printing uses the physical 50 × 25 mm label model.

### Reports

- Any order-defined person field can be used as a report filter.
- Multiple filters can be combined.
- Products can be selected independently for a report.
- Person rows and product totals use the order quantity resolver.
- Reports clearly distinguish ordered/planned quantities from issued/dispatched quantities until real issue state exists.
- Report setups can be saved and reused.
- Output supports Print/Save PDF and CSV.
- M S Dosvada acceptance case: filter the desired class/group and select only formal-uniform products to produce a person-wise report with names, garment quantities and totals.

### Billing and Delivery Challans

- Any active order can generate an Invoice or Delivery Challan.
- Product lines and ordered quantities derive from the order.
- A document may include a subset of products and a partial quantity, but document quantity may not exceed ordered quantity.
- Invoice supports GST/non-GST and intra/inter-state treatment.
- Delivery Challan does not invent commercial prices.
- Saved documents remain linked to the source order.
- Documents support Print/Save PDF.

## UI/UX acceptance

- One full-height menu owner.
- No invisible click interception, recursive navigation, timer-driven replay, or MutationObserver-driven routing.
- Desktop and mobile layouts must preserve usable controls without nested accidental scroll traps.
- Empty states must explain the next valid action.
- No visible module should be a dead placeholder.
- Print output must hide application controls and print only the intended report/document/label surface.

## Data accuracy rules

- Never infer gender, applicability, issue state, or measurements from names.
- Never borrow a measurement/specification from another product.
- Never report `ordered` as `issued` or `delivered` unless an actual issue/dispatch record exists.
- Order-total products are not silently distributed among people.
- Filters never change the underlying order.
- Billing document quantities never mutate the order quantities.

## Release gate

A build is not called ready merely because CI is green.

Minimum release evidence:

- lint passes
- contract tests pass
- production build passes
- render checks pass
- Cloudflare deployment passes
- live user journey review covers Orders, Workspace, Packing Labels, Reports, Invoice and Delivery Challan
- any live issue found during review is fixed in the owning source component, not through an overlay patch
