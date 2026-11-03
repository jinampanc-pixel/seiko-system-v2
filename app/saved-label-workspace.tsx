"use client";
import { useMemo, useState, type ComponentProps } from "react";
import { useCachedOrders } from "./lib/use-cached-orders";
import { LabelDesigner } from "./label-designer";
import { PackingPersonLabelDesigner } from "./packing-person-label-designer";

// Read the saved format before either editor consumes the pending task.
export function SavedLabelWorkspace(props: ComponentProps<typeof LabelDesigner>) {
  const [task] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const id = sessionStorage.getItem(`jinam:${props.businessId}:labels:open-task`);
      const tasks = JSON.parse(localStorage.getItem(`jinam:${props.businessId}:labels:tasks-v1`) || "[]") as Array<{ id: string; orderId: string; purpose: string; sourceMode: string; orderIds?:string[] }>;
      const task = tasks.find(item => item.id === id && item.orderId === props.order?.orderId);
      return task || null;
    } catch { return null; }
  });
  const orders = useCachedOrders(props.businessId);
  const sourceOrders = useMemo(() => task?.orderIds?.length ? task.orderIds.map(id => id === props.order?.orderId ? props.order : orders.find(source => source.orderId === id)).filter(source => !!source) : props.order ? [props.order] : [], [task,props.order,orders]);
  if (task?.orderIds?.some(id => !sourceOrders.some(source => source.orderId === id))) return <p role="status">A source order is unavailable. Refresh orders before opening this label set.</p>;
  const packingPerson = task?.purpose === "packing" && task.sourceMode === "person";
  return packingPerson && props.order ? <PackingPersonLabelDesigner {...props} order={props.order} sourceOrders={sourceOrders}/> : <LabelDesigner {...props} sourceOrders={sourceOrders}/>;
}
