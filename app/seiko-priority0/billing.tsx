"use client";

import { useMemo, useState } from "react";
import { quantityForRecord, type ProductPolicy, type SeikoOrder } from "../lib/order-domain";
import { billingStoreKey, documentTotals, nextDocumentNumber, type SeikoBillingLine, type SeikoCommercialDocument, type SeikoDocumentKind, type SeikoTaxMode } from "../lib/seiko-billing";
import { activeProducts, displayOrder, SEIKO_BUSINESS_ID } from "./model";

type BillingKind = Extract<SeikoDocumentKind, "invoice" | "delivery_challan">;
type LineDraft = { included: boolean; quantity: string; rate: string; taxRate: string };

function readDocuments() {
  if (typeof window === "undefined") return [] as SeikoCommercialDocument[];
  try { return JSON.parse(localStorage.getItem(billingStoreKey(SEIKO_BUSINESS_ID)) || "[]") as SeikoCommercialDocument[]; }
  catch { return []; }
}

function orderedQuantity(order: SeikoOrder, product: ProductPolicy) {
  return order.records.reduce((sum, record) => sum + quantityForRecord(product, record, order.records[0]?.recordId === record.recordId), 0);
}

function defaultLineDrafts(order: SeikoOrder | null): Record<string, LineDraft> {
  if (!order) return {};
  return Object.fromEntries(activeProducts(order).map(product => [product.id, { included: true, quantity: String(orderedQuantity(order, product)), rate: "", taxRate: "" }]));
}

