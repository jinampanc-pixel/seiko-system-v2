"use client";

import { useMemo, useState } from "react";
import { eligibleOrderQuantity, type ProductPolicy, type SeikoOrder } from "../lib/order-domain";
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
  return eligibleOrderQuantity(order, product);
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

  const lineErrors = order ? activeProducts(order).flatMap(product => {
    const config = lineDrafts[product.id];
    if (!config?.included) return [];
    const errors: string[] = [];
    const qty = Number(config.quantity);
    if (!config.quantity.trim() || !Number.isSafeInteger(qty) || qty < 0 || qty > orderedQuantity(order, product)) errors.push(`${product.name}: quantity must be a whole number between 0 and ${orderedQuantity(order, product)}.`);
    if (kind === "invoice" && (!Number.isFinite(Number(config.rate)) || Number(config.rate) < 0)) errors.push(`${product.name}: rate must be zero or more.`);
    if (kind === "invoice" && taxMode === "gst" && (!Number.isFinite(Number(config.taxRate)) || Number(config.taxRate) < 0 || Number(config.taxRate) > 100)) errors.push(`${product.name}: GST must be between 0 and 100.`);
    return errors;
  }) : [];
  const now = new Date().toISOString();
  const draft: SeikoCommercialDocument | null = order ? {
    id: "preview",
    kind,
    number: nextDocumentNumber(kind, saved),
    orderId: order.orderId,
    orderNo: order.details.orderNo,
    clientName: order.details.clientName,
    customerAddress: kind === "invoice" ? order.details.billTo : order.details.shipTo,
    customerContact: [order.details.contactPerson, order.details.contactNumber].filter(Boolean).join(" · "),
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
  const displayDocument = saved.find(document => document.id === lastSavedId) || draft;
  const totals = displayDocument ? documentTotals(displayDocument) : null;
  const previewLines = displayDocument?.lines || [];
  const previewInvalid = !lastSavedId && lineErrors.length > 0;

  const saveDocument = () => {
    if (!draft || !draft.lines.length || lineErrors.length || lastSavedId) return;
    const document: SeikoCommercialDocument = { ...draft, id: crypto.randomUUID(), status: "issued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const next = [...saved, document];
    try {
      localStorage.setItem(billingStoreKey(SEIKO_BUSINESS_ID), JSON.stringify(next));
      setSaved(next);
      setLastSavedId(document.id);
    } catch { window.alert("The document could not be saved. Check available browser storage and try again."); }
  };

  return <section className="seikoP0Page">
    <div className="seikoP0Heading"><div><p className="eyebrow">BILLING & DOCUMENTS</p><h1>Invoice and delivery challan</h1><p>Create full or partial documents directly from the same product quantities stored in the order.</p></div></div>
    {!order ? <div className="seikoP0Panel seikoP0Empty"><b>No order is available for billing.</b><span>Create an order first.</span></div> : <div className="seikoP0TwoCol">
      <section className="seikoP0Panel seikoP0Controls seikoP0NoPrint">
        <label><span>Order</span><select value={order.orderId} onChange={event => changeOrder(event.target.value)}>{orders.map(item => <option key={item.orderId} value={item.orderId}>{displayOrder(item)}</option>)}</select></label>
        <fieldset className="seikoP0DraftFields" disabled={!!lastSavedId}>
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
        </fieldset>
        {!lastSavedId && lineErrors.length > 0 && <div role="alert" className="seikoP0Notice">{lineErrors.map(error => <p key={error}>{error}</p>)}</div>}
        {lastSavedId && <p role="status" className="seikoP0Success">Saved document {displayDocument?.number}. This snapshot is ready to reprint.</p>}
        <div className="seikoP0Actions"><button type="button" onClick={saveDocument} disabled={!lines.length || !!lastSavedId || !!lineErrors.length}>Save document</button><button type="button" className="secondary" onClick={() => window.print()} disabled={!previewLines.length || previewInvalid}>Print / Save PDF</button></div>
        {lastSavedId && <button type="button" className="secondary" onClick={() => changeOrder(order.orderId)}>New document</button>}
        <label><span>Saved documents for this order</span><select value={lastSavedId} onChange={event => setLastSavedId(event.target.value)}><option value="">Current draft</option>{saved.filter(document => document.orderId === order.orderId).map(document => <option key={document.id} value={document.id}>{document.number} · {document.issueDate}</option>)}</select></label>
        <small>Saved documents: {saved.filter(document => document.orderId === order.orderId).length}</small>
      </section>

      <section className="seikoP0Panel seikoP0Printable">{displayDocument && <>{previewInvalid ? <p className="seikoP0Notice">Correct the highlighted values before previewing or printing.</p> : <>
        <div className="seikoP0DocHead"><div><p className="eyebrow">{displayDocument.kind === "invoice" ? (displayDocument.taxMode === "gst" ? "TAX INVOICE" : "INVOICE") : "DELIVERY CHALLAN"}</p><h2>{displayDocument.number}</h2><p>{displayDocument.issueDate}{displayDocument.dueDate ? ` · Due ${displayDocument.dueDate}` : ""}</p></div><img src="/brands/seiko-logo-transparent.png" alt="SEIKO"/></div>
        <div className="seikoP0DocParties"><div><small>{displayDocument.kind === "invoice" ? "Bill to" : "Deliver to"}</small><strong>{displayDocument.clientName || "Unnamed client"}</strong><p>{displayDocument.customerAddress || ""}</p></div><div><small>Order</small><strong>{displayDocument.orderNo}</strong><p>{displayDocument.customerContact || ""}</p>{displayDocument.reference && <p>Ref: {displayDocument.reference}</p>}</div></div>
        {!previewLines.length ? <div className="seikoP0Empty"><b>No document lines selected.</b></div> : <div className="seikoP0TableWrap"><table className="seikoP0Table"><thead><tr><th>Item</th><th>Qty</th>{displayDocument.kind === "invoice" && <><th>Rate</th>{displayDocument.taxMode === "gst" && <th>GST</th>}<th>Amount</th></>}</tr></thead><tbody>{previewLines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td>{displayDocument.kind === "invoice" && <><td>₹{line.unitRate.toFixed(2)}</td>{displayDocument.taxMode === "gst" && <td>{line.taxRate}%</td>}<td>₹{(line.quantity * line.unitRate).toFixed(2)}</td></>}</tr>)}</tbody></table></div>}
        {displayDocument.kind === "invoice" && totals && <div className="seikoP0Totals"><span>Subtotal <b>₹{totals.subtotal.toFixed(2)}</b></span>{displayDocument.taxMode === "gst" && displayDocument.taxTreatment === "intra_state" && <><span>CGST <b>₹{totals.cgst.toFixed(2)}</b></span><span>SGST <b>₹{totals.sgst.toFixed(2)}</b></span></>}{displayDocument.taxMode === "gst" && displayDocument.taxTreatment === "inter_state" && <span>IGST <b>₹{totals.igst.toFixed(2)}</b></span>}<strong>Total ₹{totals.total.toFixed(2)}</strong></div>}
        {displayDocument.notes && <div className="seikoP0DocNotes"><small>Notes</small><p>{displayDocument.notes}</p></div>}
        <div className="seikoP0Sign"><span>Customer acknowledgement</span><span>For SEIKO</span></div>
      </>}</>}</section>
    </div>}
  </section>;
}
