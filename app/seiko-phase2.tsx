"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { startDomEnhancement } from "./lib/dom-enhancement";
import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";
import {
  learnLibrariesFromOrders,
  libraryStoreKey,
  stableLibraryId,
  type ClientLibraryRecord,
  type ProductLibraryRecord,
} from "./lib/business-library";
import {
  DEFAULT_SEIKO_TEMPLATES,
  billingStoreKey,
  documentTotals,
  invoiceOutstanding,
  nextDocumentNumber,
  paymentStoreKey,
  paymentsForInvoice,
  templateStoreKey,
  type SeikoBillingLine,
  type SeikoCommercialDocument,
  type SeikoDocumentKind,
  type SeikoPaymentRecord,
  type SeikoTemplateSet,
} from "./lib/seiko-billing";

type Phase2View = "clients" | "products" | "billing" | "templates" | null;

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function writeStore<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }
function today() { return new Date().toISOString().slice(0, 10); }

export function SeikoPhase2() {
  const businessId = "seiko";
  const [view, setView] = useState<Phase2View>(null);
  const [focusOrderId, setFocusOrderId] = useState<string>("");
  const [clients, setClients] = useState<ClientLibraryRecord[]>([]);
  const [products, setProducts] = useState<ProductLibraryRecord[]>([]);
  const [documents, setDocuments] = useState<SeikoCommercialDocument[]>([]);
  const [payments, setPayments] = useState<SeikoPaymentRecord[]>([]);
  const [templates, setTemplates] = useState<SeikoTemplateSet>(DEFAULT_SEIKO_TEMPLATES);

  const load = () => {
    const orders = readStore<SeikoOrder[]>(orderStoreKey(businessId), []);
    const currentClients = readStore<ClientLibraryRecord[]>(libraryStoreKey(businessId, "clients"), []);
    const currentProducts = readStore<ProductLibraryRecord[]>(libraryStoreKey(businessId, "products"), []);
    const learned = learnLibrariesFromOrders(orders, currentClients, currentProducts);
    writeStore(libraryStoreKey(businessId, "clients"), learned.clients);
    writeStore(libraryStoreKey(businessId, "products"), learned.products);
    setClients(learned.clients);
    setProducts(learned.products);
    setDocuments(readStore<SeikoCommercialDocument[]>(billingStoreKey(businessId), []));
    setPayments(readStore<SeikoPaymentRecord[]>(paymentStoreKey(businessId), []));
    setTemplates(readStore<SeikoTemplateSet>(templateStoreKey(businessId), DEFAULT_SEIKO_TEMPLATES));
  };

  useEffect(() => {
    queueMicrotask(load);
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(load, 5000);
    return () => { window.removeEventListener("storage", onStorage); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const controller = startDomEnhancement(() => {
      const menu = document.querySelector<HTMLElement>(".app .topbar .moduleMenu");
      if (menu) {
        const settings = menu.querySelector(".moduleMenuSettings");
        const addNav = (key: Exclude<Phase2View, null>, label: string, icon: string) => {
          if (menu.querySelector(`[data-phase2-nav="${key}"]`)) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "nav";
          button.dataset.phase2Nav = key;
          button.innerHTML = `<span>${icon}</span><small>${label}</small>`;
          button.addEventListener("click", () => { setFocusOrderId(""); setView(key); document.querySelector<HTMLButtonElement>('.menuToggle[aria-expanded="true"]')?.click(); });
          if (settings) menu.insertBefore(button, settings); else menu.appendChild(button);
        };
        addNav("clients", "Clients", "◎");
        addNav("products", "Products", "◇");
        addNav("billing", "Billing", "₹");
      }

      const clientField = Array.from(document.querySelectorAll<HTMLLabelElement>(".orderSetup .clientDetails label")).find(label => label.textContent?.includes("Client name"));
      const clientInput = clientField?.querySelector<HTMLInputElement>("input");
      if (clientInput) {
        clientInput.setAttribute("list", "seiko-client-library-options");
        let list = document.getElementById("seiko-client-library-options") as HTMLDataListElement | null;
        if (!list) { list = document.createElement("datalist"); list.id = "seiko-client-library-options"; document.body.appendChild(list); }
        const signature = clients.filter(item => !item.archived).map(item => `${item.id}:${item.updatedAt}`).join("|");
        if (list.dataset.signature !== signature) {
          list.dataset.signature = signature;
          list.innerHTML = clients.filter(item => !item.archived).map(item => `<option value="${escapeHtml(item.name)}"></option>`).join("");
        }
      }

      document.querySelectorAll<HTMLInputElement>('.orderSetup input[list^="product-suggestions-"]').forEach(input => {
        const listId = input.getAttribute("list"); if (!listId) return;
        const list = document.getElementById(listId); if (!list) return;
        const existing = new Set(Array.from(list.querySelectorAll("option")).map(option => option.getAttribute("value")?.toLowerCase()));
        products.filter(item => !item.archived).forEach(item => { if (!existing.has(item.name.toLowerCase())) { const option = document.createElement("option"); option.value = item.name; list.appendChild(option); } });
      });

      document.querySelectorAll<HTMLElement>(".orderSetup .attnToggle").forEach(toggle => { toggle.style.display = "none"; });

      const settingsPanel = document.querySelector<HTMLElement>(".themePanel");
      if (settingsPanel && !settingsPanel.querySelector('[data-phase2-template-card="true"]')) {
        const card = document.createElement("section");
        card.dataset.phase2TemplateCard = "true";
        card.className = "seikoAccessSettings phase2TemplateCard";
        card.innerHTML = '<div><b>Document templates</b><p>Manage SEIKO quotation, challan, invoice and receipt structure.</p></div><button type="button" class="secondary">Open templates</button>';
        card.querySelector("button")?.addEventListener("click", () => setView("templates"));
        settingsPanel.querySelector(".seikoAccessSettings")?.insertAdjacentElement("afterend", card);
      }
    });
    return () => controller.stop();
  }, [clients, products]);

  const saveClients = (next: ClientLibraryRecord[]) => { setClients(next); writeStore(libraryStoreKey(businessId, "clients"), next); };
  const saveProducts = (next: ProductLibraryRecord[]) => { setProducts(next); writeStore(libraryStoreKey(businessId, "products"), next); };
  const saveDocuments = (next: SeikoCommercialDocument[]) => { setDocuments(next); writeStore(billingStoreKey(businessId), next); };
  const savePayments = (next: SeikoPaymentRecord[]) => { setPayments(next); writeStore(paymentStoreKey(businessId), next); };
  const saveTemplates = (next: SeikoTemplateSet) => { setTemplates(next); writeStore(templateStoreKey(businessId), next); };

  if (!view || typeof document === "undefined") return null;
  const orders = readStore<SeikoOrder[]>(orderStoreKey(businessId), []);
  return createPortal(<section className="seikoPhase2Surface" aria-label={`SEIKO ${view}`}>
    <header className="seikoPhase2Head"><div><button type="button" className="secondary" onClick={() => setView(null)}>← Back to Home</button><small>SEIKO</small><h1>{view === "clients" ? "Client Library" : view === "products" ? "Product Library" : view === "templates" ? "Document Templates" : "Billing"}</h1></div></header>
    {view === "clients" && <ClientLibrary records={clients} onChange={saveClients}/>} 
    {view === "products" && <ProductLibrary records={products} onChange={saveProducts}/>} 
    {view === "billing" && <SeikoBilling orders={orders} documents={documents} payments={payments} focusOrderId={focusOrderId} onDocuments={saveDocuments} onPayments={savePayments}/>} 
    {view === "templates" && <TemplateManager templates={templates} onChange={saveTemplates}/>} 
  </section>, document.body);
}

function ClientLibrary({ records, onChange }: { records: ClientLibraryRecord[]; onChange: (records: ClientLibraryRecord[]) => void }) {
  const [query, setQuery] = useState(""); const [archived, setArchived] = useState(false); const [editing, setEditing] = useState<ClientLibraryRecord | null>(null);
  const visible = records.filter(record => record.archived === archived && `${record.name} ${record.type} ${record.phone} ${record.contactPerson}`.toLowerCase().includes(query.toLowerCase()));
  const blank = (): ClientLibraryRecord => ({ id: crypto.randomUUID(), name: "", type: "", contactPerson: "", phone: "", email: "", billingAddress: "", deliveryAddress: "", gstin: "", archived: false, sourceOrderIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const save = () => { if (!editing?.name.trim()) return; const duplicate = records.find(item => item.id !== editing.id && item.name.trim().toLowerCase() === editing.name.trim().toLowerCase()); const record = { ...editing, id: duplicate?.id || stableLibraryId("client", editing.name), updatedAt: new Date().toISOString() }; onChange([record, ...records.filter(item => item.id !== editing.id && item.id !== duplicate?.id)]); setEditing(null); };
  return <LibraryFrame query={query} setQuery={setQuery} archived={archived} setArchived={setArchived} onAdd={() => setEditing(blank())} addLabel="Add client">
    {visible.map(record => <LibraryRow key={record.id} title={record.name} meta={[record.type, record.contactPerson, record.phone].filter(Boolean).join(" · ")} archived={record.archived} onEdit={() => setEditing({ ...record })} onArchive={() => onChange(records.map(item => item.id === record.id ? { ...item, archived: !item.archived, updatedAt: new Date().toISOString() } : item))}/>)}
    {!visible.length && <Empty text={archived ? "No archived clients." : "No clients match this view."}/>} 
    {editing && <Editor title="Client" onCancel={() => setEditing(null)} onSave={save}><Input label="Client name" value={editing.name} onChange={name => setEditing({ ...editing, name })}/><Input label="Client type" value={editing.type} onChange={type => setEditing({ ...editing, type })}/><Input label="Contact person" value={editing.contactPerson} onChange={contactPerson => setEditing({ ...editing, contactPerson })}/><Input label="Phone" value={editing.phone} onChange={phone => setEditing({ ...editing, phone })}/><Input label="Email" value={editing.email} onChange={email => setEditing({ ...editing, email })}/><Input label="GSTIN" value={editing.gstin} onChange={gstin => setEditing({ ...editing, gstin })}/><Input label="Billing address" value={editing.billingAddress} onChange={billingAddress => setEditing({ ...editing, billingAddress })}/><Input label="Delivery address" value={editing.deliveryAddress} onChange={deliveryAddress => setEditing({ ...editing, deliveryAddress })}/></Editor>}
  </LibraryFrame>;
}

function ProductLibrary({ records, onChange }: { records: ProductLibraryRecord[]; onChange: (records: ProductLibraryRecord[]) => void }) {
  const [query, setQuery] = useState(""); const [archived, setArchived] = useState(false); const [editing, setEditing] = useState<ProductLibraryRecord | null>(null);
  const visible = records.filter(record => record.archived === archived && `${record.name} ${record.category} ${record.hsnSac}`.toLowerCase().includes(query.toLowerCase()));
  const blank = (): ProductLibraryRecord => ({ id: crypto.randomUUID(), name: "", category: "", unit: "pc", costPrice: 0, sellingPrice: 0, taxRate: 0, hsnSac: "", archived: false, sourceOrderIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const save = () => { if (!editing?.name.trim()) return; const duplicate = records.find(item => item.id !== editing.id && item.name.trim().toLowerCase() === editing.name.trim().toLowerCase()); const record = { ...editing, id: duplicate?.id || stableLibraryId("product", editing.name), updatedAt: new Date().toISOString() }; onChange([record, ...records.filter(item => item.id !== editing.id && item.id !== duplicate?.id)]); setEditing(null); };
  return <LibraryFrame query={query} setQuery={setQuery} archived={archived} setArchived={setArchived} onAdd={() => setEditing(blank())} addLabel="Add product">
    {visible.map(record => <LibraryRow key={record.id} title={record.name} meta={`${record.category || "Uncategorised"} · ₹${record.sellingPrice || 0} / ${record.unit}`} archived={record.archived} onEdit={() => setEditing({ ...record })} onArchive={() => onChange(records.map(item => item.id === record.id ? { ...item, archived: !item.archived, updatedAt: new Date().toISOString() } : item))}/>)}
    {!visible.length && <Empty text={archived ? "No archived products." : "No products match this view."}/>} 
    {editing && <Editor title="Product" onCancel={() => setEditing(null)} onSave={save}><Input label="Product name" value={editing.name} onChange={name => setEditing({ ...editing, name })}/><Input label="Category" value={editing.category} onChange={category => setEditing({ ...editing, category })}/><Input label="Unit" value={editing.unit} onChange={unit => setEditing({ ...editing, unit })}/><NumberInput label="Cost price" value={editing.costPrice} onChange={costPrice => setEditing({ ...editing, costPrice })}/><NumberInput label="Selling price" value={editing.sellingPrice} onChange={sellingPrice => setEditing({ ...editing, sellingPrice })}/><NumberInput label="GST rate %" value={editing.taxRate} onChange={taxRate => setEditing({ ...editing, taxRate })}/><Input label="HSN / SAC" value={editing.hsnSac} onChange={hsnSac => setEditing({ ...editing, hsnSac })}/></Editor>}
  </LibraryFrame>;
}

function SeikoBilling({ orders, documents, payments, focusOrderId, onDocuments, onPayments }: { orders: SeikoOrder[]; documents: SeikoCommercialDocument[]; payments: SeikoPaymentRecord[]; focusOrderId: string; onDocuments: (next: SeikoCommercialDocument[]) => void; onPayments: (next: SeikoPaymentRecord[]) => void }) {
  const [orderId, setOrderId] = useState(focusOrderId || orders[0]?.orderId || ""); const [creating, setCreating] = useState<SeikoDocumentKind | null>(null); const [paymentInvoice, setPaymentInvoice] = useState<string>("");
  const invoices = documents.filter(document => document.kind === "invoice" && (!orderId || document.orderId === orderId));
  const filtered = documents.filter(document => !orderId || document.orderId === orderId);
  const invoiceTotal = invoices.reduce((sum, invoice) => sum + documentTotals(invoice).total, 0); const received = invoices.reduce((sum, invoice) => sum + paymentsForInvoice(payments, invoice.id), 0); const outstanding = invoices.reduce((sum, invoice) => sum + invoiceOutstanding(invoice, payments), 0);
  return <div className="phase2Workspace"><div className="phase2Toolbar"><label>Order<select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">All orders</option>{orders.filter(order => !order.archived).map(order => <option value={order.orderId} key={order.orderId}>{order.details.orderNo} — {order.details.clientName}</option>)}</select></label><div className="phase2Actions"><button className="secondary" onClick={() => setCreating("quotation")}>+ Quotation</button><button className="secondary" onClick={() => setCreating("delivery_challan")}>+ Challan</button><button className="primary" onClick={() => setCreating("invoice")}>+ Invoice</button><button className="secondary" disabled={!invoices.length} onClick={() => setPaymentInvoice(invoices[0]?.id || "")}>+ Payment</button></div></div>
    <div className="phase2Metrics"><article><small>INVOICED</small><strong>₹{invoiceTotal.toFixed(2)}</strong></article><article><small>RECEIVED</small><strong>₹{received.toFixed(2)}</strong></article><article className={outstanding === 0 ? "positive" : ""}><small>OUTSTANDING</small><strong>₹{outstanding.toFixed(2)}</strong></article><article><small>DOCUMENTS</small><strong>{filtered.length}</strong></article></div>
    <section className="phase2Table"><div className="phase2TableHead"><span>Document</span><span>Client / Order</span><span>Total</span><span>Status</span><span>Balance</span></div>{filtered.map(document => { const totals = documentTotals(document); const balance = document.kind === "invoice" ? invoiceOutstanding(document, payments) : 0; return <div className="phase2TableRow" key={document.id}><span><b>{document.number}</b><small>{labelKind(document.kind)} · {document.issueDate}</small></span><span><b>{document.clientName}</b><small>{document.orderNo}</small></span><span>₹{totals.total.toFixed(2)}</span><span>{document.status.replace("_", " ")}</span><span>{document.kind === "invoice" ? `₹${balance.toFixed(2)}` : "—"}</span></div>; })}{!filtered.length && <Empty text="No SEIKO commercial documents in this view yet."/>}</section>
    {creating && <DocumentEditor kind={creating} order={orders.find(order => order.orderId === orderId) || orders.find(order => !order.archived)} documents={documents} onCancel={() => setCreating(null)} onSave={document => { onDocuments([document, ...documents]); setOrderId(document.orderId); setCreating(null); }}/>} 
    {paymentInvoice && <PaymentEditor invoice={documents.find(document => document.id === paymentInvoice)!} payments={payments} onCancel={() => setPaymentInvoice("")} onSave={payment => { onPayments([payment, ...payments]); setPaymentInvoice(""); }}/>} 
  </div>;
}

function DocumentEditor({ kind, order, documents, onCancel, onSave }: { kind: SeikoDocumentKind; order?: SeikoOrder; documents: SeikoCommercialDocument[]; onCancel: () => void; onSave: (document: SeikoCommercialDocument) => void }) {
  const [taxMode, setTaxMode] = useState<"gst" | "non_gst">("gst"); const [taxTreatment, setTaxTreatment] = useState<"intra_state" | "inter_state">("intra_state");
  const [lines, setLines] = useState<SeikoBillingLine[]>(() => (order?.products.filter(product => product.name.trim()).map(product => ({ id: crypto.randomUUID(), description: product.name, quantity: product.quantityMode === "order_total" ? Math.max(1, product.orderTotal) : Math.max(1, product.defaultQuantity * Math.max(1, order.records.length)), unit: "pc", unitRate: 0, taxRate: 0 })) || [{ id: crypto.randomUUID(), description: "", quantity: 1, unit: "pc", unitRate: 0, taxRate: 0 }]));
  if (!order) return <Editor title={`New ${labelKind(kind)}`} onCancel={onCancel} onSave={onCancel}><p>Create an order first so the document remains linked to an operational record.</p></Editor>;
  const draft: SeikoCommercialDocument = { id: crypto.randomUUID(), kind, number: nextDocumentNumber(kind, documents), orderId: order.orderId, orderNo: order.details.orderNo, clientName: order.details.clientName, issueDate: today(), taxMode, taxTreatment, lines, notes: "", status: "issued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const totals = documentTotals(draft);
  return <Editor title={`New ${labelKind(kind)} · ${order.details.orderNo}`} onCancel={onCancel} onSave={() => onSave(draft)}><div className="phase2TaxRow"><label>Tax mode<select value={taxMode} onChange={event => setTaxMode(event.target.value as "gst"|"non_gst")}><option value="gst">GST document</option><option value="non_gst">Without GST</option></select></label>{taxMode === "gst" && <label>GST treatment<select value={taxTreatment} onChange={event => setTaxTreatment(event.target.value as "intra_state"|"inter_state")}><option value="intra_state">CGST + SGST</option><option value="inter_state">IGST</option></select></label>}</div><div className="phase2Lines">{lines.map((line,index) => <div className="phase2Line" key={line.id}><input placeholder="Description" value={line.description} onChange={event => setLines(lines.map((item,i) => i === index ? { ...item, description: event.target.value } : item))}/><input type="number" min="0" step="0.01" value={line.quantity} onChange={event => setLines(lines.map((item,i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))}/><input value={line.unit} onChange={event => setLines(lines.map((item,i) => i === index ? { ...item, unit: event.target.value } : item))}/><input type="number" min="0" step="0.01" placeholder="Rate" value={line.unitRate} onChange={event => setLines(lines.map((item,i) => i === index ? { ...item, unitRate: Number(event.target.value) } : item))}/>{taxMode === "gst" && <input type="number" min="0" step="0.01" placeholder="GST %" value={line.taxRate} onChange={event => setLines(lines.map((item,i) => i === index ? { ...item, taxRate: Number(event.target.value) } : item))}/>}</div>)}</div><button type="button" className="secondary" onClick={() => setLines([...lines,{ id: crypto.randomUUID(), description:"", quantity:1, unit:"pc", unitRate:0, taxRate:0 }])}>+ Line</button><div className="phase2Total"><span>Subtotal ₹{totals.subtotal.toFixed(2)}</span>{taxMode === "gst" && <span>Tax ₹{totals.tax.toFixed(2)}</span>}<b>Total ₹{totals.total.toFixed(2)}</b></div></Editor>;
}

function PaymentEditor({ invoice, payments, onCancel, onSave }: { invoice: SeikoCommercialDocument; payments: SeikoPaymentRecord[]; onCancel: () => void; onSave: (payment: SeikoPaymentRecord) => void }) {
  const balance = invoiceOutstanding(invoice, payments); const [amount, setAmount] = useState(balance); const [mode, setMode] = useState("Bank transfer"); const [reference, setReference] = useState("");
  return <Editor title={`Record payment · ${invoice.number}`} onCancel={onCancel} onSave={() => onSave({ id: crypto.randomUUID(), invoiceId: invoice.id, orderId: invoice.orderId, receiptNumber: `RCP-${new Date().getFullYear()}-${String(payments.length + 1).padStart(4,"0")}`, date: today(), amount, mode, reference, notes: "", createdAt: new Date().toISOString() })}><p>Outstanding before this payment: <b>₹{balance.toFixed(2)}</b></p><NumberInput label="Amount received" value={amount} onChange={setAmount}/><Input label="Payment mode" value={mode} onChange={setMode}/><Input label="Reference / transaction ID" value={reference} onChange={setReference}/></Editor>;
}

function TemplateManager({ templates, onChange }: { templates: SeikoTemplateSet; onChange: (templates: SeikoTemplateSet) => void }) {
  const [draft, setDraft] = useState(templates.invoice); const save = () => onChange({ ...templates, invoice: draft });
  return <div className="phase2Workspace"><section className="phase2TemplateBaseline"><h2>SEIKO invoice baseline</h2><p>The configurable structure preserves business identity, customer details, invoice number/date, payment terms, item lines, totals/balance, bank details, document link/QR, terms, authorized signatory and customer acknowledgement. Tax treatment remains document-specific.</p></section><div className="phase2EditorInline"><Input label="Invoice title" value={draft.title} onChange={title => setDraft({ ...draft, title })}/>{(["showPaymentTerms","showBankDetails","showQrLink","showTerms","showAuthorizedSignatory","showCustomerAcknowledgement"] as const).map(key => <label className="phase2Check" key={key}><input type="checkbox" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })}/>{templateLabel(key)}</label>)}<label>Terms, one per line<textarea value={draft.terms.join("\n")} onChange={event => setDraft({ ...draft, terms: event.target.value.split("\n") })}/></label><button className="primary" onClick={save}>Save invoice template</button></div></div>;
}

function LibraryFrame({ query,setQuery,archived,setArchived,onAdd,addLabel,children }: { query:string;setQuery:(v:string)=>void;archived:boolean;setArchived:(v:boolean)=>void;onAdd:()=>void;addLabel:string;children:React.ReactNode }) { return <div className="phase2Workspace"><div className="phase2Toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search library"/><label className="phase2Check"><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)}/>Archived</label><button className="primary" onClick={onAdd}>+ {addLabel}</button></div><section className="phase2LibraryList">{children}</section></div>; }
function LibraryRow({ title,meta,archived,onEdit,onArchive }: { title:string;meta:string;archived:boolean;onEdit:()=>void;onArchive:()=>void }) { return <article className="phase2LibraryRow"><div><b>{title}</b><small>{meta || "No additional details"}</small></div><div><button className="secondary" onClick={onEdit}>Edit</button><button className="secondary" onClick={onArchive}>{archived ? "Restore" : "Archive"}</button></div></article>; }
function Editor({ title,onCancel,onSave,children }: { title:string;onCancel:()=>void;onSave:()=>void;children:React.ReactNode }) { return <div className="phase2Scrim"><section className="phase2Editor"><header><h2>{title}</h2><button onClick={onCancel}>×</button></header><div className="phase2EditorBody">{children}</div><footer><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={onSave}>Save</button></footer></section></div>; }
function Input({ label,value,onChange }: { label:string;value:string;onChange:(value:string)=>void }) { return <label>{label}<input value={value} onChange={event=>onChange(event.target.value)}/></label>; }
function NumberInput({ label,value,onChange }: { label:string;value:number;onChange:(value:number)=>void }) { return <label>{label}<input type="number" min="0" step="0.01" value={value} onChange={event=>onChange(Number(event.target.value))}/></label>; }
function Empty({ text }: { text:string }) { return <div className="phase2Empty">{text}</div>; }
function labelKind(kind: SeikoDocumentKind) { return ({ quotation:"Quotation", delivery_challan:"Delivery Challan", invoice:"Invoice", payment_receipt:"Payment Receipt" } as Record<SeikoDocumentKind,string>)[kind]; }
function templateLabel(key:string) { return ({ showPaymentTerms:"Payment terms",showBankDetails:"Bank details",showQrLink:"QR / document link",showTerms:"Terms",showAuthorizedSignatory:"Authorized signatory",showCustomerAcknowledgement:"Customer acknowledgement" } as Record<string,string>)[key] || key; }
function escapeHtml(value:string) { return value.replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char] || char)); }
