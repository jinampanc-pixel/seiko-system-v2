"use client";
import { uiStatusLabel } from "./lib/ui-copy";

import { useMemo, useState } from "react";
import {
  activeRateForSku,
  allocateStock,
  createIntercompanyTransaction,
  createProductionHandoff,
  intercompanyStoreKey,
  legalProfileStoreKey,
  methStoreKey,
  normalizeChannelOrder,
  productionUnitCost,
  settleIntercompanyTransaction,
  type BusinessLegalProfile,
  type IntercompanyPayment,
  type IntercompanyTransaction,
  type ManufacturingRate,
  type MethChannelOrder,
  type ProductionHandoff,
  type SalesChannel,
  type SkuMapping,
} from "./lib/meth-commerce";

function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event("jinam-data-change")); }
function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0); }

export function MethOrdersSurface() {
  const [orders, setOrders] = useState(() => read<MethChannelOrder[]>(methStoreKey("orders"), []));
  const [open, setOpen] = useState(false);
  const save = (next: MethChannelOrder[]) => { setOrders(next); write(methStoreKey("orders"), next); };
  const createManual = (form: FormData) => {
    const externalOrderId = String(form.get("externalOrderId") || "").trim() || crypto.randomUUID();
    const channel = String(form.get("channel") || "manual") as SalesChannel;
    const quantity = Number(form.get("quantity") || 1);
    const unitSellingPrice = Number(form.get("unitSellingPrice") || 0);
    const finished = Number(form.get("finishedStock") || 0);
    const allocation = allocateStock(quantity, finished);
    const order = normalizeChannelOrder({
      channel: { channel, externalOrderId, externalOrderNumber: String(form.get("externalOrderNumber") || ""), importedAt: new Date().toISOString() },
      customerName: String(form.get("customerName") || "Walk-in customer"),
      currency: "INR",
      lines: [{ id: crypto.randomUUID(), methSku: String(form.get("methSku") || "").trim(), productName: String(form.get("productName") || "").trim(), size: String(form.get("size") || ""), colour: String(form.get("colour") || ""), quantity, unitSellingPrice, discount: 0, taxAmount: 0, finishedStockAllocated: allocation.finishedStockAllocated, productionRequired: allocation.productionRequired, seikoHandoffIds: [] }],
      shippingCharged: 0,
      orderDiscount: 0,
      customerPaymentStatus: String(form.get("paymentStatus") || "unpaid") as MethChannelOrder["customerPaymentStatus"],
      settlementStatus: channel === "manual" || channel === "b2b" ? "not_expected" : "pending",
      fulfilmentStatus: allocation.productionRequired > 0 ? "awaiting_production" : "ready_to_pack",
      placedAt: new Date().toISOString(),
    });
    save([order, ...orders.filter(item => !(item.channel.channel === order.channel.channel && item.channel.externalOrderId === order.channel.externalOrderId))]);
    setOpen(false);
  };
  return <section className="jinamDashboard"><div className="jinamDashboardHead"><div><small>METH</small><h1>Orders</h1></div><button className="primary" onClick={() => setOpen(true)}>Add / Import Order</button></div>
    <div className="jinamDashboardSection"><div className="jinamDashboardList">{orders.map(order => <div className="jinamDashboardRow" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.channel.channel.toUpperCase()} · {order.channel.externalOrderNumber || order.channel.externalOrderId} · {order.customerName}</span></div><div><strong>{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitSellingPrice - line.discount, 0))}</strong><span>{order.customerPaymentStatus} · {order.fulfilmentStatus}</span></div></div>)}{!orders.length && <div className="jinamDashboardRow"><strong>No MeTh Orders Yet</strong></div>}</div></div>
    {open && <div className="phase2EditorBackdrop"><form className="phase2Editor" action={createManual}><h2>Add Channel Order</h2><div className="phase2EditorGrid"><label>Channel<select name="channel" defaultValue="shopify"><option value="shopify">Shopify</option><option value="amazon">Amazon</option><option value="marketplace">Other Marketplace</option><option value="b2b">B2B</option><option value="manual">Manual</option></select></label><label>External Order ID<input name="externalOrderId"/></label><label>External Order Number<input name="externalOrderNumber"/></label><label>Customer<input name="customerName"/></label><label>MeTh SKU<input name="methSku" required/></label><label>Product<input name="productName" required/></label><label>Size<input name="size"/></label><label>Colour<input name="colour"/></label><label>Quantity<input name="quantity" type="number" min="1" defaultValue="1"/></label><label>Finished Stock Available<input name="finishedStock" type="number" min="0" defaultValue="0"/></label><label>Selling Price / Unit<input name="unitSellingPrice" type="number" min="0" step="0.01"/></label><label>Customer Payment<select name="paymentStatus" defaultValue="unpaid"><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="cod_due">COD Due</option><option value="cod_collected">COD Collected</option></select></label></div><footer><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary">Save Order</button></footer></form></div>}
  </section>;
}

