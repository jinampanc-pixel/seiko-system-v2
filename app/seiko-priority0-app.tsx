"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAccess } from "./access-control";
import { Orders } from "./orders";
import { PackingPersonLabelDesigner } from "./packing-person-label-designer";
import { orderStoreKey, quantityForRecord, type OrderField, type SeikoOrder } from "./lib/order-domain";
import { billingStoreKey, documentTotals, nextDocumentNumber, type SeikoBillingLine, type SeikoCommercialDocument, type SeikoDocumentKind } from "./lib/seiko-billing";
import { THEME_PRESETS, themeVariables } from "./lib/foundation";

type Module = "home" | "orders" | "labels" | "reports" | "billing";
type Filter = { fieldId: string; value: string };

const BUSINESS_ID = "seiko";

function readOrders(): SeikoOrder[] {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(localStorage.getItem(orderStoreKey(BUSINESS_ID)) || "[]") as SeikoOrder[]).filter(order => !order.archived); }
  catch { return []; }
}

function firstPersonField(order: SeikoOrder) { return order.fields[0]; }
function recordValue(record: SeikoOrder["records"][number], field?: OrderField) { return field ? String(record.values[`field:${field.id}`] ?? "") : ""; }
function uniqueValues(order: SeikoOrder | null, fieldId: string) {
  if (!order || !fieldId) return [];
  return [...new Set(order.records.map(record => String(record.values[`field:${fieldId}`] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function SeikoPriority0App() {
  const { session, membership } = useAccess();
  const seikoMembership = session?.businesses.find(item => item.businessId === BUSINESS_ID) || membership;
  const [module, setModule] = useState<Module>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [packingOrder, setPackingOrder] = useState<SeikoOrder | null>(null);

  const refreshOrders = () => setOrders(readOrders());
  useEffect(() => {
    refreshOrders();
    const sync = () => refreshOrders();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);

  const go = (next: Module) => { setModule(next); setMenuOpen(false); if (next !== "labels") setPackingOrder(null); refreshOrders(); };
  const openPacking = (order: SeikoOrder) => { setPackingOrder(order); setModule("labels"); setMenuOpen(false); };
  const theme = seikoMembership?.theme || THEME_PRESETS.seiko;

  return <div className="seikoP0App" style={themeVariables(theme) as CSSProperties}>
    <header className="seikoP0Topbar">
      <button className="seikoP0Brand" type="button" onClick={() => go("home")} aria-label="SEIKO Home"><img src="/brands/seiko-logo-transparent.png" alt="SEIKO Tailors"/></button>
      <button className="seikoP0MenuToggle" type="button" onClick={() => setMenuOpen(value => !value)} aria-label="Open menu">☰</button>
    </header>
    {menuOpen && <><button className="seikoP0Backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu"/><aside className="seikoP0Drawer">
      <div className="seikoP0DrawerHead"><strong>SEIKO</strong><button type="button" onClick={() => setMenuOpen(false)}>×</button></div>
      <Nav label="Home" active={module === "home"} onClick={() => go("home")}/>
      <Nav label="Orders" active={module === "orders"} onClick={() => go("orders")}/>
      <Nav label="Packing labels" active={module === "labels"} onClick={() => go("labels")}/>
      <Nav label="Reports & PDF" active={module === "reports"} onClick={() => go("reports")}/>
      <Nav label="Billing & challans" active={module === "billing"} onClick={() => go("billing")}/>
      <div className="seikoP0DrawerNote">Priority-zero operational build</div>
    </aside></>}
    <main className="seikoP0Main">
      {module === "home" && <Home orders={orders} onOpen={go} onPacking={openPacking}/>} 
      {module === "orders" && <Orders businessId={BUSINESS_ID} canManageSuggestions={seikoMembership?.role === "owner" || seikoMembership?.role === "admin"} onOpenLabelBatches={openPacking}/>} 
      {module === "labels" && (packingOrder ? <PackingPersonLabelDesigner businessId={BUSINESS_ID} order={packingOrder} canManageSizes={true} backLabel="← Back to Packing Labels" onBack={() => setPackingOrder(null)}/> : <PackingCenter orders={orders} onOpen={openPacking}/>)}
      {module === "reports" && <ReportsCenter orders={orders}/>} 
      {module === "billing" && <BillingCenter orders={orders}/>} 
    </main>
  </div>;
}

function Nav({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={`seikoP0Nav ${active ? "active" : ""}`} onClick={onClick}>{label}</button>;
}

function Home({ orders, onOpen, onPacking }: { orders: SeikoOrder[]; onOpen: (module: Module) => void; onPacking: (order: SeikoOrder) => void }) {
  return <section className="seikoP0Page">
    <div className="seikoP0Heading"><div><p className="eyebrow">SEIKO OPERATIONS</p><h1>Home</h1><p>Orders are the source of truth. Packing labels, reports and commercial documents all use the same order data.</p></div></div>
    <div className="seikoP0Cards">
      <button onClick={() => onOpen("orders")}><small>ACTIVE ORDERS</small><strong>{orders.length}</strong><span>Open Order Center</span></button>
      <button onClick={() => onOpen("labels")}><small>PACKING LABELS</small><strong>50 × 25</strong><span>Design and print</span></button>
      <button onClick={() => onOpen("reports")}><small>REPORTS</small><strong>PDF</strong><span>Filter, print, export</span></button>
      <button onClick={() => onOpen("billing")}><small>DOCUMENTS</small><strong>₹</strong><span>Invoice & challan</span></button>
    </div>
    <section className="seikoP0Panel"><div className="seikoP0PanelHead"><div><h2>Active orders</h2><p>Open an order normally or jump straight to packing labels.</p></div><button onClick={() => onOpen("orders")}>Order Center</button></div>
      <div className="seikoP0OrderList">{orders.map(order => <article key={order.orderId}><div><b>{order.details.orderNo}</b><strong>{order.details.clientName || "Unnamed client"}</strong><small>{order.details.clientType} · {order.records.length} records · {order.products.filter(p => p.name.trim()).length} products</small></div><div><button onClick={() => onPacking(order)}>Packing labels</button></div></article>)}{!orders.length && <p>No active orders yet.</p>}</div>
    </section>
  </section>;
}

function PackingCenter({ orders, onOpen }: { orders: SeikoOrder[]; onOpen: (order: SeikoOrder) => void }) {
  const [query, setQuery] = useState("");
  const visible = orders.filter(order => `${order.details.orderNo} ${order.details.clientName}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="seikoP0Page"><div className="seikoP0Heading"><div><p className="eyebrow">PACKING LABELS</p><h1>Choose an order</h1><p>One person/package label layout resolves products, quantities and measurements from the selected order.</p></div></div>
    <section className="seikoP0Panel"><input className="seikoP0Search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find order or client"/>
      <div className="seikoP0OrderList">{visible.map(order => <article key={order.orderId}><div><b>{order.details.orderNo}</b><strong>{order.details.clientName}</strong><small>{order.records.length} people/records · {order.products.filter(p => p.name.trim()).length} products</small></div><button onClick={() => onOpen(order)}>Open packing designer</button></article>)}</div>
    </section>
  </section>;
}

function ReportsCenter({ orders }: { orders: SeikoOrder[] }) {
  const [orderId, setOrderId] = useState(orders[0]?.orderId || "");
  useEffect(() => { if (!orderId && orders[0]) setOrderId(orders[0].orderId); }, [orderId, orders]);
  const order = orders.find(item => item.orderId === orderId) || null;
  const [filters, setFilters] = useState<Filter[]>([{ fieldId: "", value: "" }, { fieldId: "", value: "" }]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [title, setTitle] = useState("Class-wise uniform report");

  useEffect(() => { if (order) setSelectedProducts(order.products.filter(product => product.name.trim()).map(product => product.id)); }, [orderId]);

  const filteredRecords = useMemo(() => {
    if (!order) return [];
    return order.records.filter(record => filters.every(filter => !filter.fieldId || !filter.value || String(record.values[`field:${filter.fieldId}`] ?? "") === filter.value));
  }, [order, filters]);
  const products = order?.products.filter(product => selectedProducts.includes(product.id) && product.name.trim()) || [];
  const personField = order ? firstPersonField(order) : undefined;
  const summary = products.map(product => ({ product, qty: filteredRecords.reduce((sum, record, index) => sum + quantityForRecord(product, record, index === 0), 0) }));

  const csv = () => {
    if (!order) return;
    const header = [personField?.name || "Person", ...products.map(product => product.name), "Total quantity"];
    const rows = filteredRecords.map((record, index) => {
      const quantities = products.map(product => quantityForRecord(product, record, index === 0));
      return [recordValue(record, personField), ...quantities, quantities.reduce((a, b) => a + b, 0)];
    });
    const data = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${order.details.orderNo}-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <section className="seikoP0Page"><div className="seikoP0Heading"><div><p className="eyebrow">REPORTS & PDF</p><h1>Order report builder</h1><p>Filter people by any order field, choose only the products you need, then print/save as PDF or export CSV.</p></div></div>
    <div className="seikoP0TwoCol"><section className="seikoP0Panel seikoP0Controls">
      <label><span>Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}>{orders.map(item => <option key={item.orderId} value={item.orderId}>{item.details.orderNo} — {item.details.clientName}</option>)}</select></label>
      <label><span>Report title</span><input value={title} onChange={event => setTitle(event.target.value)}/></label>
      {filters.map((filter, index) => <div className="seikoP0FilterRow" key={index}><select value={filter.fieldId} onChange={event => setFilters(current => current.map((item, i) => i === index ? { fieldId: event.target.value, value: "" } : item))}><option value="">Any field</option>{order?.fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select><select value={filter.value} disabled={!filter.fieldId} onChange={event => setFilters(current => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}><option value="">All values</option>{uniqueValues(order, filter.fieldId).map(value => <option key={value}>{value}</option>)}</select></div>)}
      <fieldset><legend>Products included</legend>{order?.products.filter(product => product.name.trim()).map(product => <label className="seikoP0Check" key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={event => setSelectedProducts(current => event.target.checked ? [...current, product.id] : current.filter(id => id !== product.id))}/><span>{product.name}</span></label>)}</fieldset>
      <div className="seikoP0Actions"><button onClick={() => window.print()}>Print / Save PDF</button><button className="secondary" onClick={csv}>Export CSV</button></div>
    </section>
    <section className="seikoP0Panel seikoP0Printable"><div className="seikoP0DocHead"><div><h2>{title}</h2><p>{order?.details.orderNo} · {order?.details.clientName}</p></div><img src="/brands/seiko-logo-transparent.png" alt="SEIKO"/></div>
      <div className="seikoP0ReportMeta"><strong>{filteredRecords.length} people/records</strong><span>Ordered / planned quantities</span></div>
      <table className="seikoP0Table"><thead><tr><th>{personField?.name || "Person"}</th>{products.map(product => <th key={product.id}>{product.name}</th>)}<th>Total</th></tr></thead><tbody>{filteredRecords.map((record, index) => { const quantities = products.map(product => quantityForRecord(product, record, index === 0)); return <tr key={record.recordId}><td>{recordValue(record, personField) || record.personId}</td>{quantities.map((qty, i) => <td key={products[i].id}>{qty || "—"}</td>)}<td>{quantities.reduce((a, b) => a + b, 0)}</td></tr>; })}</tbody><tfoot><tr><th>Totals</th>{summary.map(item => <th key={item.product.id}>{item.qty}</th>)}<th>{summary.reduce((sum, item) => sum + item.qty, 0)}</th></tr></tfoot></table>
    </section></div>
  </section>;
}

function BillingCenter({ orders }: { orders: SeikoOrder[] }) {
  const [orderId, setOrderId] = useState(orders[0]?.orderId || "");
  const [kind, setKind] = useState<Extract<SeikoDocumentKind, "invoice" | "delivery_challan">>("invoice");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [taxRates, setTaxRates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SeikoCommercialDocument[]>(() => { try { return JSON.parse(localStorage.getItem(billingStoreKey(BUSINESS_ID)) || "[]"); } catch { return []; } });
  const order = orders.find(item => item.orderId === orderId) || null;
  useEffect(() => { if (!orderId && orders[0]) setOrderId(orders[0].orderId); }, [orderId, orders]);

  const lines: SeikoBillingLine[] = useMemo(() => !order ? [] : order.products.filter(product => product.name.trim()).map(product => ({ id: product.id, description: product.name, quantity: order.records.reduce((sum, record, index) => sum + quantityForRecord(product, record, index === 0), 0), unit: "pcs", unitRate: Number(rates[product.id]) || 0, taxRate: Number(taxRates[product.id]) || 0 })).filter(line => line.quantity > 0), [order, rates, taxRates]);
  const draft: SeikoCommercialDocument | null = order ? { id: "preview", kind, number: nextDocumentNumber(kind, saved), orderId: order.orderId, orderNo: order.details.orderNo, clientName: order.details.clientName, issueDate: new Date().toISOString().slice(0,10), taxMode: kind === "invoice" ? "gst" : "non_gst", taxTreatment: "intra_state", lines, notes: "", status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : null;
  const totals = draft ? documentTotals(draft) : null;
  const saveDocument = () => {
    if (!draft) return;
    const document = { ...draft, id: crypto.randomUUID(), status: "issued" as const };
    const next = [...saved, document]; setSaved(next); localStorage.setItem(billingStoreKey(BUSINESS_ID), JSON.stringify(next));
  };

  return <section className="seikoP0Page"><div className="seikoP0Heading"><div><p className="eyebrow">BILLING & DOCUMENTS</p><h1>Invoice and delivery challan</h1><p>Create commercial documents directly from the same quantities stored in the order.</p></div></div>
    <div className="seikoP0TwoCol"><section className="seikoP0Panel seikoP0Controls"><label><span>Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}>{orders.map(item => <option key={item.orderId} value={item.orderId}>{item.details.orderNo} — {item.details.clientName}</option>)}</select></label><label><span>Document</span><select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="invoice">Invoice</option><option value="delivery_challan">Delivery Challan</option></select></label>
      <div className="seikoP0BillingLines">{lines.map(line => <div key={line.id}><strong>{line.description}</strong><span>{line.quantity} pcs</span>{kind === "invoice" && <><label>Rate ₹<input inputMode="decimal" value={rates[line.id] || ""} onChange={event => setRates(current => ({ ...current, [line.id]: event.target.value }))}/></label><label>GST %<input inputMode="decimal" value={taxRates[line.id] || ""} onChange={event => setTaxRates(current => ({ ...current, [line.id]: event.target.value }))}/></label></>}</div>)}</div>
      <div className="seikoP0Actions"><button onClick={saveDocument}>Save document</button><button className="secondary" onClick={() => window.print()}>Print / Save PDF</button></div><small>Saved documents: {saved.length}</small></section>
      <section className="seikoP0Panel seikoP0Printable">{draft && <><div className="seikoP0DocHead"><div><p className="eyebrow">{kind === "invoice" ? "TAX INVOICE" : "DELIVERY CHALLAN"}</p><h2>{draft.number}</h2><p>{draft.issueDate}</p></div><img src="/brands/seiko-logo-transparent.png" alt="SEIKO"/></div><div className="seikoP0DocParties"><div><small>Bill / Deliver to</small><strong>{order?.details.clientName}</strong><p>{kind === "invoice" ? order?.details.billTo : order?.details.shipTo}</p></div><div><small>Order</small><strong>{order?.details.orderNo}</strong><p>{order?.details.contactPerson} {order?.details.contactNumber}</p></div></div><table className="seikoP0Table"><thead><tr><th>Item</th><th>Qty</th>{kind === "invoice" && <><th>Rate</th><th>GST</th><th>Amount</th></>}</tr></thead><tbody>{lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td>{kind === "invoice" && <><td>₹{line.unitRate.toFixed(2)}</td><td>{line.taxRate}%</td><td>₹{(line.quantity * line.unitRate).toFixed(2)}</td></>}</tr>)}</tbody></table>{kind === "invoice" && totals && <div className="seikoP0Totals"><span>Subtotal <b>₹{totals.subtotal.toFixed(2)}</b></span><span>Tax <b>₹{totals.tax.toFixed(2)}</b></span><strong>Total ₹{totals.total.toFixed(2)}</strong></div>}<div className="seikoP0Sign"><span>Customer acknowledgement</span><span>For SEIKO</span></div></>}</section>
    </div>
  </section>;
}
