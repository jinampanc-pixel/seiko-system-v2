"use client";
import { useEffect, useState, type ReactNode } from "react";
import { initializeLabelStorage, labelRecoveryCopy } from "./lib/label-storage";

export function SharedLabelStorage({ business, enabled, children }: { business: string; enabled: boolean; children: ReactNode }) {
  const [readyBusiness, setReadyBusiness] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const status = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.business === business && active) setMessage(detail.message); };
    window.addEventListener("jinam:label-storage", status);
    const initialize = () => { void initializeLabelStorage(business).catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setReadyBusiness(business); }); };
    initialize(); window.addEventListener("online", initialize);
    return () => { active = false; window.removeEventListener("online", initialize); window.removeEventListener("jinam:label-storage", status); };
  }, [business, enabled]);
  const healthy = message === "Labels loaded from shared storage." || message === "Labels saved to shared storage.";
  const pending = message === "Label changes saved on this device; shared save pending." || message.startsWith("Device storage is full. Saving labels");
  useEffect(() => {
    if (!healthy) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message, healthy]);
  const recover = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(labelRecoveryCopy(business), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${business}-label-recovery.json`; link.click(); URL.revokeObjectURL(url);
  };
  return <>{enabled && message && message !== "Labels loaded from shared storage." && <div className="labelStorageStatus" role="status" style={{ padding: "8px 16px" }}>{message} {!healthy && !pending && <><button type="button" onClick={() => void initializeLabelStorage(business).catch(error => setMessage(error.message))}>Retry label sync</button> <button type="button" onClick={recover}>Download label recovery copy</button></>}</div>}{enabled && readyBusiness !== business ? <p role="status">Loading shared label libraries…</p> : children}</>;
}
