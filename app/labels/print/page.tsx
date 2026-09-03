"use client";

import { useEffect, useRef, useState } from "react";
import { LabelDesigner } from "../../label-designer";
import { PackingPersonLabelDesigner } from "../../packing-person-label-designer";
import { orderStoreKey, type SeikoOrder } from "../../lib/order-domain";

type LabelPurpose = "production" | "packing" | "inventory";
type SourceMode = "person_product" | "person" | "group" | "product" | "order";
type SavedLabelTask = {
  id: string;
  name: string;
  orderId: string;
  orderNo?: string;
  client?: string;
  purpose: LabelPurpose;
  sourceMode: SourceMode;
  selectedRows: string[];
};
type PdfRecord = { id: string; batchId: string; batchName: string; orderNo: string; client: string; labelCount: number; createdAt: string };

function taskKey(business: string) { return `jinam:${business}:labels:tasks-v1`; }
function pdfKey(business: string) { return `jinam:${business}:labels:pdf-records-v1`; }
function openTaskKey(business: string) { return `jinam:${business}:labels:open-task`; }

export default function SavedLabelPrintPage() {
  const [business, setBusiness] = useState("seiko");
  const [task, setTask] = useState<SavedLabelTask | null>(null);
  const [order, setOrder] = useState<SeikoOrder | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const printStarted = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const businessId = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
    const taskId = params.get("task") || "";
    const mode = params.get("mode") === "pdf" ? "pdf" : "print";
    setBusiness(businessId);
    try {
      const tasks = JSON.parse(localStorage.getItem(taskKey(businessId)) || "[]") as SavedLabelTask[];
      const selectedTask = tasks.find(item => item.id === taskId) || null;
      const orders = JSON.parse(localStorage.getItem(orderStoreKey(businessId)) || "[]") as SeikoOrder[];
      const selectedOrder = selectedTask ? orders.find(item => item.orderId === selectedTask.orderId) || null : null;
      if (!selectedTask || !selectedOrder) { setReady(true); return; }
      sessionStorage.removeItem(`jinam:${businessId}:labels:open-task-action`);
      sessionStorage.removeItem(`jinam:${businessId}:labels:open-task-direct-action`);
      sessionStorage.setItem(openTaskKey(businessId), selectedTask.id);
      if (mode === "pdf") {
        const records = JSON.parse(localStorage.getItem(pdfKey(businessId)) || "[]") as PdfRecord[];
        const record: PdfRecord = { id: crypto.randomUUID(), batchId: selectedTask.id, batchName: selectedTask.name || "Saved label set", orderNo: selectedTask.orderNo || "", client: selectedTask.client || "", labelCount: selectedTask.selectedRows?.length || 0, createdAt: new Date().toISOString() };
        localStorage.setItem(pdfKey(businessId), JSON.stringify([record, ...records].slice(0, 250)));
      }
      setTask(selectedTask); setOrder(selectedOrder); setReady(true);
    } catch { setReady(true); }
  }, []);

  useEffect(() => {
    if (!task || !order || printStarted.current) return;
    let timer = 0;
    const tryPrint = () => {
      if (printStarted.current) return;
      const taskStillLoading = sessionStorage.getItem(openTaskKey(business));
      const labels = document.querySelectorAll(".labelDesignerPage .printSheet .printedLabel");
      const expected = Math.max(1, task.selectedRows?.length || 0);
      const fitting = document.querySelectorAll(".labelDesignerPage .printSheet .packingFitText:not([data-fit-ready='true'])");
      if (taskStillLoading || labels.length < expected || fitting.length) return;
      printStarted.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event("jinam:labels:print"))));
      timer = window.setTimeout(() => setBlocked(true), 1300);
    };
    const observer = new MutationObserver(tryPrint);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const poll = window.setInterval(tryPrint, 80);
    tryPrint();
    const after = () => { if (timer) window.clearTimeout(timer); window.setTimeout(() => history.back(), 0); };
    window.addEventListener("afterprint", after, { once: true });
    return () => { observer.disconnect(); window.clearInterval(poll); if (timer) window.clearTimeout(timer); window.removeEventListener("afterprint", after); };
  }, [business, order, task]);

  const retry = () => {
    setBlocked(false);
    window.dispatchEvent(new Event("jinam:labels:print"));
    window.setTimeout(() => setBlocked(true), 1300);
  };

  if (!ready) return <main style={{ padding: 32 }}><b>Preparing labels for print…</b></main>;
  if (!task || !order) return <main style={{ padding: 32 }}><h1>Saved label set not found</h1><button type="button" onClick={() => history.back()}>Back to Labels</button></main>;

  const isPackingPerson = task.purpose === "packing" && task.sourceMode === "person";
  return <main className="savedLabelPrintRoute" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#f5f1eb", color: "#102d49" }}>
    <section style={{ maxWidth: 520, background: "#fff", border: "1px solid #d7e0e6", borderRadius: 14, padding: 24 }}>
      <h1 style={{ marginTop: 0, fontSize: 22 }}>Preparing system print…</h1>
      <p>{task.name || "Saved label set"} · {task.selectedRows?.length || 0} labels</p>
      {!blocked ? <p>The browser print preview should open automatically.</p> : <><p><b>The embedded browser did not open the system print dialog.</b> Click below once more. If it remains blocked, open this JINAM preview in Chrome or Edge and print there.</p><button type="button" onClick={retry}>Print now</button></>}
      <button type="button" onClick={() => history.back()} style={{ marginLeft: 10 }}>Cancel</button>
    </section>
    <div aria-hidden="true" style={{ position: "fixed", left: "-200vw", top: 0, width: "1200px", visibility: "hidden", pointerEvents: "none" }}>
      {isPackingPerson ? <PackingPersonLabelDesigner businessId={business} order={order} canManageSizes={false}/> : <LabelDesigner businessId={business} order={order} initialPurpose={task.purpose} initialSourceMode={task.sourceMode} canManageSizes={false}/>} 
    </div>
  </main>;
}
