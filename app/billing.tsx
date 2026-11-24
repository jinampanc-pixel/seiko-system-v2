"use client";

import { type Permission } from "./lib/access-control";

const DOCUMENTS = [
  { key: "quotation", title: "Quotations", description: "Prepare commercial offers using the shared customer, item, service and pricing master.", permission: "billing.quotations.manage" as Permission },
  { key: "purchase-order", title: "Purchase Orders", description: "Record customer POs and supplier purchase commitments without duplicating order data.", permission: "billing.purchase_orders.manage" as Permission },
  { key: "delivery-challan", title: "Delivery Challans", description: "Create dispatch documents from fulfilled orders and saved commercial data.", permission: "billing.delivery_challans.manage" as Permission },
  { key: "invoice", title: "Invoices", description: "Create invoices from approved quotations, orders, challans and billable items.", permission: "billing.invoices.manage" as Permission },
] as const;

export function Billing({ can }: { businessId: string; can: (permission: Permission) => boolean }) {
  return <section className="page billingPage">
    <div className="panel billingHero">
      <p className="eyebrow">BILLING</p>
      <h2>Commercial Documents</h2>

    </div>

    <div className="billingDocumentGrid">
      {DOCUMENTS.map(document => <article className="panel billingDocumentCard" key={document.key}>
        <h3>{document.title}</h3>
        <p>{document.description}</p>
        <button type="button" className="secondary" disabled={!can(document.permission)}>{can(document.permission) ? `Open ${document.title}` : "No Edit Access"}</button>
      </article>)}
    </div>

    <div className="panel billingCatalogCard">
      <div>
        <p className="eyebrow">SHARED COMMERCIAL MASTER</p>
        <h3>Products, Services & Catalog</h3>

      </div>
      <div className="billingCatalogActions">
        <button type="button" className="secondary" disabled={!can("catalog.view")}>View Catalog</button>
        {can("catalog.manage") && <button type="button" className="primary">Manage Items & Services</button>}
      </div>
    </div>
  </section>;
}
