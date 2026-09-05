"use client";

import type { SeikoOrder } from "../lib/order-domain";
import { activeProducts, type SeikoPriorityModule } from "./model";

export function SeikoPriorityHome({
  orders,
  onOpen,
  onPacking,
}: {
  orders: SeikoOrder[];
  onOpen: (module: SeikoPriorityModule) => void;
  onPacking: (order: SeikoOrder) => void;
}) {
  return <section className="seikoP0Page">
    <div className="seikoP0Heading">
      <div>
        <p className="eyebrow">SEIKO OPERATIONS</p>
        <h1>Home</h1>
        <p>Orders are the source of truth. Packing labels, reports and commercial documents use the same order data.</p>
      </div>
    </div>

    <div className="seikoP0Cards" aria-label="Operational modules">
      <button type="button" onClick={() => onOpen("orders")}><small>ACTIVE ORDERS</small><strong>{orders.length}</strong><span>Open Order Center</span></button>
      <button type="button" onClick={() => onOpen("labels")}><small>PACKING LABELS</small><strong>50 × 25</strong><span>Design and print</span></button>
      <button type="button" onClick={() => onOpen("reports")}><small>REPORTS</small><strong>PDF</strong><span>Filter, print, export</span></button>
      <button type="button" onClick={() => onOpen("billing")}><small>DOCUMENTS</small><strong>₹</strong><span>Invoice & challan</span></button>
    </div>

    <section className="seikoP0Panel">
      <div className="seikoP0PanelHead">
        <div>
          <h2>Active orders</h2>
          <p>Open Order Center for setup/workspace, or jump straight to packing labels.</p>
        </div>
        <button type="button" onClick={() => onOpen("orders")}>Order Center</button>
      </div>
      <div className="seikoP0OrderList">
        {orders.map(order => <article key={order.orderId}>
          <div>
            <b>{order.details.orderNo}</b>
            <strong>{order.details.clientName || "Unnamed client"}</strong>
            <small>{order.details.clientType} · {order.records.length} records · {activeProducts(order).length} products</small>
          </div>
          <div><button type="button" onClick={() => onPacking(order)}>Packing labels</button></div>
        </article>)}
        {!orders.length && <div className="seikoP0Empty"><b>No active orders yet.</b><span>Create or restore an order from Order Center.</span></div>}
      </div>
    </section>
  </section>;
}
