# Jinam Product & Architecture Specification v1

Status: working product contract for implementation.

## 1. System identity

The master system is **Jinam**.

Jinam hosts three separate business applications:

- **SEIKO** — tailoring, uniforms, operational ERP and production.
- **véyn health** — institutional healthcare requirements, products/services and commercial fulfilment.
- **MeTh** — healthcare-apparel commerce, e-commerce operations, inventory, vendor and fulfilment management.

Jinam itself uses a black system identity. The intended system icon/favicon is a minimal black symbol combining the letter **J** with a money / `$` visual idea. Business logos remain their own exact assets and are not replaced by the Jinam mark.

The browser/PWA/system name is Jinam. Business applications appear inside Jinam, not as separate unrelated systems.

## 2. Hard architecture rule

SEIKO, VÉYN and MeTh are not skins or presets of one common workflow.

Each business owns its own:

- navigation,
- domain records,
- status model,
- operational workflow,
- dashboards,
- settings,
- libraries,
- document semantics,
- vendor and spend records,
- automation rules,
- permissions and user experience.

Shared Jinam code exists only for genuinely common platform capabilities such as authentication, memberships, permissions, import/export primitives, search/table primitives, audit/event infrastructure, reusable document rendering, notifications, common storage patterns and shared UI foundations.

Share capability, not business workflow.

## 3. Identity, memberships and role-specific experience

One real person/account may be appointed to one, two or all three businesses using the same email/phone identity.

Their role and permissions are independent in each business. Example: the same person can be SEIKO Owner, MeTh Operations and VÉYN Viewer.

The active business is a hard application boundary. Switching to MeTh must never leave SEIKO rendered underneath, and switching to VÉYN must never expose SEIKO modules.

A logged-in user should see only what their current business role requires. Disabled irrelevant modules are not the desired UX.

Example: a stitching worker may see only:

- stitching scan/work actions,
- their own completed work records,
- their own monetary production credits/debits/earnings where permitted.

They should not see owner dashboards, billing, client libraries or unrelated modules.

Owners and admins can assign narrower or broader permissions within the owning business application, but cannot grant modules belonging to another business.

## 4. Jinam navigation and UI rules

Jinam provides a shared UI system while each business keeps its own identity.

Global rules:

- consistent spacing, typography, control sizes, cards, dialogs, tables, hover/focus states and responsive behaviour;
- compact, uncluttered operating UI;
- no marketing/philosophy filler on operational screens;
- no placeholder buttons that look functional without an implemented action;
- contextual navigation must always exist;
- generic `Back` labels are not allowed when the destination is known;
- buttons should read `Back to Home`, `Back to Order Centre`, `Back to Labels`, etc.;
- three-dot menus should contain meaningful record actions;
- every archive action must have a real archive/library view;
- settings should contain business configuration, users/access, templates and appearance where relevant.

## 5. Shared libraries pattern

Libraries are first-class business knowledge stores, not merely dropdowns.

Jinam may share the import/search/deduplication technology, but records remain business-owned.

Common library behaviours:

- create/edit/archive/restore;
- search and filtering;
- owner-manageable suggestion values;
- import from Excel/CSV or structured data;
- learn/update from live orders and transactions;
- deduplicate or suggest likely existing records before creating duplicates;
- preserve a full business-specific record with available contact/details metadata.

### SEIKO libraries

- Client Library
- Product Library
- Order Library
- Label Library
- Vendor Library

### VÉYN libraries

- Institution / Client Library
- Product & Service Library
- Order Library
- Commercial Document Library
- Vendor Library

### MeTh libraries

- Customer Library
- Product Library
- Order Library
- Inventory Library
- Vendor Library

## 6. Vendors, expenses and business spend — all three businesses

**Vendor management and expenditure/spend management are required capabilities in SEIKO, VÉYN and MeTh.**

The implementation may reuse neutral Jinam primitives, but each business owns its own vendor records, expense records, permissions, categories and operational meaning.

Core vendor data may include:

- vendor/business name,
- vendor type/category,
- contacts,
- GST/tax identifiers where applicable,
- addresses,
- bank/payment details where permitted,
- products/services supplied,
- linked purchases/expenses,
- active/archive status,
- notes and attachments/references.

Core spend/expense data may include:

- date,
- vendor or non-vendor payee,
- category,
- amount,
- tax/GST treatment where applicable,
- payment method/reference,
- linked order/project/production job where relevant,
- description,
- attachment/reference,
- created/approved/paid state.

