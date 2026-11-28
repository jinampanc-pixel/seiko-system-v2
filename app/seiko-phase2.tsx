"use client";
import { GarmentCatalog } from "./garment-catalog";
import { learnCatalog } from "./lib/catalog-client";



import { requestAppNavigation } from "./app-navigation";
import { useDialogInteractions } from "./dialog-interactions";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCachedOrders } from "./lib/use-cached-orders";
import { SeikoBillingWorkspace } from "./seiko-billing-workspace";
import { SeikoClientDirectory } from "./seiko-client-directory";
import { startDomEnhancement } from "./lib/dom-enhancement";
import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";
import {
  learnLibrariesFromOrders,
  libraryStoreKey,
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
function writeStore<T>(key: string, value: T) { const encoded = JSON.stringify(value); if (localStorage.getItem(key) !== encoded) localStorage.setItem(key, encoded); }

export function SeikoPhase2() {
  useDialogInteractions();
  const businessId = "seiko";
  const orders = useCachedOrders(businessId);
  const [view, setView] = useState<Phase2View>(null);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get("screen")==="billing")setView("billing");},[]);
  const [reviewingOrder,setReviewingOrder]=useState(false);
  useEffect(()=>{const open=()=>setReviewingOrder(true),resume=()=>setReviewingOrder(false);window.addEventListener("seiko:open-order-service",open);window.addEventListener("seiko:resume-billing",resume);return()=>{window.removeEventListener("seiko:open-order-service",open);window.removeEventListener("seiko:resume-billing",resume);};},[]);
  const [billingAction, setBillingAction] = useState<"payment" | "payments" | "documents" | "invoice" | "quotation" | "challan" | null>(null);
  const [billingOrderId, setBillingOrderId] = useState("");
  const [billingRequestId, setBillingRequestId] = useState(0);
  const [libraryError,setLibraryError]=useState("");
  const [clients, setClients] = useState<ClientLibraryRecord[]>([]);
  const [products, setProducts] = useState<ProductLibraryRecord[]>([]);
  const [documents, setDocuments] = useState<SeikoCommercialDocument[]>([]);
  const [payments, setPayments] = useState<SeikoPaymentRecord[]>([]);
  const [templates, setTemplates] = useState<SeikoTemplateSet>(DEFAULT_SEIKO_TEMPLATES);
  const learnedOrders = useRef<string | null>(null);

  const load = () => {
    const orderSnapshot = localStorage.getItem(orderStoreKey(businessId)) || "[]";
    const currentClients = readStore<ClientLibraryRecord[]>(libraryStoreKey(businessId, "clients"), []);
    const currentProducts = readStore<ProductLibraryRecord[]>(libraryStoreKey(businessId, "products"), []);
    const learned = orderSnapshot !== learnedOrders.current
      ? learnLibrariesFromOrders(readStore<SeikoOrder[]>(orderStoreKey(businessId), []), currentClients, currentProducts)
      : { clients: currentClients, products: currentProducts };
    if (orderSnapshot !== learnedOrders.current) {
      learnedOrders.current = orderSnapshot;
      writeStore(libraryStoreKey(businessId, "clients"), learned.clients);
      writeStore(libraryStoreKey(businessId, "products"), learned.products);

    }
    void learnCatalog(readStore<SeikoOrder[]>(orderStoreKey(businessId), []), learned.products).then(()=>setLibraryError("")).catch(error=>setLibraryError("Catalog update pending: "+error.message));
    setClients(learned.clients);
    setProducts(learned.products);
    setDocuments(readStore<SeikoCommercialDocument[]>(billingStoreKey(businessId), []));
    setPayments(readStore<SeikoPaymentRecord[]>(paymentStoreKey(businessId), []));
    setTemplates(readStore<SeikoTemplateSet>(templateStoreKey(businessId), DEFAULT_SEIKO_TEMPLATES));
  };

  useEffect(() => {
    const close=()=>setView(null);window.addEventListener("jinam:open-settings",close);window.addEventListener("seiko:home-arrived",close);return()=>{window.removeEventListener("jinam:open-settings",close);window.removeEventListener("seiko:home-arrived",close);};
  },[]);

  useEffect(() => {
    const openBilling = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: "payment" | "payments" | "documents" | "invoice" | "quotation" | "challan"; orderId?: string }>).detail;
      setReviewingOrder(false);setBillingOrderId(detail?.orderId || ""); setBillingRequestId(value => value + 1); setBillingAction(detail?.action || null); setView("billing");
    };
    window.addEventListener("seiko:open-billing", openBilling);
    return () => window.removeEventListener("seiko:open-billing", openBilling);
  }, []);

  useEffect(() => {
    if (!view||reviewingOrder) return;
    const bodyOverflow = document.body.style.overflow; const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden";
    return () => { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = rootOverflow; };
  }, [view,reviewingOrder]);

  useEffect(() => {
    queueMicrotask(load);
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("seiko:orders-cache-updated", onStorage);
    window.addEventListener("focus", onStorage);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("seiko:orders-cache-updated", onStorage); window.removeEventListener("focus", onStorage); };
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
          button.addEventListener("click", () => requestAppNavigation(()=>{ setReviewingOrder(false);setView(key); document.querySelector<HTMLButtonElement>('.menuToggle[aria-expanded="true"]')?.click(); }));
          if (settings) menu.insertBefore(button, settings); else menu.appendChild(button);
        };
        addNav("clients", "Clients", "◎");
        addNav("products", "Catalog", "◇");
        addNav("billing", "Billing", "₹");
      }

      const clientField = Array.from(document.querySelectorAll<HTMLLabelElement>(".orderSetup .clientDetails label")).find(label => (label.textContent).toLowerCase()?.includes("client name"));
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


    });
    return () => controller.stop();
  }, [clients, products]);

  const saveTemplates = (next: SeikoTemplateSet) => { setTemplates(next); writeStore(templateStoreKey(businessId), next); };

  if (!view || typeof document === "undefined") return null;

  return createPortal(<section className="seikoPhase2Surface" style={reviewingOrder?{display:"none"}:undefined} aria-label={`SEIKO ${view}`}>
    <header className="phase2BrandHeader"><button type="button" className="globalHomeLogo" aria-label="Go to Home" onClick={()=>window.dispatchEvent(new Event("seiko:home"))}><img src="/brands/seiko-logo-approved.webp" alt="SEIKO Tailors"/></button><button type="button" className="menuToggle" aria-label="Open Billing Navigation" onClick={()=>requestAppNavigation(()=>{setView(null);document.querySelector<HTMLButtonElement>('.app .topbar .menuToggle[aria-expanded="false"]')?.click();})}><span/><span/><span/></button></header><header className="seikoPhase2Head"><div><button type="button" className="secondary appBackControl" onClick={() => requestAppNavigation(()=>setView(null))}>← Back</button><h1>{view === "clients" ? "Client Library" : view === "products" ? "Catalog" : view === "templates" ? "Document Templates" : "Billing"}</h1></div></header>
    {view === "clients" && <SeikoClientDirectory legacyRecords={clients}/>} {/* shared client directory */}
    {libraryError&&view==="products"&&<p role="alert">{libraryError}</p>}
    {view === "products" && <GarmentCatalog/>} {/* shared garment and set Catalog */}
    {view === "billing" && <SeikoBillingWorkspace suspended={reviewingOrder} key={billingRequestId} initialOrderId={billingOrderId} orders={orders} legacyDocuments={documents} legacyPayments={payments} initialAction={billingAction} onActionHandled={() => setBillingAction(null)}/>}
    {view === "templates" && <TemplateManager templates={templates} onChange={saveTemplates}/>} 
  </section>, document.body);
}

