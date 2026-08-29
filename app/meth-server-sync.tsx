"use client";

import { useEffect, useRef } from "react";
import { useAccess } from "./access-control";
import { intercompanyStoreKey, legalProfileStoreKey, methStoreKey } from "./lib/meth-commerce";

const CHANNEL_CONNECTIONS_KEY = "jinam:meth:channel-connections:v1";

type Collection = "orders" | "sku-mappings" | "rates" | "handoffs" | "settlements" | "shipments" | "returns" | "intercompany-transactions" | "intercompany-payments" | "legal-profiles" | "channel-connections";
type Entry = { key: string; collection: Collection; singleton?: boolean };

type SyncResponse = { ok?: boolean; code?: string; data?: { records?: unknown[] } };

export function MethServerSync() {
  const { businessId } = useAccess();
  const applying = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    if (businessId !== "meth" && businessId !== "seiko") return;
    const entries = entriesFor(businessId);

    const syncAll = async (direction: "both" | "push" = "both") => {
      if (running.current) return;
      running.current = true;
      try {
        for (const entry of entries) await syncEntry(businessId, entry, direction, applying);
        window.dispatchEvent(new CustomEvent("jinam-sync-status", { detail: { ok: true, businessId, at: new Date().toISOString() } }));
      } catch (cause) {
        console.warn("Jinam commerce sync unavailable", cause);
        window.dispatchEvent(new CustomEvent("jinam-sync-status", { detail: { ok: false, businessId, at: new Date().toISOString() } }));
      } finally {
        running.current = false;
      }
    };

    void syncAll("both");
    const change = () => { if (!applying.current) void syncAll("push"); };
    window.addEventListener("jinam-data-change", change);
    const timer = window.setInterval(() => { void syncAll("both"); }, 12_000);
    return () => { window.removeEventListener("jinam-data-change", change); window.clearInterval(timer); };
  }, [businessId]);

  return null;
}

function entriesFor(businessId: "meth" | "seiko"): Entry[] {
  const shared: Entry[] = [
    { key: methStoreKey("handoffs"), collection: "handoffs" },
    { key: intercompanyStoreKey("transactions"), collection: "intercompany-transactions" },
    { key: intercompanyStoreKey("payments"), collection: "intercompany-payments" },
  ];
  if (businessId === "seiko") return [...shared, { key: legalProfileStoreKey("seiko"), collection: "legal-profiles", singleton: true }];
  return [
    { key: methStoreKey("orders"), collection: "orders" },
    { key: methStoreKey("sku-mappings"), collection: "sku-mappings" },
    { key: methStoreKey("rates"), collection: "rates" },
    ...shared,
    { key: methStoreKey("settlements"), collection: "settlements" },
    { key: methStoreKey("shipments"), collection: "shipments" },
    { key: methStoreKey("returns"), collection: "returns" },
    { key: legalProfileStoreKey("meth"), collection: "legal-profiles", singleton: true },
    { key: CHANNEL_CONNECTIONS_KEY, collection: "channel-connections" },
  ];
}

async function syncEntry(businessId: "meth" | "seiko", entry: Entry, direction: "both" | "push", applying: { current: boolean }) {
  const local = readLocal(entry);
  if (direction === "push") {
    if (local.length) await push(businessId, entry.collection, local);
    return;
  }

  const response = await post({ operation: "list", businessId, collection: entry.collection });
  if (!response.ok) {
    if (response.code === "ERP_DB_NOT_CONFIGURED" || response.code === "FORBIDDEN") return;
    throw new Error(response.code || "SYNC_LIST_FAILED");
  }
  const remote = Array.isArray(response.data?.records) ? response.data!.records! : [];
  const merged = merge(local, remote);
  if (merged.length) {
    applying.current = true;
    try {
      writeLocal(entry, merged);
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("jinam-data-change"));
    } finally {
      queueMicrotask(() => { applying.current = false; });
    }
    await push(businessId, entry.collection, merged);
  }
}

async function push(businessId: "meth" | "seiko", collection: Collection, records: unknown[]) {
  const response = await post({ operation: "bulk-upsert", businessId, collection, records });
  if (!response.ok && response.code !== "ERP_DB_NOT_CONFIGURED" && response.code !== "FORBIDDEN") throw new Error(response.code || "SYNC_SAVE_FAILED");
}

async function post(body: Record<string, unknown>): Promise<SyncResponse> {
  const response = await fetch("/api/erp/meth/sync", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  try { return await response.json() as SyncResponse; }
  catch { return { ok: false, code: `HTTP_${response.status}` }; }
}

function readLocal(entry: Entry): unknown[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(entry.key) || "null");
    if (entry.singleton) return parsed && typeof parsed === "object" ? [parsed] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeLocal(entry: Entry, records: unknown[]) {
  if (entry.singleton) localStorage.setItem(entry.key, JSON.stringify(records[0] || null));
  else localStorage.setItem(entry.key, JSON.stringify(records));
}

function merge(local: unknown[], remote: unknown[]) {
  const byId = new Map<string, unknown>();
  for (const record of [...remote, ...local]) {
    const id = idOf(record);
    if (!id) continue;
    const current = byId.get(id);
    if (!current || timestamp(record) >= timestamp(current)) byId.set(id, record);
  }
  return [...byId.values()].sort((a, b) => timestamp(b).localeCompare(timestamp(a)));
}

function idOf(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (typeof record.businessId === "string") return `legal:${record.businessId}`;
  return "";
}

function timestamp(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["updatedAt", "createdAt", "placedAt", "paidAt", "settlementDate"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return "";
}