This capability must be permission-controlled. An operational user does not automatically gain financial visibility merely because the capability exists.

## 7. Shared event and WhatsApp integration architecture

Every meaningful business/operational stage in all three apps should be capable of being connected to real-time communication through a WhatsApp API integration.

WhatsApp logic must not be hardcoded separately inside every page.

Jinam should emit business events such as:

- ORDER_CREATED
- ORDER_CONFIRMED
- QUOTATION_ISSUED
- PAYMENT_DUE
- PAYMENT_RECEIVED
- PRODUCTION_REQUESTED
- PRODUCTION_STARTED
- STITCHING_COMPLETED
- PRODUCTION_READY
- READY_FOR_PACKING
- DISPATCHED
- DELIVERED
- INVOICE_ISSUED

Each business can configure:

`event → recipient → message/template → enabled/disabled → channel`

WhatsApp is one channel. The event model should remain neutral enough for email, app notifications or other integrations later.

## 8. Shared document engine

Jinam may provide neutral document-rendering primitives:

- business identity/header,
- party/address blocks,
- document number/date/reference,
- line items,
- quantity/unit/rate/amount,
- taxes,
- totals,
- payment/bank information,
- terms,
- QR/document retrieval,
- signatures/acknowledgement,
- pagination/footer,
- owner-managed templates.

Each business still owns its document semantics, branding, legal wording and workflow.

Template management belongs in business Settings and should support invoices, quotations, delivery challans, payment receipts and future document types.

## 9. GST / non-GST document principle

Commercial documents must support the appropriate tax/document treatment for the transaction instead of maintaining two disconnected billing systems.

The final SEIKO/VÉYN/MeTh tax-document behaviour must be locked only after current Indian GST invoicing/document requirements are researched and verified.

Owners may control allowed templates/tax modes. Other users may receive specific permissions to select or change GST treatment without receiving full template-management rights.

## 10. SEIKO application specification

SEIKO remains the tailoring/uniform operational ERP and production system.

### Home

For an owner/admin, Home is a live, customisable dashboard rather than a philosophy hero.

Potential widgets include:

- sales,
- order intake,
- outstanding payments,
- production status,
- pending delivery,
- work in progress,
- quick operational alerts.

Quick navigation tiles remain useful beneath/within the dashboard.

Other roles receive role-appropriate dashboards rather than the owner view.

### Settings

Settings should contain:

- Users & Access,
- Appearance,
- Templates,
- business configuration,
- owner-managed suggestion/dropdown values,
- future integration settings.

### Orders / Order Centre

The Order Centre remains the central order library/register.

Per-order three-dot actions can include relevant actions such as:

- Open/Edit,
- Labels,
- Billing/Commercial,
- Invoice,
- Delivery Challan,
- Payments,
- Archive.

A real Archived Orders view is required.

Order Centre must provide contextual navigation back to the origin page.

### New Order / Order Setup

- Client Name is an autocomplete/suggestive field backed by SEIKO Client Library.
- Client Library can be bulk-imported and also learns from new orders.
- Contact-person handling must support institutional orders and individual/custom-tailoring/retail customers.
- Remove the unnecessary `required` checkbox below the contact person.
- Billing Address and Delivery Address should sit in the same row on suitable screen sizes.
- Order Setup must provide contextual navigation back to the originating page.

### Product Library and pricing

SEIKO requires its own Product Library with reusable product details and prices.

Products/pricing should be selectable during order entry and can also be adjusted in the order where permissions allow.

### Labels

The Label Centre heading is **Labels**.

It needs contextual navigation back to the origin rather than an unnecessary fixed Order Centre button.

Saved label/library rows receive three-dot actions such as:

- Print,
- Edit,
- Archive.

A real archived label/library view is required.

### Billing / Sales / Commercial

SEIKO now requires a real commercial capability containing:

- quotations where required,
- invoices,
- delivery challans,
- payment receipts,
- payment records,
- outstanding/balance tracking.

The supplied SEIKO invoice is the baseline invoice template reference. Templates must be owner-customisable.

Billing derives from order/client/product data to prevent re-entry.

### MeTh production intake

SEIKO Orders must be capable of receiving explicit linked production requests from MeTh.

A MeTh order is never converted into mutable shared order state. SEIKO receives a linked production job with source references.

When production is complete, SEIKO sends production status/result back to MeTh.

