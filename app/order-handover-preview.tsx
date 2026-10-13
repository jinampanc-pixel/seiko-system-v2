"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccess } from "./access-control";
import { defaultHandoverOptions, handoverHtml } from "./lib/order-handover";
import type { SeikoOrder } from "./lib/order-domain";
import type { SeikoCommercialDocument } from "./lib/seiko-billing";

export function OrderHandoverPreview({ order, businessId, onClose }: { order: SeikoOrder; businessId: string; onClose: () => void }) {
  const { can } = useAccess();
  const [options, setOptions] = useState(() => defaultHandoverOptions(order));
  const [includeMoney, setIncludeMoney] = useState(false);
  const [documents, setDocuments] = useState<SeikoCommercialDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const modal = dialog.current; modal?.showModal(); close.current?.focus(); return () => { modal?.close(); previous?.focus(); }; }, []);
  useEffect(() => {
    if (!includeMoney) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/erp/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "list", orderId: order.orderId }), signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "Financial documents could not be loaded.");
        setDocuments(result.documents.filter((item: SeikoCommercialDocument) => item.orderId === order.orderId && item.status !== "cancelled"));
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [includeMoney, order.orderId]);
  const selectedDocument = includeMoney ? documents.find(item => item.id === documentId) : undefined;
  const html = useMemo(() => handoverHtml(order, { ...options, financialDocument: selectedDocument }), [order, options, selectedDocument]);
  const change = (next: typeof options) => { setReady(false); setOptions(next); };
  return <dialog ref={dialog} className="handoverDialog" aria-labelledby="handover-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="handover-title">Student handover list</h2><p>{order.details.orderNo} · {order.details.clientName}</p></div><button ref={close} onClick={onClose}>Close preview</button></header>
    <div className="handoverLayout"><aside><p>Choose what appears in the PDF. Printing does not save changes or mark delivery.</p>
      <fieldset><legend>Student details</legend>{order.fields.map(field => <label key={field.id}><input type="checkbox" checked={options.fieldIds.includes(field.id)} onChange={event => change({ ...options, fieldIds: event.target.checked ? [...options.fieldIds, field.id] : options.fieldIds.filter(id => id !== field.id) })}/>{field.name}</label>)}</fieldset>
      <fieldset><legend>Products</legend>{order.products.filter(product => product.name.trim()).map(product => <label key={product.id}><input type="checkbox" checked={options.productIds.includes(product.id)} onChange={event => change({ ...options, productIds: event.target.checked ? [...options.productIds, product.id] : options.productIds.filter(id => id !== product.id) })}/>{product.name}</label>)}</fieldset>
      <fieldset><legend>Include</legend><label><input type="checkbox" checked={options.orderDetails} onChange={event => change({ ...options, orderDetails: event.target.checked })}/>Client / order details</label><label><input type="checkbox" checked={options.sizes} onChange={event => change({ ...options, sizes: event.target.checked })}/>Sizes / measurements</label><label><input type="checkbox" checked={options.specifications} onChange={event => change({ ...options, specifications: event.target.checked })}/>Product specifications</label><label><input type="checkbox" checked={options.checks} onChange={event => change({ ...options, checks: event.target.checked })}/>Manual check column</label>
      {businessId === "seiko" && can("financials.view") && <label><input type="checkbox" checked={includeMoney} onChange={event => { setReady(false); setIncludeMoney(event.target.checked); }}/>Financial reference</label>}</fieldset>
      {includeMoney && <><p>Uses one saved billing document. Prices are not inferred for students.</p>{loading ? <p role="status">Loading financial documents…</p> : <label>Billing document<select value={documentId} onChange={event => { setReady(false); setDocumentId(event.target.value); }}><option value="">Choose a document</option>{documents.map(item => <option key={item.id} value={item.id}>{item.number} · {item.kind.replaceAll("_", " ")}</option>)}</select></label>}{!loading && !documents.length && !error && <p>No billing documents for this order.</p>}{error && <p role="alert">{error}</p>}</>}
      <label>Page orientation<select value={options.orientation} onChange={event => change({ ...options, orientation: event.target.value as "portrait" | "landscape" })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      <button className="primary" disabled={!ready || !options.productIds.length || (includeMoney && !selectedDocument)} onClick={() => { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); }}>Print / Save PDF</button>
      <p>In the print window, choose Save as PDF. All {order.records.filter(record => !record.held).length} unheld records are included.</p>
    </aside><iframe ref={frame} title="Student handover print preview" srcDoc={html} onLoad={() => setReady(true)}/></div>
  </dialog>;
}