export function SeikoBillingCenter({ orders }: { orders: SeikoOrder[] }) {
  const initialOrder = orders[0] || null;
  const [orderId, setOrderId] = useState(initialOrder?.orderId || "");
  const order = orders.find(item => item.orderId === orderId) || initialOrder;
  const [kind, setKind] = useState<BillingKind>("invoice");
  const [taxMode, setTaxMode] = useState<SeikoTaxMode>("gst");
  const [taxTreatment, setTaxTreatment] = useState<"intra_state" | "inter_state">("intra_state");
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>(() => defaultLineDrafts(initialOrder));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saved, setSaved] = useState<SeikoCommercialDocument[]>(readDocuments);
  const [lastSavedId, setLastSavedId] = useState("");

  const changeOrder = (nextOrderId: string) => {
    const nextOrder = orders.find(item => item.orderId === nextOrderId) || null;
    setOrderId(nextOrderId);
    setLineDrafts(defaultLineDrafts(nextOrder));
    setReference("");
    setNotes("");
    setDueDate("");
    setLastSavedId("");
  };

  const changeKind = (nextKind: BillingKind) => {
    setKind(nextKind);
    setLastSavedId("");
  };

  const updateLine = (productId: string, change: Partial<LineDraft>) => setLineDrafts(current => ({ ...current, [productId]: { ...(current[productId] || { included: true, quantity: "0", rate: "", taxRate: "" }), ...change } }));

  const lines: SeikoBillingLine[] = useMemo(() => {
    if (!order) return [];
    return activeProducts(order).flatMap(product => {
      const configured = lineDrafts[product.id];
      if (!configured?.included) return [];
      const ordered = orderedQuantity(order, product);
      const quantity = Math.min(ordered, Math.max(0, Number(configured.quantity) || 0));
      if (quantity <= 0) return [];
      return [{ id: product.id, description: product.name, quantity, unit: "pcs", unitRate: kind === "invoice" ? Math.max(0, Number(configured.rate) || 0) : 0, taxRate: kind === "invoice" && taxMode === "gst" ? Math.max(0, Number(configured.taxRate) || 0) : 0 }];
    });
  }, [kind, lineDrafts, order, taxMode]);

  const now = new Date().toISOString();
  const draft: SeikoCommercialDocument | null = order ? {
    id: "preview",
    kind,
    number: nextDocumentNumber(kind, saved),
    orderId: order.orderId,
    orderNo: order.details.orderNo,
    clientName: order.details.clientName,
    issueDate: now.slice(0, 10),
    dueDate: kind === "invoice" && dueDate ? dueDate : undefined,
    reference,
    taxMode: kind === "invoice" ? taxMode : "non_gst",
    taxTreatment,
    lines,
    notes,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  } : null;
  const totals = draft ? documentTotals(draft) : null;

  const saveDocument = () => {
    if (!draft || !draft.lines.length) return;
    const document: SeikoCommercialDocument = { ...draft, id: crypto.randomUUID(), status: "issued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const next = [...saved, document];
    setSaved(next);
    setLastSavedId(document.id);
    localStorage.setItem(billingStoreKey(SEIKO_BUSINESS_ID), JSON.stringify(next));
  };

  return <section className="seikoP0Page">
    <div className="seikoP0Heading"><div><p className="eyebrow">BILLING & DOCUMENTS</p><h1>Invoice and delivery challan</h1><p>Create full or partial documents directly from the same product quantities stored in the order.</p></div></div>
    {!order ? <div className="seikoP0Panel seikoP0Empty"><b>No order is available for billing.</b><span>Create an order first.</span></div> : <div className="seikoP0TwoCol">
      <section className="seikoP0Panel seikoP0Controls seikoP0NoPrint">
        <label><span>Order</span><select value={order.orderId} onChange={event => changeOrder(event.target.value)}>{orders.map(item => <option key={item.orderId} value={item.orderId}>{displayOrder(item)}</option>)}</select></label>
        <label><span>Document</span><select value={kind} onChange={event => changeKind(event.target.value as BillingKind)}><option value="invoice">Invoice</option><option value="delivery_challan">Delivery Challan</option></select></label>
        {kind === "invoice" && <div className="seikoP0FilterRow"><label><span>Tax mode</span><select value={taxMode} onChange={event => setTaxMode(event.target.value as SeikoTaxMode)}><option value="gst">GST</option><option value="non_gst">Without GST</option></select></label>{taxMode === "gst" && <label><span>GST treatment</span><select value={taxTreatment} onChange={event => setTaxTreatment(event.target.value as typeof taxTreatment)}><option value="intra_state">Intra-state (CGST + SGST)</option><option value="inter_state">Inter-state (IGST)</option></select></label>}</div>}
        <div className="seikoP0FilterRow"><label><span>Reference</span><input value={reference} onChange={event => setReference(event.target.value)} placeholder="PO / reference"/></label>{kind === "invoice" && <label><span>Due date</span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)}/></label>}</div>

        <div className="seikoP0ControlSection">
          <strong>Document lines</strong>
          <p className="seikoP0Help">Document quantity may be reduced for partial invoicing or partial delivery, but cannot exceed the order quantity.</p>
          <div className="seikoP0BillingLines">{activeProducts(order).map(product => {
            const ordered = orderedQuantity(order, product);
            const config = lineDrafts[product.id] || { included: true, quantity: String(ordered), rate: "", taxRate: "" };
            return <div key={product.id} className={config.included ? "" : "disabled"}>
              <label className="seikoP0Check"><input type="checkbox" checked={config.included} onChange={event => updateLine(product.id, { included: event.target.checked })}/><strong>{product.name}</strong></label>
              <small>Ordered {ordered} pcs</small>
              <label>Document qty<input inputMode="numeric" value={config.quantity} disabled={!config.included} onChange={event => updateLine(product.id, { quantity: event.target.value })}/></label>
              {kind === "invoice" && <><label>Rate ₹<input inputMode="decimal" value={config.rate} disabled={!config.included} onChange={event => updateLine(product.id, { rate: event.target.value })}/></label>{taxMode === "gst" && <label>GST %<input inputMode="decimal" value={config.taxRate} disabled={!config.included} onChange={event => updateLine(product.id, { taxRate: event.target.value })}/></label>}</>}
            </div>;
          })}</div>
        </div>

        <label><span>Notes</span><textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Document notes"/></label>
        {!lines.length && <p className="seikoP0Notice">Select at least one product with a document quantity greater than zero.</p>}
        {lastSavedId && <p className="seikoP0Success">Document saved.</p>}
        <div className="seikoP0Actions"><button type="button" onClick={saveDocument} disabled={!lines.length}>Save document</button><button type="button" className="secondary" onClick={() => window.print()} disabled={!lines.length}>Print / Save PDF</button></div>
        <small>Saved documents: {saved.length}</small>
      </section>

      <section className="seikoP0Panel seikoP0Printable">{draft && <>
        <div className="seikoP0DocHead"><div><p className="eyebrow">{kind === "invoice" ? (taxMode === "gst" ? "TAX INVOICE" : "INVOICE") : "DELIVERY CHALLAN"}</p><h2>{draft.number}</h2><p>{draft.issueDate}{draft.dueDate ? ` · Due ${draft.dueDate}` : ""}</p></div><img src="/brands/seiko-logo-transparent.png" alt="SEIKO"/></div>
        <div className="seikoP0DocParties"><div><small>{kind === "invoice" ? "Bill to" : "Deliver to"}</small><strong>{order.details.clientName || "Unnamed client"}</strong><p>{kind === "invoice" ? order.details.billTo : order.details.shipTo}</p></div><div><small>Order</small><strong>{order.details.orderNo}</strong><p>{order.details.contactPerson}{order.details.contactNumber ? ` · ${order.details.contactNumber}` : ""}</p>{reference && <p>Ref: {reference}</p>}</div></div>
        {!lines.length ? <div className="seikoP0Empty"><b>No document lines selected.</b></div> : <div className="seikoP0TableWrap"><table className="seikoP0Table"><thead><tr><th>Item</th><th>Qty</th>{kind === "invoice" && <><th>Rate</th>{taxMode === "gst" && <th>GST</th>}<th>Amount</th></>}</tr></thead><tbody>{lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td>{kind === "invoice" && <><td>₹{line.unitRate.toFixed(2)}</td>{taxMode === "gst" && <td>{line.taxRate}%</td>}<td>₹{(line.quantity * line.unitRate).toFixed(2)}</td></>}</tr>)}</tbody></table></div>}
        {kind === "invoice" && totals && <div className="seikoP0Totals"><span>Subtotal <b>₹{totals.subtotal.toFixed(2)}</b></span>{taxMode === "gst" && taxTreatment === "intra_state" && <><span>CGST <b>₹{totals.cgst.toFixed(2)}</b></span><span>SGST <b>₹{totals.sgst.toFixed(2)}</b></span></>}{taxMode === "gst" && taxTreatment === "inter_state" && <span>IGST <b>₹{totals.igst.toFixed(2)}</b></span>}<strong>Total ₹{totals.total.toFixed(2)}</strong></div>}
        {notes && <div className="seikoP0DocNotes"><small>Notes</small><p>{notes}</p></div>}
        <div className="seikoP0Sign"><span>Customer acknowledgement</span><span>For SEIKO</span></div>
      </>}</section>
    </div>}
  </section>;
}
