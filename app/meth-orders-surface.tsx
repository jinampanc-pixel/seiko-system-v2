"use client";

import { useEffect, useState } from "react";
import {
  methStoreKey,
  normalizeChannelOrder,
  type MethChannelOrder,
  type MethFulfilmentPolicy,
  type SalesChannel,
} from "./lib/meth-commerce";

type ApiResponse<T> = { ok?: boolean; code?: string; message?: string; data?: T };
type SyncEnvelope = { record: MethChannelOrder };

function readOrders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(methStoreKey("orders")) || "[]");
    return Array.isArray(parsed) ? parsed as MethChannelOrder[] : [];
  } catch { return []; }
}
function writeOrders(orders: MethChannelOrder[]) {
  localStorage.setItem(methStoreKey("orders"), JSON.stringify(orders));
  window.dispatchEvent(new Event("jinam-data-change"));
}
function money(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0); }

async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  let body: ApiResponse<T>;
  try { body = await response.json() as ApiResponse<T>; }
  catch { body = { ok: false, message: `HTTP ${response.status}` }; }
  if (!response.ok || !body.ok) throw new Error(body.message || body.code || "Request failed");
  return body.data as T;
}

export function MethOrdersSurface() {
  const [orders, setOrders] = useState<MethChannelOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [defaultPolicy, setDefaultPolicy] = useState<MethFulfilmentPolicy>("stock_first");
  const [policy, setPolicy] = useState<MethFulfilmentPolicy>("stock_first");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => setOrders(readOrders());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("jinam-server-change", refresh);
    void json<{ settings: { defaultPolicy: MethFulfilmentPolicy } }>("/api/erp/meth/fulfilment-policy")
      .then(data => { setDefaultPolicy(data.settings.defaultPolicy); setPolicy(data.settings.defaultPolicy); })
      .catch(() => { /* Stock first remains the safe default. */ });
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("jinam-server-change", refresh);
    };
  }, []);

  const saveLocal = (order: MethChannelOrder) => {
    const next = [order, ...readOrders().filter(item => item.id !== order.id)];
    setOrders(next);
    writeOrders(next);
  };

  const createManual = async (form: FormData) => {
    setSaving(true);
    setError("");
    try {
      const externalOrderId = String(form.get("externalOrderId") || "").trim() || crypto.randomUUID();
      const channel = String(form.get("channel") || "manual") as SalesChannel;
      const quantity = Math.max(1, Math.floor(Number(form.get("quantity") || 1)));
      const unitSellingPrice = Math.max(0, Number(form.get("unitSellingPrice") || 0));
      const selectedPolicy = String(form.get("fulfilmentPolicy") || defaultPolicy) as MethFulfilmentPolicy;
      const order = normalizeChannelOrder({
        channel: {
          channel,
          externalOrderId,
          externalOrderNumber: String(form.get("externalOrderNumber") || ""),
          importedAt: new Date().toISOString(),
        },
        customerName: String(form.get("customerName") || "Walk-in customer"),
        currency: "INR",
        lines: [{
          id: crypto.randomUUID(),
          methSku: String(form.get("methSku") || "").trim(),
          productName: String(form.get("productName") || "").trim(),
          size: String(form.get("size") || ""),
          colour: String(form.get("colour") || ""),
          quantity,
          unitSellingPrice,
          discount: 0,
          taxAmount: 0,
          finishedStockAllocated: 0,
          productionRequired: 0,
          seikoHandoffIds: [],
        }],
        shippingCharged: 0,
        orderDiscount: 0,
        customerPaymentStatus: String(form.get("paymentStatus") || "unpaid") as MethChannelOrder["customerPaymentStatus"],
        settlementStatus: channel === "manual" || channel === "b2b" ? "not_expected" : "pending",
        fulfilmentPolicy: selectedPolicy,
        routingDecision: "pending",
        fulfilmentStatus: "unfulfilled",
        placedAt: new Date().toISOString(),
      });

      const stored = await json<{ saved?: SyncEnvelope[]; conflicts?: SyncEnvelope[] }>("/api/erp/meth/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "mutate",
          businessId: "meth",
          collection: "orders",
          mutations: [{ record: order, expectedVersion: null }],
        }),
      });
      if (stored.conflicts?.length) throw new Error("An order with this external ID already exists. Use a different ID or edit the existing order.");
      const authoritative = stored.saved?.[0]?.record || order;
      let finalOrder = authoritative;

      if (selectedPolicy === "stock_first") {
        const routed = await json<{ order: MethChannelOrder; blockedHandoffs?: string[] }>("/api/erp/meth/order-routing", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: authoritative.id, decision: "stock_first" }),
        });
        finalOrder = routed.order;
      }

      saveLocal(finalOrder);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="jinamDashboard">
    <div className="jinamDashboardHead"><div><small>METH</small><h1>Orders</h1><p>One operational order model for Shopify, Amazon, marketplaces, B2B and manual sales.</p></div><button className="primary" onClick={() => { setPolicy(defaultPolicy); setError(""); setOpen(true); }}>Add / import order</button></div>
    <div className="jinamDashboardSection"><div className="jinamDashboardList">
      {orders.map(order => <div className="jinamDashboardRow" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.channel.channel.toUpperCase()} · {order.channel.externalOrderNumber || order.channel.externalOrderId} · {order.customerName}</span></div><div><strong>{money(order.lines.reduce((sum, line) => sum + line.quantity * line.unitSellingPrice - line.discount, 0))}</strong><span>{order.customerPaymentStatus} · {order.fulfilmentStatus} · {order.routingDecision === "pending" ? "decision required" : order.routingDecision || "stock first"}</span></div></div>)}
      {!orders.length && <div className="jinamDashboardRow"><strong>No MeTh orders yet</strong><span>Connected channel orders will normalize into this same list.</span></div>}
    </div></div>
    {open && <div className="phase2EditorBackdrop"><form className="phase2Editor" action={createManual}><h2>Add channel order</h2>
      {error && <p className="phase2Error">{error}</p>}
      <div className="phase2EditorGrid">
        <label>Channel<select name="channel" defaultValue="manual"><option value="shopify">Shopify</option><option value="amazon">Amazon</option><option value="marketplace">Other marketplace</option><option value="b2b">B2B</option><option value="manual">Manual</option></select></label>
        <label>External order ID<input name="externalOrderId"/></label>
        <label>External order number<input name="externalOrderNumber"/></label>
        <label>Customer<input name="customerName"/></label>
        <label>MeTh SKU<input name="methSku" required/></label>
        <label>Product<input name="productName" required/></label>
        <label>Size<input name="size"/></label>
        <label>Colour<input name="colour"/></label>
        <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1"/></label>
        <label>Selling price / unit<input name="unitSellingPrice" type="number" min="0" step="0.01"/></label>
        <label>Fulfilment routing<select name="fulfilmentPolicy" value={policy} onChange={event => setPolicy(event.target.value as MethFulfilmentPolicy)}><option value="stock_first">Stock first — reserve stock, produce shortage</option><option value="decide">Decide — choose after order is saved</option></select></label>
        <label>Customer payment<select name="paymentStatus" defaultValue="unpaid"><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="cod_due">COD due</option><option value="cod_collected">COD collected</option></select></label>
      </div>
      <p>{policy === "stock_first" ? "Jinam will use the authoritative MeTh finished-stock balance. You do not type an availability estimate." : "The order will wait in Production until Stock first or Produce full order is chosen."}</p>
      <footer><button type="button" className="secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save order"}</button></footer>
    </form></div>}
  </section>;
}
