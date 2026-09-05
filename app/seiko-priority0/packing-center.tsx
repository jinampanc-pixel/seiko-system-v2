"use client";

import { useMemo, useState } from "react";
import type { SeikoOrder } from "../lib/order-domain";
import { activeProducts } from "./model";

export function SeikoPackingCenter({ orders, onOpen }: { orders: SeikoOrder[]; onOpen: (order: SeikoOrder) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => orders.filter(order => !needle || `${order.details.orderNo} ${order.details.clientName} ${order.details.clientType}`.toLowerCase().includes(needle)), [needle, orders]);

  return <section className="seikoP0Page">
    <div className="seikoP0Heading">
      <div>
        <p className="eyebrow">PACKING LABELS</p>
        <h1>Choose an order</h1>
        <p>One person/package layout resolves products, quantities, measurements and order-defined person fields from the selected order.</p>
      </div>
    </div>
    <section className="seikoP0Panel">
      <label className="seikoP0SearchLabel">
        <span className="srOnly">Find order or client</span>
        <input className="seikoP0Search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find order, client or client type"/>
      </label>
      <div className="seikoP0OrderList">
        {visible.map(order => <article key={order.orderId}>
          <div>
            <b>{order.details.orderNo}</b>
            <strong>{order.details.clientName || "Unnamed client"}</strong>
            <small>{order.records.length} people/records · {activeProducts(order).length} products · {order.status}</small>
          </div>
          <button type="button" onClick={() => onOpen(order)}>Open packing designer</button>
        </article>)}
        {!visible.length && <div className="seikoP0Empty"><b>No matching orders.</b><span>Change the search or create an order first.</span></div>}
      </div>
    </section>
  </section>;
}