function TemplateManager({ templates, onChange }: { templates: SeikoTemplateSet; onChange: (templates: SeikoTemplateSet) => void }) {
  const [draft, setDraft] = useState(templates.invoice); const save = () => onChange({ ...templates, invoice: draft });
  return <div className="phase2Workspace"><section className="phase2TemplateBaseline"><h2>SEIKO Invoice Baseline</h2></section><div className="phase2EditorInline"><Input label="Invoice Title" value={draft.title} onChange={title => setDraft({ ...draft, title })}/>{(["showPaymentTerms","showBankDetails","showQrLink","showTerms","showAuthorizedSignatory","showCustomerAcknowledgement"] as const).map(key => <label className="phase2Check" key={key}><input type="checkbox" checked={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.checked })}/>{templateLabel(key)}</label>)}<label>Terms, One Per Line<textarea value={draft.terms.join("\n")} onChange={event => setDraft({ ...draft, terms: event.target.value.split("\n") })}/></label><button className="primary" onClick={save}>Save Invoice Template</button></div></div>;
}

function Input({ label,value,onChange }: { label:string;value:string;onChange:(value:string)=>void }) { return <label>{label}<input value={value} onChange={event=>onChange(event.target.value)}/></label>; }
function templateLabel(key:string) { return ({ showPaymentTerms:"Payment terms",showBankDetails:"Bank details",showQrLink:"QR / document link",showTerms:"Terms",showAuthorizedSignatory:"Authorized signatory",showCustomerAcknowledgement:"Customer acknowledgement" } as Record<string,string>)[key] || key; }
function escapeHtml(value:string) { return value.replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char] || char)); }