export function MethProductionSurface() {
  const [orders, setOrders] = useState(() => read<MethChannelOrder[]>(methStoreKey("orders"), []));
  const [mappings] = useState(() => read<SkuMapping[]>(methStoreKey("sku-mappings"), []));
  const [rates] = useState(() => read<ManufacturingRate[]>(methStoreKey("rates"), []));
  const [handoffs, setHandoffs] = useState(() => read<ProductionHandoff[]>(methStoreKey("handoffs"), []));
  const shortages = useMemo(() => orders.flatMap(order => order.lines.filter(line => line.productionRequired > 0 && !line.seikoHandoffIds.length).map(line => ({ order, line }))), [orders]);
  const create = (order: MethChannelOrder, line: MethChannelOrder["lines"][number]) => {
    const mapping = mappings.find(item => item.active && item.methSku === line.methSku);
    const rate = activeRateForSku(rates, line.methSku);
    if (!mapping || !rate) { alert("Add an active SKU mapping and SEIKO manufacturing rate first."); return; }
    const handoff = createProductionHandoff(order, line, mapping, rate);
    const nextHandoffs = [handoff, ...handoffs]; setHandoffs(nextHandoffs); write(methStoreKey("handoffs"), nextHandoffs);
    const nextOrders = orders.map(item => item.id === order.id ? { ...item, fulfilmentStatus: "awaiting_production" as const, lines: item.lines.map(existing => existing.id === line.id ? { ...existing, seikoHandoffIds: [...existing.seikoHandoffIds, handoff.id] } : existing), updatedAt: new Date().toISOString() } : item);
    setOrders(nextOrders); write(methStoreKey("orders"), nextOrders);
  };
  return <section className="jinamDashboard"><div className="jinamDashboardHead"><div><small>METH → SEIKO</small><h1>Production Handoffs</h1></div></div><section className="jinamDashboardSection"><div className="jinamDashboardSectionHead"><div><h2>Needs Production</h2></div></div><div className="jinamDashboardList">{shortages.map(({ order, line }) => <div className="jinamDashboardRow" key={line.id}><div><strong>{order.orderNumber} · {line.productName}</strong><span>{line.methSku} · Stock {line.finishedStockAllocated} · Make {line.productionRequired}</span></div><button className="primary" onClick={() => create(order, line)}>Send to SEIKO</button></div>)}{!shortages.length && <div className="jinamDashboardRow"><strong>No Unassigned Shortages</strong></div>}</div></section><section className="jinamDashboardSection"><div className="jinamDashboardSectionHead"><div><h2>Handoffs</h2></div></div><div className="jinamDashboardList">{handoffs.map(item => <div className="jinamDashboardRow" key={item.id}><div><strong>{item.id} · {item.productName}</strong><span>{item.methOrderNumber} · Requested {item.quantityRequested} · Accepted {item.quantityAccepted} · Completed {item.quantityCompleted} · Chargeable {item.quantityChargeable}</span></div><div><strong>{money(item.agreedUnitRate)}/Unit</strong><span>{item.seikoStatus} → {item.methStatus}</span></div></div>)}</div></section></section>;
}

export function MethFinanceSurface() {
  const [transactions, setTransactions] = useState(() => read<IntercompanyTransaction[]>(intercompanyStoreKey("transactions"), []));
  const [payments, setPayments] = useState(() => read<IntercompanyPayment[]>(intercompanyStoreKey("payments"), []));
  const addPayment = (transaction: IntercompanyTransaction) => {
    const amount = Number(prompt(`Payment amount to SEIKO. Outstanding ${money(transaction.outstandingAmount)}`, String(transaction.outstandingAmount)) || 0); if (amount <= 0) return;
    const payment: IntercompanyPayment = { id: crypto.randomUUID(), transactionId: transaction.id, amount: Math.min(amount, transaction.outstandingAmount), paidAt: new Date().toISOString(), mode: "bank", reference: "", createdAt: new Date().toISOString() };
    const nextPayments = [payment, ...payments]; setPayments(nextPayments); write(intercompanyStoreKey("payments"), nextPayments);
    const nextTransactions = transactions.map(item => item.id === transaction.id ? settleIntercompanyTransaction(item, nextPayments) : item); setTransactions(nextTransactions); write(intercompanyStoreKey("transactions"), nextTransactions);
  };
  const totalOutstanding = transactions.reduce((sum, item) => sum + item.outstandingAmount, 0);
  return <section className="jinamDashboard"><div className="jinamDashboardHead"><div><small>METH FINANCE</small><h1>SEIKO Payable</h1></div></div><div className="jinamDashboardGrid"><article className="jinamDashboardCard"><small>SEIKO PAYABLE</small><strong>{money(totalOutstanding)}</strong><span>Outstanding Linked Production Invoices</span></article><article className="jinamDashboardCard"><small>TRANSACTIONS</small><strong>{transactions.length}</strong><span>SEIKO → MeTh Production Charges</span></article></div><section className="jinamDashboardSection"><div className="jinamDashboardList">{transactions.map(item => <div className="jinamDashboardRow" key={item.id}><div><strong>{item.id}</strong><span>{item.handoffId} · Gross {money(item.grossAmount)} · Paid {money(item.paidAmount)} · Unit Landed Production Cost Tracked from Accepted Output</span></div><div><strong>{money(item.outstandingAmount)}</strong><span>{uiStatusLabel(String(item.status ?? ""))}</span>{item.outstandingAmount > 0 && <button className="primary" onClick={() => addPayment(item)}>Record Payment</button>}</div></div>)}{!transactions.length && <div className="jinamDashboardRow"><strong>No SEIKO Payable Yet</strong></div>}</div></section></section>;
}

