"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { startDomEnhancement } from "./lib/dom-enhancement";
import {
  createIntercompanyTransaction,
  intercompanyStoreKey,
  legalProfileStoreKey,
  methStoreKey,
  settleIntercompanyTransaction,
  translateSeikoStatus,
  updateHandoffQuantities,
  type BusinessLegalProfile,
  type IntercompanyPayment,
  type IntercompanyTransaction,
  type ProductionHandoff,
  type SeikoProductionStatus,
} from "./lib/meth-commerce";

function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event("jinam-data-change")); }
function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0); }

export function SeikoMethSync() {
  const [open, setOpen] = useState(false);
  const [handoffs, setHandoffs] = useState<ProductionHandoff[]>([]);
  const [transactions, setTransactions] = useState<IntercompanyTransaction[]>([]);
  const [profile, setProfile] = useState<BusinessLegalProfile>(() => read(legalProfileStoreKey("seiko"), { businessId: "seiko", legalName: "", gstin: "", registeredAddress: "", stateCode: "", bankName: "", bankAccountName: "", bankAccountNumber: "", ifsc: "", invoicePrefix: "SEI", gstRegistered: false, updatedAt: new Date().toISOString() }));

  const load = () => { setHandoffs(read<ProductionHandoff[]>(methStoreKey("handoffs"), [])); setTransactions(read<IntercompanyTransaction[]>(intercompanyStoreKey("transactions"), [])); };
  useEffect(() => { queueMicrotask(load); const listener = () => load(); window.addEventListener("jinam-data-change", listener); window.addEventListener("storage", listener); return () => { window.removeEventListener("jinam-data-change", listener); window.removeEventListener("storage", listener); }; }, []);

  useEffect(() => {
    const controller = startDomEnhancement(() => {
      const menu = document.querySelector<HTMLElement>(".app .topbar .moduleMenu");
      if (menu && !menu.querySelector('[data-seiko-meth="true"]')) {
        const button = document.createElement("button"); button.type = "button"; button.className = "nav"; button.dataset.seikoMeth = "true"; button.innerHTML = "<span>↔</span><small>MeTh jobs</small>"; button.addEventListener("click", () => { setOpen(true); document.querySelector<HTMLButtonElement>('.menuToggle[aria-expanded="true"]')?.click(); });
        const settings = menu.querySelector(".moduleMenuSettings"); if (settings) menu.insertBefore(button, settings); else menu.appendChild(button);
      }
      const settingsPanel = document.querySelector<HTMLElement>(".themePanel");
      if (settingsPanel && !settingsPanel.querySelector('[data-seiko-legal-profile="true"]')) {
        const card = document.createElement("section"); card.className = "seikoAccessSettings"; card.dataset.seikoLegalProfile = "true"; card.innerHTML = '<div><b>Legal entity & MeTh manufacturing</b><p>SEIKO invoices MeTh as a separate legal entity for accepted production.</p></div><button type="button" class="secondary">Open</button>'; card.querySelector("button")?.addEventListener("click", () => setOpen(true)); settingsPanel.appendChild(card);
      }
    });
    return () => controller.stop();
  }, []);

  const saveHandoff = (handoff: ProductionHandoff) => { const next = handoffs.map(item => item.id === handoff.id ? handoff : item); setHandoffs(next); write(methStoreKey("handoffs"), next); };
  const changeStatus = (handoff: ProductionHandoff, status: SeikoProductionStatus) => saveHandoff({ ...handoff, seikoStatus: status, methStatus: translateSeikoStatus(status), updatedAt: new Date().toISOString() });
  const setQuantities = (handoff: ProductionHandoff) => { const accepted = Number(prompt("Accepted quantity", String(handoff.quantityAccepted || handoff.quantityRequested)) || 0); const completed = Number(prompt("Completed / QC-passed quantity", String(handoff.quantityCompleted || accepted)) || 0); const chargeable = Number(prompt("Chargeable quantity to MeTh", String(handoff.quantityChargeable || completed)) || 0); const next = updateHandoffQuantities(handoff, accepted, completed, chargeable); saveHandoff(next); };
  const issueCharge = (handoff: ProductionHandoff) => {
    if (handoff.quantityChargeable <= 0) { alert("Set accepted, completed and chargeable quantity first."); return; }
    const existing = transactions.find(item => item.handoffId === handoff.id); if (existing) { alert(`Already linked to ${existing.id}`); return; }
    const transaction = createIntercompanyTransaction(handoff);
    const sellerInvoiceNumber = `${profile.invoicePrefix || "SEI"}-${new Date().getFullYear()}-${String(transactions.length + 1).padStart(4, "0")}`;
    const linked = { ...transaction, sellerInvoiceNumber, sellerDocumentId: `seiko-${transaction.id}` };
    const nextTransactions = [linked, ...transactions]; setTransactions(nextTransactions); write(intercompanyStoreKey("transactions"), nextTransactions);
    saveHandoff({ ...handoff, intercompanyTransactionId: linked.id, updatedAt: new Date().toISOString() });
  };
  const saveProfile = (next: BusinessLegalProfile) => { setProfile(next); write(legalProfileStoreKey("seiko"), next); };

  if (!open || typeof document === "undefined") return null;
  const payments = read<IntercompanyPayment[]>(intercompanyStoreKey("payments"), []);
  return createPortal(<section className="seikoPhase2Surface" aria-label="SEIKO MeTh manufacturing"><header className="seikoPhase2Head"><div><button className="secondary" onClick={() => setOpen(false)}>← Back to Home</button><small>SEIKO ↔ METH</small><h1>MeTh manufacturing</h1><p>MeTh customer orders stay in MeTh. SEIKO receives only explicit production handoffs and creates a real receivable for chargeable output.</p></div></header>
    <section className="phase2Panel"><h2>SEIKO legal entity</h2><div className="phase2EditorGrid"><label>Legal name<input value={profile.legalName} onChange={event => saveProfile({ ...profile, legalName: event.target.value, updatedAt: new Date().toISOString() })}/></label><label>GSTIN<input value={profile.gstin} onChange={event => saveProfile({ ...profile, gstin: event.target.value, gstRegistered: Boolean(event.target.value), updatedAt: new Date().toISOString() })}/></label><label>Registered address<input value={profile.registeredAddress} onChange={event => saveProfile({ ...profile, registeredAddress: event.target.value, updatedAt: new Date().toISOString() })}/></label><label>State code<input value={profile.stateCode} onChange={event => saveProfile({ ...profile, stateCode: event.target.value, updatedAt: new Date().toISOString() })}/></label><label>Invoice prefix<input value={profile.invoicePrefix} onChange={event => saveProfile({ ...profile, invoicePrefix: event.target.value, updatedAt: new Date().toISOString() })}/></label></div></section>
    <section className="phase2Panel"><h2>Incoming MeTh production handoffs</h2><div className="jinamDashboardList">{handoffs.map(item => <div className="jinamDashboardRow" key={item.id}><div><strong>{item.id} · {item.productName}</strong><span>{item.methOrderNumber} · {item.methSku} → {item.seikoProductionSku} · requested {item.quantityRequested} · accepted {item.quantityAccepted} · completed {item.quantityCompleted} · chargeable {item.quantityChargeable}</span></div><div><select value={item.seikoStatus} onChange={event => changeStatus(item, event.target.value as SeikoProductionStatus)}><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="cutting">Cutting</option><option value="stitching">Stitching</option><option value="finishing">Finishing</option><option value="qc">QC</option><option value="completed">Completed</option><option value="transferred">Transferred to MeTh</option><option value="cancelled">Cancelled</option></select><button className="secondary" onClick={() => setQuantities(item)}>Quantities</button><button className="primary" disabled={Boolean(item.intercompanyTransactionId)} onClick={() => issueCharge(item)}>{item.intercompanyTransactionId ? "Invoiced" : "Create MeTh charge"}</button></div></div>)}{!handoffs.length && <div className="jinamDashboardRow"><strong>No MeTh handoffs</strong><span>SEIKO does not see MeTh customer orders directly.</span></div>}</div></section>
    <section className="phase2Panel"><h2>MeTh receivable</h2><div className="jinamDashboardList">{transactions.map(item => { const settled = settleIntercompanyTransaction(item, payments); return <div className="jinamDashboardRow" key={item.id}><div><strong>{item.sellerInvoiceNumber || item.id}</strong><span>{item.id} · {item.handoffId} · taxable {money(item.taxableAmount)} · GST {money(item.taxAmount)}</span></div><div><strong>{money(settled.outstandingAmount)}</strong><span>{settled.status} · MeTh payable mirrors this same transaction</span></div></div>; })}</div></section>
  </section>, document.body);
}
