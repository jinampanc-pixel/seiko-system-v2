"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SeikoBillingWorkspace } from "./seiko-billing-workspace";
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
  paymentStoreKey,
  templateStoreKey,
  type SeikoCommercialDocument,
  type SeikoPaymentRecord,
  type SeikoTemplateSet,
} from "./lib/seiko-billing";

type Phase2View = "clients" | "products" | "billing" | "templates" | null;

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function writeStore<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }

export function SeikoPhase2() {
  const businessId = "seiko";
  const [view, setView] = useState<Phase2View>(null);
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
          button.addEventListener("click", () => { setView(key); document.querySelector<HTMLButtonElement>('.menuToggle[aria-expanded="true"]')?.click(); });
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
  const saveTemplates = (next: SeikoTemplateSet) => { setTemplates(next); writeStore(templateStoreKey(businessId), next); };

  if (!view || typeof document === "undefined") return null;
  const orders = readStore<SeikoOrder[]>(orderStoreKey(businessId), []);
  return createPortal(<section className="seikoPhase2Surface" aria-label={`SEIKO ${view}`}>
    <header className="seikoPhase2Head"><div><button type="button" className="secondary" onClick={() => setView(null)}>← Back to Home</button><small>SEIKO</small><h1>{view === "clients" ? "Client Library" : view === "products" ? "Product Library" : view === "templates" ? "Document Templates" : "Billing"}</h1></div></header>
    {view === "clients" && <ClientLibrary records={clients} onChange={saveClients}/>} 
    {view === "products" && <ProductLibrary records={products} onChange={saveProducts}/>} 
    {view === "billing" && <SeikoBillingWorkspace orders={orders} legacyDocuments={documents} legacyPayments={payments}/>}
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
function templateLabel(key:string) { return ({ showPaymentTerms:"Payment terms",showBankDetails:"Bank details",showQrLink:"QR / document link",showTerms:"Terms",showAuthorizedSignatory:"Authorized signatory",showCustomerAcknowledgement:"Customer acknowledgement" } as Record<string,string>)[key] || key; }
function escapeHtml(value:string) { return value.replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char] || char)); }