## 11. VÉYN application specification

VÉYN is an institutional healthcare requirements and commercial application.

The exact VÉYN logo asset must be preserved and rendered correctly.

Red remains the primary brand colour. Green should be used subtly for accepted/positive/completion states, status markers and restrained secondary emphasis.

The current permanently-open sidebar is not a locked final pattern. VÉYN should follow Jinam UI standards while retaining VÉYN identity.

Likely top-level areas:

- Home
- Orders
- Libraries
- Billing
- Settings

### Libraries

VÉYN owns its own Institution/Client Library and Product & Service Library.

Institution Name should autocomplete from its library.

Institution Type options must be owner-manageable: add, rename and remove.

Libraries support import and continually learn from orders.

### Orders

Order/requirement records need:

- institution/contact,
- billing/delivery context,
- products/services,
- quantities,
- specifications/references,
- cost price,
- selling price,
- margin controls,
- required dates,
- status.

Product/service lines must remain editable/manageable.

Status controls should be placed where they are immediately usable from both the register and record.

The status model needs a defined stage between `Confirmed` and `Part Delivered`; exact wording/state will be locked with the VÉYN workflow review.

Per-order three-dot actions include relevant status and commercial actions.

### Commercial chain

The core VÉYN flow is:

`Requirement / Order → Quotation → accepted commercial authority / Customer PO → Delivery Challan → Invoice → Payment`

Commercial records remain linked to the originating order and should avoid repeated re-entry.

### Settings

VÉYN Settings contains:

- Users & Access,
- Templates,
- institution type/suggestion management,
- business configuration,
- integrations/notifications later.

## 12. MeTh application foundation

MeTh is an e-commerce/commerce operations application, not a copy of SEIKO or VÉYN.

The online store/website is a source of MeTh orders.

MeTh must be able to fulfil orders from different sources:

- ready inventory purchased from suppliers,
- external suppliers/manufacturers,
- production required.

MeTh owns its own customers, products, orders, inventory, vendors, expenses and fulfilment status.

### Vendors

MeTh vendor examples include:

- fabric suppliers,
- manufacturers,
- SEIKO as a manufacturer,
- label vendors,
- trim vendors,
- packaging vendors,
- other product/service vendors.

Vendor spends and general business spends must be recordable.

### MeTh → SEIKO production handoff → MeTh fulfilment

This chain is explicit and locked:

1. A customer/order enters **MeTh**.
2. MeTh determines that one or more lines require production.
3. MeTh creates a linked production request for **SEIKO**.
4. SEIKO performs production and updates its internal production states.
5. Relevant production progress can be communicated back to MeTh.
6. When SEIKO marks production ready/complete, control returns to **MeTh**.
7. **MeTh handles packing and delivery.**
8. Customer-facing MeTh status updates can be generated from the linked production/fulfilment events.

**VÉYN is not part of the MeTh fulfilment chain.**

MeTh should translate internal SEIKO production states into customer-appropriate MeTh statuses rather than exposing SEIKO's internal terminology directly.

### Automation-first behaviour

MeTh should minimise repeated manual work. Relevant order data should drive:

- production handoff,
- inventory allocation,
- labels,
- packing information,
- fulfilment status,
- customer communications.

## 13. Stability and implementation policy

Jinam is becoming an operational system and must remain usable throughout development.

Rules:

- no dead controls;
- no incomplete module should destabilise working modules;
- new data migrations must be backward-safe where possible;
- business boundaries require regression tests;
- critical actions require permission checks server-side, not only UI hiding;
- destructive/financial actions should be auditable;
- feature exposure should happen only when the corresponding workflow works end-to-end.

Production improvements beyond the current working SEIKO flow remain a later phase unless needed for stability or cross-business handoff foundations.

## 14. Implementation sequence

Recommended order:

1. Jinam identity, business router and role-specific application surface.
2. Shared navigation/UI rules and contextual-back system.
3. Libraries foundation and business-separated client/product/vendor stores.
4. Vendor + expense/spend capability and permissions for all three businesses.
5. SEIKO commercial/billing foundation using the supplied invoice template.
6. VÉYN libraries/order/commercial refinement.
7. MeTh commerce foundation and explicit MeTh ↔ SEIKO production handoff.
8. Event bus + WhatsApp API integration layer.
9. Deeper production automation and advanced dashboards.

This document is the source of truth unless a later explicit product decision supersedes it.