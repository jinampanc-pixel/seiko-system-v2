# VÉYN Health — Milestone 1

Status: product scope locked from owner-supplied quotation, delivery challan and exact logo.

## Scope

VÉYN is a separate ERP/business workflow. It is not a healthcare-themed SEIKO workflow and does not use MedTech, MedInfra or other division navigation in this milestone.

Milestone 1 contains only:

- Home
- Orders
- Billing
  - Quotation
  - Purchase Order / accepted quotation
  - Delivery Challan
  - Invoice
- Settings / access administration

Shared platform components may be reused, but business data, workflow, permissions, numbering and document outputs remain VÉYN-specific.

## Brand rules

- Use the supplied `véyn health` logo asset unchanged. Do not crop, redraw, reconstruct, recolour or split the logo.
- Blood red is the primary UI colour for headings, primary actions and important VÉYN emphasis.
- Green is a secondary/lower-hierarchy colour, appropriate for supporting statuses, secondary table emphasis and lower-level accents.
- Do not let green visually compete with the red wordmark/primary actions.
- Keep document outputs clean, institutional and print-first.

## Commercial workflow

The commercial record must be a connected lifecycle, not four disconnected documents:

`Quotation → accepted quotation / PO → Order → Delivery Challan(s) → Invoice`

Each downstream document inherits the customer, items, units, quantities, rates and references from the upstream record so they are not retyped.

### 1. Quotation

Reference supplied: PHC Raigadh quotation dated 13 August 2026.

Required data and output structure:

- VÉYN identity and address
- quotation date
- valid-till date
- reference / subject
- customer / institution
- attention person
- customer address
- optional opening note
- line items:
  - serial number
  - description
  - quantity
  - unit
  - unit rate
  - amount
- total
- total quotation value
- amount in words
- terms and conditions
- VÉYN authorised/proprietor signatory area
- customer acceptance / sign / stamp area
- footer contact / website / location

Quotation statuses should support at least Draft, Sent, Accepted, Rejected/Expired and Revised.

A revision must preserve the prior version rather than overwrite its commercial history.

### 2. Purchase Order / accepted quotation

The owner-supplied quotation states that signed/stamped or written acceptance is equivalent to a confirmed Purchase Order and authorises supply.

The ERP therefore supports both:

- a customer-supplied PO number/document linked to the quotation; or
- an accepted quotation converted into the confirmed PO/order state when no separate customer PO exists.

The PO/order must retain a direct reference to its source quotation and revision.

### 3. Delivery Challan

Reference supplied: DC-0339 dated 21 August 2026.

Required structure:

- Delivery Challan heading
- Recipient Copy and Supplier Copy on the same printable document, separated by a cut line
- VÉYN identity and location
- challan number
- date
- quotation / PO reference
- Deliver To institution
- attention person and destination detail
- line items:
  - serial number
  - description
  - ordered quantity
  - delivered quantity
  - pending quantity
  - unit
- calculated delivery status
- goods-received statement
- VÉYN authorised signature
- Delivered By name/signature
- Received By customer name/signature/stamp
- footer identifying the document as `Not a Tax Invoice`

Partial deliveries are first-class. A challan may deliver only part of the order. Pending quantity must be derived from ordered quantity minus cumulative delivered quantity and must not be manually retyped when it can be calculated.

Multiple challans may therefore belong to one order/PO.

### 4. Invoice

Invoice creation must come from the confirmed commercial/order data and delivery state rather than re-entering the items.

Milestone 1 invoice requirements:

- source quotation / PO / order references
- customer billing identity and delivery identity
- billable items and quantities
- rates inherited from the accepted commercial record unless an authorised user changes them
- taxes/discounts/rounding as configurable commercial fields
- invoice total and amount in words
- payment terms/status
- print/PDF output
- role/permission protection for pricing and financial information

Exact final invoice print template is to follow the owner's approved invoice reference when supplied; do not invent a conflicting visual format in advance.

## Order record

The Order module is the operational source for the accepted VÉYN transaction. It should show the connected commercial documents and fulfilment state rather than duplicate them.

Minimum order information:

- internal order ID/number
- customer/institution
- contact / attention person
- billing and delivery addresses
- phone/email where present
- source quotation and revision
- PO/reference
- line items, descriptions, units and ordered quantities
- accepted rate visibility only for authorised finance/pricing users
- delivery progress
- linked challans
- linked invoice(s)
- status and audit trail

## Permissions

VÉYN uses the shared identity/permission engine, but permissions must be applied to VÉYN's actual workflow.

Examples:

- users may be allowed to view orders without seeing rates or totals;
- pricing users may create/edit quotation rates;
- dispatch users may create delivery challans without seeing cost/margin information;
- finance users may create invoices;
- only authorised users may revise accepted commercial values;
- Owner retains business settings and shared-list management authority.

## Milestone acceptance

Milestone 1 is not complete until an authorised user can perform this end-to-end path from the VÉYN interface:

1. Create/find the PHC Raigadh-style customer/order.
2. Create a quotation matching the supplied quotation structure.
3. Accept/convert it and store a PO/reference without re-entering the lines.
4. Create one or more delivery challans matching the supplied two-copy DC structure, including partial delivery and pending quantity.
5. Create an invoice from the same commercial record.
6. Save, reopen, search, print/PDF and audit each connected document.
7. Confirm unauthorised users cannot see or change protected financial information.

SEIKO completion remains the immediate product priority; this branch establishes VÉYN Milestone 1 without merging incomplete VÉYN UI into production.
