"use client";
import { useState, type ComponentProps } from "react";
import { LabelDesigner } from "./label-designer";
import { PackingPersonLabelDesigner } from "./packing-person-label-designer";

// Read the saved format before either editor consumes the pending task.
export function SavedLabelWorkspace(props: ComponentProps<typeof LabelDesigner>) {
  const [packingPerson] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const id = sessionStorage.getItem(`jinam:${props.businessId}:labels:open-task`);
      const tasks = JSON.parse(localStorage.getItem(`jinam:${props.businessId}:labels:tasks-v1`) || "[]") as Array<{ id: string; orderId: string; purpose: string; sourceMode: string }>;
      const task = tasks.find(item => item.id === id && item.orderId === props.order.orderId);
      return task?.purpose === "packing" && task.sourceMode === "person";
    } catch { return false; }
  });
  return packingPerson ? <PackingPersonLabelDesigner {...props}/> : <LabelDesigner {...props}/>;
}
