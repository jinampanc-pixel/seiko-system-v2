"use client";

import { useEffect, useState } from "react";
import { useAccess } from "./access-control";

type ConflictNotice = {
  businessId: string;
  orderId: string;
  message: string;
  recoveryKey?: string;
};

function activePrefix(businessId: string) {
  return `jinam:${businessId}:erp-conflict-active:`;
}

function findExisting(businessId: string): ConflictNotice | null {
  if (typeof window === "undefined") return null;
  const prefix = activePrefix(businessId);
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const orderId = key.slice(prefix.length);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null") as { message?: string; recoveryKey?: string } | null;
      return {
        businessId,
        orderId,
        message: saved?.message || "This order was changed by another user.",
        recoveryKey: saved?.recoveryKey,
      };
    } catch {
      return { businessId, orderId, message: "This order was changed by another user." };
    }
  }
  return null;
}

export function ErpSyncNotice() {
  const { businessId } = useAccess();
  const [conflict, setConflict] = useState<ConflictNotice | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const refresh = () => setConflict(findExisting(businessId));
    queueMicrotask(refresh);
    const onConflict = (event: Event) => {
      const detail = (event as CustomEvent<ConflictNotice>).detail;
      if (detail?.businessId === businessId) setConflict(detail);
    };
    window.addEventListener("seiko:order-sync-conflict", onConflict);
    return () => window.removeEventListener("seiko:order-sync-conflict", onConflict);
  }, [businessId]);

  if (!conflict) return null;

  const reloadLatest = () => {
    localStorage.removeItem(`jinam:${conflict.businessId}:erp-conflict-active:${conflict.orderId}`);
    window.location.reload();
  };

  return <div className="erpConflictLayer">
    <section className="erpConflictDialog" role="alertdialog" aria-modal="true" aria-labelledby="erp-conflict-title" aria-describedby="erp-conflict-message">
      <p className="eyebrow">SHARED ORDER CHANGED</p>
      <h3 id="erp-conflict-title">Reload the latest order before continuing</h3>
      <p id="erp-conflict-message">{conflict.message}</p>
      <p>Your local version has been preserved as a recovery copy. JINAM has stopped automatically sending that conflicting copy to the shared database.</p>
      <div className="erpConflictMeta"><b>Order</b><span>{conflict.orderId}</span>{conflict.recoveryKey && <><b>Recovery</b><span>Saved locally</span></>}</div>
      <button type="button" className="primary" onClick={reloadLatest}>Reload latest shared version</button>
    </section>
  </div>;
}
