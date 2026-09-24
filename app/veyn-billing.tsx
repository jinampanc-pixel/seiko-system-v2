"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Permission } from "./lib/access-control";
import {
  currentAcceptedQuotation,
  quotationTotal,
  type VeynDeliveryChallan,
  type VeynInvoice,
  type VeynPurchaseOrder,
  type VeynQuotation,
} from "./lib/veyn-commercial";
import {
  listVeynRequirements,
  makeVeynNumber,
  partyFromRequirement,
  saveVeynRequirement,
  todayIso,
  type VeynRequirement,
  type VeynRequirementEnvelope,
} from "./lib/veyn-requirements";

type EditorState =
  | { kind: "quotation"; orderId: string; value: VeynQuotation }
  | { kind: "po"; orderId: string; value: VeynPurchaseOrder }
  | { kind: "challan"; orderId: string; value: VeynDeliveryChallan }
  | { kind: "invoice"; orderId: string; value: VeynInvoice };

export function VeynBilling({
  businessId,
  can,
  focusOrderId,
}: {
  businessId: string;
  can: (permission: Permission) => boolean;
  focusOrderId?: string | null;
}) {
  const [records, setRecords] = useState<VeynRequirementEnvelope[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecords(await listVeynRequirements(businessId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commercial records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter(record => {
      if (record.order.archived) return false;
      if (focusOrderId && record.order.orderId !== focusOrderId) return false;
      if (!needle) return true;
      const order = record.order;
      return `${order.details.orderNo} ${order.details.institutionName} ${order.details.reference}`.toLowerCase().includes(needle);
    });
  }, [records, query, focusOrderId]);

  const persist = async (record: VeynRequirementEnvelope, order: VeynRequirement) => {
    setSaving(true);
    setError("");
    try {
      await saveVeynRequirement(businessId, order, record.version);
      setEditor(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commercial record could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveEditor = async () => {
    if (!editor) return;
    const record = records.find(item => item.order.orderId === editor.orderId);
    if (!record) return;
    const order = structuredClone(record.order);
    if (editor.kind === "quotation") {
      order.commercial.quotations = replaceById(order.commercial.quotations, editor.value);
    } else if (editor.kind === "po") {
      order.commercial.purchaseOrders = replaceById(order.commercial.purchaseOrders, editor.value);
    } else if (editor.kind === "challan") {
      order.commercial.deliveryChallans = replaceById(order.commercial.deliveryChallans, editor.value);
    } else {
      order.commercial.invoices = replaceById(order.commercial.invoices, editor.value);
    }
    await persist(record, order);
  };

  const quotationStatus = async (record: VeynRequirementEnvelope, quotationId: string, status: VeynQuotation["status"]) => {
    const order = structuredClone(record.order);
    order.commercial.quotations = order.commercial.quotations.map(item => item.id === quotationId ? {
      ...item,
      status,
      acceptedAt: status === "accepted" ? new Date().toISOString() : item.acceptedAt,
    } : item);
    if (status === "issued") order.status = "Quoted";
    if (status === "accepted") order.status = "Confirmed";
    await persist(record, order);
  };

  const documentStatus = async (record: VeynRequirementEnvelope, kind: "challan" | "invoice", id: string) => {
    const order = structuredClone(record.order);
    if (kind === "challan") {
      order.commercial.deliveryChallans = order.commercial.deliveryChallans.map(item => item.id === id ? { ...item, status: "issued" } : item);
      order.status = "Part delivered";
    } else {
      order.commercial.invoices = order.commercial.invoices.map(item => item.id === id ? { ...item, status: "issued" } : item);
      order.status = "Invoiced";
    }
    await persist(record, order);
  };

  return <section className="page veynBillingPage">
    <div className="veynPageHead">
      <div><p className="eyebrow">BILLING</p><h1>Commercial pipeline</h1></div>
      <button type="button" className="secondary" onClick={() => void load()}>Refresh</button>
    </div>

    {!focusOrderId && <div className="panel veynToolbar"><label className="veynSearch"><span>Search</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Institution, order no. or reference"/></label></div>}
    {focusOrderId && <div className="veynFocusNotice">Showing the selected requirement. Return to Orders to choose another.</div>}
    {error && <div className="accessError" role="alert">{error}</div>}

    <div className="veynPipelineList">
      {loading ? <div className="panel veynEmptyState">Loading commercial records…</div> : visible.length === 0 ? <div className="panel veynEmptyState">No matching requirements.</div> : visible.map(record => <PipelineRow
        key={record.order.orderId}
        record={record}
        can={can}
        disabled={saving}
        onEdit={setEditor}
        onQuotationStatus={(quotationId, status) => void quotationStatus(record, quotationId, status)}
        onIssueDocument={(kind, id) => void documentStatus(record, kind, id)}
      />)}
    </div>

    {editor && <CommercialEditor editor={editor} saving={saving} onChange={setEditor} onCancel={() => setEditor(null)} onSave={() => void saveEditor()}/>} 
  </section>;
}

function PipelineRow({
  record,
  can,
  disabled,
  onEdit,
  onQuotationStatus,
  onIssueDocument,
}: {
  record: VeynRequirementEnvelope;
  can: (permission: Permission) => boolean;
  disabled: boolean;
  onEdit: (editor: EditorState) => void;
  onQuotationStatus: (quotationId: string, status: VeynQuotation["status"]) => void;
  onIssueDocument: (kind: "challan" | "invoice", id: string) => void;
}) {
  const order = record.order;
  const quotation = latest(order.commercial.quotations);
  const accepted = currentAcceptedQuotation(order.commercial);
  const po = latest(order.commercial.purchaseOrders.filter(item => item.status !== "cancelled"));
  const challan = latest(order.commercial.deliveryChallans.filter(item => item.status !== "cancelled"));
  const invoice = latest(order.commercial.invoices.filter(item => item.status !== "cancelled"));

  return <article className="panel veynPipelineRow">
    <header className="veynPipelineOrder">
      <div><strong>{order.details.orderNo}</strong><h3>{order.details.institutionName}</h3><small>{order.details.reference || `${order.lines.length} requirement line${order.lines.length === 1 ? "" : "s"}`}</small></div>
      <span className="veynStatusBadge">{order.status}</span>
    </header>

    <div className="veynPipelineStages">
      <Stage label="Quotation" state={quotation ? `${quotation.quotationNumber} · ${quotation.status}` : "Not created"}>
        {!quotation && <button type="button" className="primary" disabled={disabled || !can("billing.quotations.manage")} onClick={() => onEdit({ kind: "quotation", orderId: order.orderId, value: newQuotation(order) })}>Create</button>}
        {quotation && <button type="button" className="secondary" disabled={disabled || !can("billing.quotations.manage")} onClick={() => onEdit({ kind: "quotation", orderId: order.orderId, value: structuredClone(quotation) })}>Edit</button>}
        {quotation?.status === "draft" && <button type="button" className="secondary" disabled={disabled || !can("billing.quotations.manage")} onClick={() => onQuotationStatus(quotation.id, "issued")}>Issue</button>}
        {quotation?.status === "issued" && <button type="button" className="primary" disabled={disabled || !can("billing.quotations.manage")} onClick={() => onQuotationStatus(quotation.id, "accepted")}>Accept</button>}
        {quotation && <b>{formatMoney(quotationTotal(quotation))}</b>}
      </Stage>

      <Stage label="Purchase order" state={po ? `${po.poNumber}${po.customerPoNumber ? ` · Customer ${po.customerPoNumber}` : ""}` : accepted ? "Ready" : "Accept quotation first"}>
        {!po && accepted && <button type="button" className="primary" disabled={disabled || !can("billing.purchase_orders.manage")} onClick={() => onEdit({ kind: "po", orderId: order.orderId, value: newPurchaseOrder(order, accepted) })}>Record PO</button>}
        {po && <button type="button" className="secondary" disabled={disabled || !can("billing.purchase_orders.manage")} onClick={() => onEdit({ kind: "po", orderId: order.orderId, value: structuredClone(po) })}>Edit</button>}
      </Stage>

      <Stage label="Delivery challan" state={challan ? `${order.commercial.deliveryChallans.length} · latest ${challan.challanNumber} · ${challan.status}` : po ? "Ready" : "PO required"}>
        {po && accepted && <button type="button" className="primary" disabled={disabled || !can("billing.delivery_challans.manage")} onClick={() => onEdit({ kind: "challan", orderId: order.orderId, value: newChallan(order, accepted, po) })}>+ Challan</button>}
        {challan && <button type="button" className="secondary" disabled={disabled || !can("billing.delivery_challans.manage")} onClick={() => onEdit({ kind: "challan", orderId: order.orderId, value: structuredClone(challan) })}>Edit latest</button>}
        {challan?.status === "draft" && <button type="button" className="secondary" disabled={disabled || !can("billing.delivery_challans.manage")} onClick={() => onIssueDocument("challan", challan.id)}>Issue</button>}
      </Stage>

      <Stage label="Invoice" state={invoice ? `${invoice.invoiceNumber} · ${invoice.status}` : po ? "Ready" : "PO required"}>
        {po && accepted && <button type="button" className="primary" disabled={disabled || !can("billing.invoices.manage")} onClick={() => onEdit({ kind: "invoice", orderId: order.orderId, value: newInvoice(order, accepted, po) })}>Create</button>}
        {invoice && <button type="button" className="secondary" disabled={disabled || !can("billing.invoices.manage")} onClick={() => onEdit({ kind: "invoice", orderId: order.orderId, value: structuredClone(invoice) })}>Edit latest</button>}
        {invoice?.status === "draft" && <button type="button" className="secondary" disabled={disabled || !can("billing.invoices.manage")} onClick={() => onIssueDocument("invoice", invoice.id)}>Issue</button>}
      </Stage>
    </div>
  </article>;
}

function Stage({ label, state, children }: { label: string; state: string; children: React.ReactNode }) {
  return <section className="veynStage"><small>{label}</small><span>{state}</span><div className="veynStageActions">{children}</div></section>;
}

function CommercialEditor({
  editor,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  editor: EditorState;
  saving: boolean;
  onChange: (editor: EditorState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return <div className="veynModalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="veynEditor veynCommercialEditor" role="dialog" aria-modal="true" aria-label="Commercial document editor">
      <header className="veynEditorHead"><div><p className="eyebrow">{editorTitle(editor.kind).toUpperCase()}</p><h2>{documentNumber(editor)}</h2></div><button type="button" className="iconButton" onClick={onCancel} aria-label="Close">×</button></header>
      <div className="veynEditorBody">
        {editor.kind === "quotation" && <QuotationForm value={editor.value} onChange={value => onChange({ ...editor, value })}/>} 
        {editor.kind === "po" && <PurchaseOrderForm value={editor.value} onChange={value => onChange({ ...editor, value })}/>} 
        {editor.kind === "challan" && <ChallanForm value={editor.value} onChange={value => onChange({ ...editor, value })}/>} 
        {editor.kind === "invoice" && <InvoiceForm value={editor.value} onChange={value => onChange({ ...editor, value })}/>} 
      </div>
      <footer className="veynEditorActions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</button></footer>
    </section>
  </div>;
}

function QuotationForm({ value, onChange }: { value: VeynQuotation; onChange: (value: VeynQuotation) => void }) {
  const updateLine = (index: number, change: Partial<VeynQuotation["lines"][number]>) => onChange({ ...value, lines: value.lines.map((line, i) => i === index ? { ...line, ...change } : line) });
  return <>
    <div className="veynFormGrid">
      <Field label="Quotation no." value={value.quotationNumber} onChange={quotationNumber => onChange({ ...value, quotationNumber })}/>
      <Field label="Issue date" type="date" value={value.issueDate} onChange={issueDate => onChange({ ...value, issueDate })}/>
      <Field label="Valid till" type="date" value={value.validTill || ""} onChange={validTill => onChange({ ...value, validTill })}/>
      <Field label="Reference" value={value.reference || ""} onChange={reference => onChange({ ...value, reference })}/>
      <Field label="Customer" value={value.customer.name} onChange={name => onChange({ ...value, customer: { ...value.customer, name } })}/>
    </div>
    <div className="veynLineTable veynCommercialLines">
      <div className="veynLineHead"><span>Description</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span></div>
      {value.lines.map((line, index) => <div className="veynLineRow" key={line.id}>
        <input aria-label={`Quotation line ${index + 1} description`} value={line.description} onChange={event => updateLine(index, { description: event.target.value })}/>
        <input aria-label={`Quotation line ${index + 1} quantity`} type="number" min="0" step="0.001" value={line.quantity} onChange={event => updateLine(index, { quantity: Number(event.target.value) })}/>
        <input aria-label={`Quotation line ${index + 1} unit`} value={line.unit} onChange={event => updateLine(index, { unit: event.target.value })}/>
        <input aria-label={`Quotation line ${index + 1} rate`} type="number" min="0" step="0.01" value={line.unitRate} onChange={event => updateLine(index, { unitRate: Number(event.target.value) })}/>
        <strong>{formatMoney(line.quantity * line.unitRate)}</strong>
      </div>)}
    </div>
    <div className="veynCommercialTotal"><span>Total</span><strong>{formatMoney(quotationTotal(value))}</strong></div>
    <label><span>Terms · one per line</span><textarea rows={5} value={value.terms.join("\n")} onChange={event => onChange({ ...value, terms: event.target.value.split("\n").map(item => item.trim()).filter(Boolean) })}/></label>
  </>;
}

function PurchaseOrderForm({ value, onChange }: { value: VeynPurchaseOrder; onChange: (value: VeynPurchaseOrder) => void }) {
  return <div className="veynFormGrid">
    <Field label="Internal PO reference" value={value.poNumber} onChange={poNumber => onChange({ ...value, poNumber })}/>
    <Field label="Customer PO number" value={value.customerPoNumber || ""} onChange={customerPoNumber => onChange({ ...value, customerPoNumber })}/>
    <Field label="Accepted date" type="date" value={value.acceptedAt.slice(0, 10)} onChange={acceptedAt => onChange({ ...value, acceptedAt: `${acceptedAt}T00:00:00.000Z` })}/>
  </div>;
}

function ChallanForm({ value, onChange }: { value: VeynDeliveryChallan; onChange: (value: VeynDeliveryChallan) => void }) {
  const address = value.deliverTo.addressLines.join("\n");
  return <>
    <div className="veynFormGrid">
      <Field label="Challan no." value={value.challanNumber} onChange={challanNumber => onChange({ ...value, challanNumber })}/>
      <Field label="Issue date" type="date" value={value.issueDate} onChange={issueDate => onChange({ ...value, issueDate })}/>
      <Field label="Reference" value={value.reference} onChange={reference => onChange({ ...value, reference })}/>
    </div>
    <label><span>Deliver to</span><textarea rows={3} value={address} onChange={event => onChange({ ...value, deliverTo: { ...value.deliverTo, addressLines: event.target.value.split("\n") } })}/></label>
    <div className="veynLineTable veynDeliveryLines">
      <div className="veynLineHead"><span>Line</span><span>Ordered</span><span>Delivered now</span></div>
      {value.lines.map((line, index) => <div className="veynLineRow" key={line.lineId}><span>Line {index + 1}</span><span>{line.ordered}</span><input aria-label={`Delivered quantity line ${index + 1}`} type="number" min="0" max={line.ordered} step="0.001" value={line.delivered} onChange={event => onChange({ ...value, lines: value.lines.map((item, i) => i === index ? { ...item, delivered: Number(event.target.value) } : item) })}/></div>)}
    </div>
  </>;
}

function InvoiceForm({ value, onChange }: { value: VeynInvoice; onChange: (value: VeynInvoice) => void }) {
  const updateLine = (index: number, change: Partial<VeynInvoice["lines"][number]>) => onChange({ ...value, lines: value.lines.map((line, i) => i === index ? { ...line, ...change } : line) });
  const total = value.lines.reduce((sum, line) => sum + line.quantity * line.unitRate, 0);
  return <>
    <div className="veynFormGrid">
      <Field label="Invoice no." value={value.invoiceNumber} onChange={invoiceNumber => onChange({ ...value, invoiceNumber })}/>
      <Field label="Issue date" type="date" value={value.issueDate} onChange={issueDate => onChange({ ...value, issueDate })}/>
      <Field label="Due date" type="date" value={value.dueDate || ""} onChange={dueDate => onChange({ ...value, dueDate })}/>
    </div>
    <div className="veynLineTable veynCommercialLines">
      <div className="veynLineHead"><span>Description</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span></div>
      {value.lines.map((line, index) => <div className="veynLineRow" key={line.id}>
        <input aria-label={`Invoice line ${index + 1} description`} value={line.description} onChange={event => updateLine(index, { description: event.target.value })}/>
        <input aria-label={`Invoice line ${index + 1} quantity`} type="number" min="0" step="0.001" value={line.quantity} onChange={event => updateLine(index, { quantity: Number(event.target.value) })}/>
        <input aria-label={`Invoice line ${index + 1} unit`} value={line.unit} onChange={event => updateLine(index, { unit: event.target.value })}/>
        <input aria-label={`Invoice line ${index + 1} rate`} type="number" min="0" step="0.01" value={line.unitRate} onChange={event => updateLine(index, { unitRate: Number(event.target.value) })}/>
        <strong>{formatMoney(line.quantity * line.unitRate)}</strong>
      </div>)}
    </div>
    <div className="veynCommercialTotal"><span>Total</span><strong>{formatMoney(total)}</strong></div>
  </>;
}

function newQuotation(order: VeynRequirement): VeynQuotation {
  return {
    id: crypto.randomUUID(),
    orderId: order.orderId,
    quotationNumber: makeVeynNumber("QTN"),
    issueDate: todayIso(),
    validTill: "",
    reference: order.details.reference,
    customer: partyFromRequirement(order),
    lines: order.lines.filter(line => line.description.trim()).map(line => ({ id: line.id, description: line.description, quantity: line.quantity, unit: line.unit, unitRate: line.estimatedRate || 0 })),
    terms: ["Prices are subject to the stated commercial terms.", "Delivery as mutually agreed."],
    status: "draft",
    revision: (latest(order.commercial.quotations)?.revision || 0) + 1,
  };
}

function newPurchaseOrder(order: VeynRequirement, quotation: VeynQuotation): VeynPurchaseOrder {
  return {
    id: crypto.randomUUID(),
    orderId: order.orderId,
    quotationId: quotation.id,
    poNumber: makeVeynNumber("PO"),
    customerPoNumber: "",
    acceptedQuotationRevision: quotation.revision,
    acceptedAt: new Date().toISOString(),
    status: "open",
  };
}

function newChallan(order: VeynRequirement, quotation: VeynQuotation, po: VeynPurchaseOrder): VeynDeliveryChallan {
  return {
    id: crypto.randomUUID(),
    orderId: order.orderId,
    quotationId: quotation.id,
    purchaseOrderId: po.id,
    challanNumber: makeVeynNumber("DC"),
    issueDate: todayIso(),
    reference: order.details.reference || po.customerPoNumber || po.poNumber,
    deliverTo: partyFromRequirement(order, true),
    lines: quotation.lines.map(line => ({ lineId: line.id, ordered: line.quantity, delivered: line.quantity })),
    status: "draft",
  };
}

function newInvoice(order: VeynRequirement, quotation: VeynQuotation, po: VeynPurchaseOrder): VeynInvoice {
  return {
    id: crypto.randomUUID(),
    orderId: order.orderId,
    quotationId: quotation.id,
    purchaseOrderId: po.id,
    challanIds: order.commercial.deliveryChallans.filter(item => item.status !== "cancelled").map(item => item.id),
    invoiceNumber: makeVeynNumber("INV"),
    issueDate: todayIso(),
    dueDate: "",
    lines: structuredClone(quotation.lines),
    status: "draft",
  };
}

function replaceById<T extends { id: string }>(items: T[], value: T): T[] {
  return items.some(item => item.id === value.id) ? items.map(item => item.id === value.id ? value : item) : [...items, value];
}

function latest<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

function editorTitle(kind: EditorState["kind"]): string {
  return ({ quotation: "Quotation", po: "Purchase order", challan: "Delivery challan", invoice: "Invoice" } as const)[kind];
}

function documentNumber(editor: EditorState): string {
  if (editor.kind === "quotation") return editor.value.quotationNumber;
  if (editor.kind === "po") return editor.value.poNumber;
  if (editor.kind === "challan") return editor.value.challanNumber;
  return editor.value.invoiceNumber;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)}/></label>;
}
