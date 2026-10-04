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
  const recover = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(labelRecoveryCopy(business), null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${business}-label-recovery.json`; link.click(); URL.revokeObjectURL(url);
  };
  return <>{message && <div className="labelStorageStatus" role="status" style={{ padding: "8px 16px" }}>{message} <button type="button" onClick={() => void initializeLabelStorage(business).catch(error => setMessage(error.message))}>Retry label sync</button> <button type="button" onClick={recover}>Download label recovery copy</button></div>}{enabled && readyBusiness !== business ? <p role="status">Loading shared label libraries…</p> : children}</>;
}
