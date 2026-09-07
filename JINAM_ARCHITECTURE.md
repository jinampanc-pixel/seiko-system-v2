# Jinam application architecture

**Jinam** is the master application/platform. It securely hosts three separate business applications:

- **SEIKO** — tailoring, uniforms, production and operational ERP workflows.
- **véyn health** — institutional healthcare requirements, products/services and commercial workflows.
- **MeTh** — healthcare-apparel commerce, e-commerce operations, inventory and fulfilment.

The detailed product contract is maintained in [`JINAM_PRODUCT_ARCHITECTURE.md`](./JINAM_PRODUCT_ARCHITECTURE.md).

These businesses are not skins, tenants or module presets of one common workflow. Each business owns its own navigation, domain records, status model, screens, settings, libraries, vendors, expenses and operating process.

## Hard rule: share capability, not business workflow

Code belongs in the shared Jinam platform only when the underlying behaviour is genuinely common. Examples include authentication, user/business membership, permissions, audit/event infrastructure, reusable document rendering, import/search/table primitives, identity/trace primitives, vendor/expense primitives and notification infrastructure.

Business-specific processes stay inside their owning business application even when another business has a superficially similar screen.

## Identity and memberships

One person/account may hold independent memberships in SEIKO, VÉYN and MeTh using the same email/phone identity.

The active business is a hard application boundary. A membership can reduce access within the active business, but it cannot enable another business's modules or workflow.

The UI should expose only the experience required for that membership. Operational workers should not be shown irrelevant owner/admin surfaces merely as disabled controls.

## Shared business capabilities

All three businesses require their own business-separated:

- Client/customer/institution records where applicable,
- Product/service records,
- Vendor records,
- Expense/spend records,
- Settings and permission controls,
- Event/notification hooks suitable for WhatsApp API integration.

Jinam can share neutral storage/search/import/audit/rendering primitives, but the records and workflow meaning remain business-owned.

## SEIKO

SEIKO is the tailoring/uniform operations ERP and production application.

Its current operational surface remains the foundation while Billing/Commercial, Client Library, Product Library, Vendor/Spend and dashboard improvements are added in controlled phases.

SEIKO Billing must use SEIKO document semantics/templates and should not inherit the VÉYN Billing workflow merely because document-rendering primitives are shared.

## véyn health

VÉYN is an institutional-healthcare requirements and commercial application.

The commercial chain is:

`Requirement / Order → Quotation → accepted commercial authority / Customer PO → Delivery Challan → Invoice → Payment`

VÉYN Orders must not import SEIKO's person-wise measurement, label or production workflow.

## MeTh

MeTh is an e-commerce/commerce operations application with its own customers, products, orders, inventory, vendors, expenses and fulfilment.

Where SEIKO manufactures for MeTh, use an explicit linked production handoff instead of shared mutable order state.

The locked cross-business chain is:

`MeTh order → SEIKO production request → SEIKO production updates → SEIKO ready/complete → MeTh packing → MeTh delivery`

**VÉYN is not part of the MeTh fulfilment chain.**

## Shared document capability

The reusable document layer may provide neutral primitives such as party/address blocks, document numbers and dates, line items, quantities, rates, taxes, totals, payment information, terms, QR/document retrieval, signatures and pagination.

Each business still owns its branding, legal terms, tax/document rules and workflow.

## Event and WhatsApp architecture

Meaningful business and operational state changes should emit neutral Jinam events. Businesses can later map those events to WhatsApp templates, recipients and other communication channels without hardcoding WhatsApp behaviour inside individual pages.
