"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccess } from "./access-control";
import { Orders } from "./orders";
import { PackingPersonLabelDesigner } from "./packing-person-label-designer";
import type { SeikoOrder } from "./lib/order-domain";
import { SeikoPriorityHome } from "./seiko-priority0/home";
import { SeikoPackingCenter } from "./seiko-priority0/packing-center";
import { SeikoReportsCenter } from "./seiko-priority0/reports";
import { SeikoBillingCenter } from "./seiko-priority0/billing";
import { readActiveOrders, SEIKO_BUSINESS_ID, type SeikoPriorityModule } from "./seiko-priority0/model";
import { SeikoPriorityShell } from "./seiko-priority0/shell";

export function SeikoPriority0App() {
  const { session, membership } = useAccess();
  const seikoMembership = session?.businesses.find(item => item.businessId === SEIKO_BUSINESS_ID) || membership;
  const [module, setModule] = useState<SeikoPriorityModule>("home");
  const [orders, setOrders] = useState<SeikoOrder[]>(readActiveOrders);
  const [packingOrder, setPackingOrder] = useState<SeikoOrder | null>(null);

  const refreshOrders = useCallback(() => setOrders(readActiveOrders()), []);

  useEffect(() => {
    const sync = () => refreshOrders();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("seiko:orders-cache-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("seiko:orders-cache-updated", sync);
    };
  }, [refreshOrders]);

  const navigate = (next: SeikoPriorityModule) => {
    if (next !== "labels") setPackingOrder(null);
    setModule(next);
    refreshOrders();
  };

  const openPacking = (order: SeikoOrder) => {
    setPackingOrder(order);
    setModule("labels");
  };

  return <SeikoPriorityShell active={module} theme={seikoMembership?.theme} onNavigate={navigate}>
    {module === "home" && <SeikoPriorityHome orders={orders} onOpen={navigate} onPacking={openPacking}/>} 
    {module === "orders" && <Orders businessId={SEIKO_BUSINESS_ID} canManageSuggestions={seikoMembership?.role === "owner" || seikoMembership?.role === "admin"} onOpenLabelBatches={openPacking}/>} 
    {module === "labels" && (packingOrder
      ? <PackingPersonLabelDesigner businessId={SEIKO_BUSINESS_ID} order={packingOrder} canManageSizes={true} backLabel="← Back to Packing Labels" onBack={() => { setPackingOrder(null); refreshOrders(); }}/>
      : <SeikoPackingCenter orders={orders} onOpen={openPacking}/>)}
    {module === "reports" && <SeikoReportsCenter orders={orders}/>} 
    {module === "billing" && <SeikoBillingCenter orders={orders}/>} 
  </SeikoPriorityShell>;
}
