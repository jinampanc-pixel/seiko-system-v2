# Business application architecture

This repository currently provides a shared operational foundation for three businesses, but the businesses are **not three skins of the same application**. Their workflows, modules and future navigation may diverge substantially.

## Business boundaries

### SEIKO

SEIKO is the production and custom-tailoring operations system. Its core responsibilities include institutional and individual orders, measurements, labels, production, packing, inventory, invoicing/delivery workflows and traceability.

### MeTh

MeTh is a separate healthcare-apparel business application. A separate customer-facing online store will be built for MeTh; that storefront is not this ERP application.

Customer orders placed through the future MeTh store should flow into the MeTh operational application. When an order or order line requires custom tailoring/production by SEIKO, MeTh should create an explicit production handoff to SEIKO rather than sharing or duplicating SEIKO's internal workflow state.

Typical direction:

`MeTh storefront order -> MeTh order/fulfilment -> production handoff -> SEIKO production -> status/result returned to MeTh`

### véyn health

véyn health is a separate institutional-healthcare application with its own business processes and workflow. It may reuse platform capabilities where appropriate, but its navigation and operational model should be designed for véyn health rather than inherited from SEIKO or MeTh.

## Shared foundation

Capabilities may be reused across businesses when their underlying behaviour is genuinely common. Examples include authentication, membership/roles, UI primitives, audit/event history, traceability primitives, label infrastructure, reusable search/table components, notification infrastructure, and selected order/inventory abstractions.

Shared code must be implemented as reusable platform/domain capability, not by forcing all three businesses through one business-specific workflow.

## Cross-business integrations

Cross-business work should use explicit contracts/events and source references. A MeTh order that needs SEIKO production should remain a MeTh order while generating a linked SEIKO production/work order. Each side retains its own status model and audit history, with stable references between them.

Avoid shared mutable business records that make one application's workflow dependent on another application's UI implementation.

## Product rule

Before adding a module or workflow, decide whether it is:

1. a genuinely shared platform capability,
2. a business-specific capability for SEIKO, MeTh or véyn health, or
3. an explicit integration between businesses.

Do not assume that a module belongs to all businesses simply because it already exists in the shared shell.
