"use client";

import { type Permission } from "./lib/access-control";

const DOCUMENTS = [
  { key: "quotation", title: "Quotations", description: "Prepare commercial offers using the shared customer, item, service and pricing master.", permission: "billing.quotations.manage" as Permission },
  { key: "purchase-order", title: "Purchase orders", description: "Record customer POs and supplier purchase commitments without duplicating order data.", permission: "billing.purchase_orders.manage" as Permission },
  { key: "delivery-challan", title: "Delivery challans", description: "Create dispatch documents from fulfilled orders and saved commercial data.", permission: "billing.delivery_challans.manage" as Permission },
  { key: "invoice", title: "Invoices", description: "Create invoices from approved quotations, orders, challans and billable items.", permission: "billing.invoices.manage" as Permission },
] as const;

export function Billing({ can }: { businessId: string; can: (permission: Permission) => boolean }) {
  return <section className="page billingPage">
    <div className="panel billingHero">
      <p className="eyebrow">BILLING</p>
      <h2>Commercial documents</h2>
      <p>Quotation → PO → Delivery Challan → Invoice. All four use the same customer, item/service and pricing source so values do not have to be entered again.</p>
    </div>

    <div className="billingDocumentGrid">
      {DOCUMENTS.map(document => <article className="panel billingDocumentCard" key={document.key}>
        <h3>{document.title}</h3>
        <p>{document.description}</p>
        <button type="button" className="secondary" disabled={!can(document.permission)}>{can(document.permission) ? `Open ${document.title}` : "No edit access"}</button>
      </article>)}
    </div>

    <div className="panel billingCatalogCard">
      <div>
        <p className="eyebrow">SHARED COMMERCIAL MASTER</p>
        <h3>Products, services & catalog</h3>
        <p>The item/service master used while preparing quotations becomes the source for the business catalog. The catalog is a presentation of the same records—not another product database.</p>
      </div>
      <div className="billingCatalogActions">
        <button type="button" className="secondary" disabled={!can("catalog.view")}>View catalog</button>
        {can("catalog.manage") && <button type="button" className="primary">Manage items & services</button>}
      </div>
    </div>
  </section>;
}
