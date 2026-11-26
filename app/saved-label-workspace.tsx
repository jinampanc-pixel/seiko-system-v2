"use client";

import { readLabelStorage } from "./lib/label-storage";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useCachedOrders } from "./lib/use-cached-orders";
import type { SeikoOrder } from "./lib/order-domain";
import { LabelDesigner } from "./label-designer";
import { PackingPersonLabelDesigner } from "./packing-person-label-designer";

// Read the saved format before either editor consumes the pending task.
export function SavedLabelWorkspace(props: ComponentProps<typeof LabelDesigner>) {
  const [task] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const id = sessionStorage.getItem(`jinam:${props.businessId}:labels:open-task`);
      const tasks = JSON.parse(readLabelStorage(`jinam:${props.businessId}:labels:tasks-v1`) || "[]") as Array<{ id: string; orderId: string; purpose: string; sourceMode: string; orderIds?:string[]; referenceOrder?:SeikoOrder }>;
      const task = tasks.find(item => item.id === id && item.orderId === props.order?.orderId);
      return task || null;
    } catch { return null; }
  });
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const actionKey = `jinam:${props.businessId}:labels:open-task-direct-action`;
    if (!task || sessionStorage.getItem(actionKey) !== "print") return;
    let started = false;
    const attempt = () => {
      const editor = host.current?.querySelector<HTMLElement>("[data-active-label-task]");
      if (started || editor?.dataset.activeLabelTask !== task.id) return;
      const button = editor.querySelector<HTMLButtonElement>(".physicalActions > button.primary, .labelHeaderCommandBar > button.primary");
      if (!button || button.disabled) return;
      started = true;
      sessionStorage.removeItem(actionKey);
      sessionStorage.setItem("jinam:labels:direct-print-id",task.id);
      button.click();
    };
    const observer = new MutationObserver(attempt);
    if (host.current) observer.observe(host.current, {subtree:true, childList:true, attributes:true});
    const frame = requestAnimationFrame(attempt);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [task, props.businessId]);
  const orders = useCachedOrders(props.businessId);
  const sourceOrders = useMemo(() => task?.referenceOrder ? [task.referenceOrder] : task?.orderIds?.length ? task.orderIds.map(id => id === props.order?.orderId ? props.order : orders.find(source => source.orderId === id)).filter(source => !!source) : props.order ? [props.order] : [], [task,props.order,orders]);
  if (task?.orderIds?.some(id => !sourceOrders.some(source => source.orderId === id))) return <p role="status">A source order is unavailable. Refresh orders before opening this label set.</p>;
  const packingPerson = task?.purpose === "packing" && task.sourceMode === "person";
  return <div ref={host} style={{display:"contents"}}>{packingPerson && props.order ? <PackingPersonLabelDesigner {...props} order={task?.referenceOrder||props.order} sourceOrders={sourceOrders} referenceOnly={Boolean(task?.referenceOrder)}/> : <LabelDesigner {...props} sourceOrders={sourceOrders}/>}</div>;
}
