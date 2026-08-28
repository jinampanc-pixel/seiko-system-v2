# Jinam application architecture

**Jinam** is the umbrella application/platform. It provides secure shared platform capabilities to three separate business applications:

- **SEIKO** — tailoring, uniforms, production and operational ERP workflows.
- **véyn health** — institutional healthcare requirements and commercial workflows.
- **MeTh** — healthcare-apparel commerce and operations, with explicit cross-business production handoffs where SEIKO performs manufacturing.

These businesses are not skins, tenants, or module presets of one common workflow. Each business owns its own navigation, domain records, status model, screens and operating process.

## Hard rule: share capability, not business workflow

Code belongs in the shared Jinam platform only when the underlying behaviour is genuinely common. Examples include authentication, user/business membership, permissions, audit/event infrastructure, reusable document rendering, search/table primitives, identity/trace primitives and notification infrastructure.

A business-specific process stays inside that business application even when another business has a superficially similar screen.

## Business application boundaries

The business catalog is the authoritative module upper bound. A user membership can reduce access within a business, but it cannot enable a module that does not belong to that business application.

Role choices are starting presets, not substitutes for the business boundary.

### SEIKO

Current application surface: Home, Orders, Labels, Scan, Trace, Production, Inventory, Sales, Delivery and Admin.

Billing is intentionally **not** exposed as a SEIKO module yet. Shared commercial/document primitives may later be used by SEIKO invoices, challans or quotations without copying the véyn Billing application.

### véyn health

Milestone-one application surface: Home, Orders, Billing and Admin.

The core commercial chain is:

`Requirement / Order → Quotation → accepted commercial authority / PO → Delivery Challan → Invoice`

The VÉYN Orders application is an institutional-healthcare requirement workflow. It must not import SEIKO's person-wise measurements, labels or production process.

### MeTh

MeTh remains a separate business application. Its final module boundary and workflow will be revised independently rather than inherited from SEIKO or VÉYN.

Where SEIKO manufactures for MeTh, use an explicit linked production handoff instead of sharing mutable order state.

## Shared commercial document capability

The reusable layer may provide neutral primitives such as party/address blocks, document numbers and dates, line items, quantities, rates, totals, payment information, terms, QR/document retrieval, signatures and pagination.

Each business still owns its document semantics, legal terms, branding and workflow. For example, a SEIKO invoice can reuse the renderer without inheriting VÉYN's Quotation → PO → Challan → Invoice application workflow.