export function MethCommerceSettings() {
  const [mappings, setMappings] = useState(() => read<SkuMapping[]>(methStoreKey("sku-mappings"), []));
  const [rates, setRates] = useState(() => read<ManufacturingRate[]>(methStoreKey("rates"), []));
  const [profile, setProfile] = useState<BusinessLegalProfile>(() => read(legalProfileStoreKey("meth"), { businessId: "meth", legalName: "", gstin: "", registeredAddress: "", stateCode: "", bankName: "", bankAccountName: "", bankAccountNumber: "", ifsc: "", invoicePrefix: "MTH", gstRegistered: false, updatedAt: new Date().toISOString() }));
  const addMapping = () => { const methSku = prompt("MeTh SKU"); if (!methSku) return; const seikoProductionSku = prompt("Matching SEIKO production SKU"); if (!seikoProductionSku) return; const next = [{ id: crypto.randomUUID(), methSku, productName: prompt("Product Name") || methSku, shopifyVariantId: "", amazonSellerSku: "", amazonAsin: "", seikoProductionSku, active: true, updatedAt: new Date().toISOString() }, ...mappings]; setMappings(next); write(methStoreKey("sku-mappings"), next); };
  const addRate = () => { const methSku = prompt("MeTh SKU"); if (!methSku) return; const rate = Number(prompt("SEIKO manufacturing rate per unit") || 0); if (rate <= 0) return; const mapping = mappings.find(item => item.methSku === methSku); if (!mapping) { alert("Create SKU mapping first."); return; } const taxRate = Number(prompt("GST rate % on SEIKO invoice", "0") || 0); const sameSkuRates = rates.filter(item => item.methSku === methSku); const next = [{ id: crypto.randomUUID(), methSku, seikoProductionSku: mapping.seikoProductionSku, rate, taxRate, unit: "pc", effectiveFrom: new Date().toISOString().slice(0,10), version: Math.max(0, ...sameSkuRates.map(item => item.version)) + 1, active: true }, ...rates]; setRates(next); write(methStoreKey("rates"), next); };
  const saveProfile = (next: BusinessLegalProfile) => { setProfile(next); write(legalProfileStoreKey("meth"), next); };
  return <><section className="jinamSettingsCard"><h2>Legal Entity</h2><div className="phase2EditorGrid"><label>Legal Name<input value={profile.legalName} onChange={event => saveProfile({ ...profile, legalName: event.target.value, updatedAt: new Date().toISOString() })}/></label><label>GSTIN<input value={profile.gstin} onChange={event => saveProfile({ ...profile, gstin: event.target.value, gstRegistered: Boolean(event.target.value), updatedAt: new Date().toISOString() })}/></label><label>Registered Address<input value={profile.registeredAddress} onChange={event => saveProfile({ ...profile, registeredAddress: event.target.value, updatedAt: new Date().toISOString() })}/></label><label>State Code<input value={profile.stateCode} onChange={event => saveProfile({ ...profile, stateCode: event.target.value, updatedAt: new Date().toISOString() })}/></label></div></section><section className="jinamSettingsCard"><h2>SKU Mapping</h2><button className="primary" onClick={addMapping}>Add SKU Mapping</button>{mappings.map(item => <div className="jinamDashboardRow" key={item.id}><strong>{item.methSku}</strong><span>SEIKO {item.seikoProductionSku}</span></div>)}</section><section className="jinamSettingsCard"><h2>SEIKO Manufacturing Rates</h2><button className="primary" onClick={addRate}>Add Rate</button>{rates.map(item => <div className="jinamDashboardRow" key={item.id}><strong>{item.methSku} · {money(item.rate)}</strong><span>V{item.version} · GST {item.taxRate}% · From {item.effectiveFrom}</span></div>)}</section><section className="jinamSettingsCard"><h2>Channel Integrations</h2></section></>;
}

export function createFinanceFromChargeableHandoff(handoff: ProductionHandoff) {
  const existing = read<IntercompanyTransaction[]>(intercompanyStoreKey("transactions"), []);
  if (handoff.intercompanyTransactionId || existing.some(item => item.handoffId === handoff.id)) return existing;
  const transaction = createIntercompanyTransaction(handoff);
  const next = [transaction, ...existing]; write(intercompanyStoreKey("transactions"), next); return next;
}

export function transactionUnitCost(transaction: IntercompanyTransaction, handoff: ProductionHandoff) { return productionUnitCost(transaction, handoff.quantityChargeable); }
