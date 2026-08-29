"use client";

import { useEffect, useMemo, useState } from "react";
import {
  methStoreKey,
  type MethChannelOrder,
  type MethFinishedStockBalance,
  type MethFulfilmentPolicy,
  type MethFulfilmentPolicySettings,
} from "./lib/meth-commerce";

type ApiResponse<T> = { ok?: boolean; code?: string; message?: string; data?: T };

function readOrders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(methStoreKey("orders")) || "[]");
    return Array.isArray(parsed) ? parsed as MethChannelOrder[] : [];
  } catch { return []; }
}

function writeOrders(orders: MethChannelOrder[]) {
  localStorage.setItem(methStoreKey("orders"), JSON.stringify(orders));
  window.dispatchEvent(new Event("storage"));
}

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  let body: ApiResponse<T>;
  try { body = await response.json() as ApiResponse<T>; }
  catch { body = { ok: false, message: `HTTP ${response.status}` }; }
  if (!response.ok || !body.ok) throw new Error(body.message || body.code || "Request failed");
  return body.data as T;
}

export function MethRoutingDecisions({ onRouted }: { onRouted?: () => void }) {
  const [orders, setOrders] = useState<MethChannelOrder[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => setOrders(readOrders());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("jinam-server-change", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("jinam-server-change", refresh);
    };
  }, []);

  const pending = useMemo(() => orders.filter(order =>
    order.routingDecision === "pending" || (order.fulfilmentPolicy === "decide" && !order.routingDecision),
  ), [orders]);

  const route = async (order: MethChannelOrder, decision: "stock_first" | "produce") => {
    setBusyId(order.id);
    setError("");
    try {
      const result = await api<{ order: MethChannelOrder }>("/api/erp/meth/order-routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, decision }),
      });
      const next = orders.map(item => item.id === result.order.id ? result.order : item);
      setOrders(next);
      writeOrders(next);
      onRouted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order could not be routed.");
    } finally {
      setBusyId("");
    }
  };

  return <section className="jinamDashboardSection">
    <div className="jinamDashboardSectionHead"><div><h2>Stock vs produce decisions</h2><p>Orders using Decide stay here until you choose. Stock first reserves available MeTh finished stock and sends only the shortage to SEIKO; Produce sends the full quantity to production.</p></div></div>
    {error && <p className="phase2Error">{error}</p>}
    <div className="jinamDashboardList">
      {pending.map(order => <div className="jinamDashboardRow" key={order.id}>
        <div><strong>{order.orderNumber} · {order.customerName}</strong><span>{order.lines.map(line => `${line.methSku} × ${line.quantity}`).join(" · ")}</span></div>
        <div className="phase2EditorActions">
          <button className="secondary" disabled={busyId === order.id} onClick={() => void route(order, "stock_first")}>Use stock first</button>
          <button className="primary" disabled={busyId === order.id} onClick={() => void route(order, "produce")}>Produce full order</button>
        </div>
      </div>)}
      {!pending.length && <div className="jinamDashboardRow"><strong>No routing decisions waiting</strong><span>Stock-first orders route automatically. Decide-mode orders will appear here.</span></div>}
    </div>
  </section>;
}

export function MethFulfilmentRoutingSettings() {
  const [policy, setPolicy] = useState<MethFulfilmentPolicy>("stock_first");
  const [settings, setSettings] = useState<MethFulfilmentPolicySettings | null>(null);
  const [balances, setBalances] = useState<MethFinishedStockBalance[]>([]);
  const [sku, setSku] = useState("");
  const [onHand, setOnHand] = useState("0");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [policyData, stockData] = await Promise.all([
        api<{ settings: MethFulfilmentPolicySettings }>("/api/erp/meth/fulfilment-policy"),
        api<{ balances: MethFinishedStockBalance[] }>("/api/erp/meth/stock-balances"),
      ]);
      setSettings(policyData.settings);
      setPolicy(policyData.settings.defaultPolicy);
      setBalances(stockData.balances);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Fulfilment settings could not be loaded.");
    }
  };

  useEffect(() => { void load(); }, []);

  const savePolicy = async () => {
    setBusy(true); setMessage("");
    try {
      const data = await api<{ settings: MethFulfilmentPolicySettings }>("/api/erp/meth/fulfilment-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultPolicy: policy }),
      });
      setSettings(data.settings);
      setMessage(policy === "stock_first" ? "Default saved: Stock first." : "Default saved: Decide per order.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Policy could not be saved.");
    } finally { setBusy(false); }
  };

  const saveStock = async () => {
    const clean = sku.trim();
    if (!clean) { setMessage("Enter a MeTh SKU."); return; }
    setBusy(true); setMessage("");
    try {
      await api<{ balance: MethFinishedStockBalance }>("/api/erp/meth/stock-balances", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ methSku: clean, onHand: Number(onHand || 0) }),
      });
      setSku(""); setOnHand("0");
      await load();
      setMessage("Finished stock updated.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Stock could not be saved.");
    } finally { setBusy(false); }
  };

  return <>
    <section className="jinamSettingsCard">
      <h2>Order fulfilment policy</h2>
      <p>Choose how new MeTh channel orders are routed before any SEIKO production handoff is created.</p>
      <div className="phase2EditorGrid">
        <label>Default routing<select value={policy} onChange={event => setPolicy(event.target.value as MethFulfilmentPolicy)}>
          <option value="stock_first">Stock first — use stock, produce shortage</option>
          <option value="decide">Decide — choose stock or production per order</option>
        </select></label>
      </div>
      <button type="button" className="primary" disabled={busy} onClick={() => void savePolicy()}>Save fulfilment policy</button>
      <p>{settings?.updatedAt && settings.updatedAt !== new Date(0).toISOString() ? `Last updated ${new Date(settings.updatedAt).toLocaleString()}.` : "Stock first is the safe default until changed."}</p>
      {message && <p>{message}</p>}
    </section>

    <section className="jinamSettingsCard">
      <h2>MeTh finished stock</h2>
      <p>These server-side balances drive Stock first. Reserved units are protected from being promised to another order.</p>
      <div className="phase2EditorGrid">
        <label>MeTh SKU<input value={sku} onChange={event => setSku(event.target.value)} placeholder="METH-SKU"/></label>
        <label>On-hand finished units<input value={onHand} onChange={event => setOnHand(event.target.value)} type="number" min="0" step="1"/></label>
      </div>
      <button type="button" className="primary" disabled={busy} onClick={() => void saveStock()}>Update finished stock</button>
      <div className="jinamDashboardList">
        {balances.map(balance => <div className="jinamDashboardRow" key={balance.methSku}><strong>{balance.methSku}</strong><span>on hand {balance.onHand} · reserved {balance.reserved} · available {balance.available}</span></div>)}
        {!balances.length && <div className="jinamDashboardRow"><strong>No finished-stock balances yet</strong><span>Until a SKU has stock here, Stock first treats its available quantity as zero and routes the shortage to production.</span></div>}
      </div>
    </section>
  </>;
}
