"use client";

import { useEffect, useMemo, useState } from "react";
import { LabelDesigner } from "../../label-designer";
import { orderStoreKey, type SeikoOrder } from "../../lib/order-domain";

type LabelPurpose = "production" | "packing" | "inventory";

export default function CreateLabelsPage() {
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState("seiko");
  const [purpose, setPurpose] = useState<LabelPurpose | null>(null);
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<SeikoOrder[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
    const requestedPurpose = params.get("purpose");
    const requestedOrder = params.get("order") || "";
    setBusinessId(business);
    setPurpose(requestedPurpose === "production" || requestedPurpose === "packing" || requestedPurpose === "inventory" ? requestedPurpose : null);
    setOrderId(requestedOrder);
    try {
      const saved = JSON.parse(localStorage.getItem(orderStoreKey(business)) || "[]") as SeikoOrder[];
      setOrders(saved.filter(order => !order.archived));
    } catch {
      setOrders([]);
    }
    setReady(true);
  }, []);

  const selectedOrder = useMemo(() => orders.find(order => order.orderId === orderId) || null, [orderId, orders]);

  if (!ready) return <main className="labelCreateRoute"><div className="panel">Loading label workspace…</div></main>;

  if (!selectedOrder) {
    return <main className="labelCreateRoute">
      <section className="labelCreateRouteHead">
        <div><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order that supplies the label data. Product-level selection happens inside the designer.</p></div>
        <button className="secondary" onClick={() => window.close()}>Close tab</button>
      </section>
      <section className="panel labelCreateOrderChoice">
        <label><span>Source</span><div className="logicLockedField">Order data <small>System source</small></div></label>
        <label><span>Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order…</option>{orders.map(order => <option key={order.orderId} value={order.orderId}>{order.details.orderNo} — {order.details.clientName || "Unnamed client"}</option>)}</select></label>
        <label><span>Purpose</span><select value={purpose || "production"} onChange={event => setPurpose(event.target.value as LabelPurpose)}><option value="production">Production</option><option value="packing">Packing</option><option value="inventory">Inventory</option></select></label>
      </section>
      <p className="labelLogicNote"><b>Why only Order data?</b> Orders and Products were not two editable ERP entities—they were two views of the same order data. The designer already lets you select products, people, groups, or the whole order, so a separate Orders/Products dropdown added ambiguity without adding capability.</p>
    </main>;
  }

  return <LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={purpose} canManageSizes onBack={() => setOrderId("")} />;
}
