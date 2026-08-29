"use client";

import { useEffect, useRef } from "react";
import { useAccess } from "./access-control";
import { intercompanyStoreKey, legalProfileStoreKey, methStoreKey } from "./lib/meth-commerce";

const CHANNEL_CONNECTIONS_KEY = "jinam:meth:channel-connections:v1";
const FALLBACK_RECONCILE_MS = 60_000;

type Collection = "orders" | "sku-mappings" | "rates" | "handoffs" | "settlements" | "shipments" | "returns" | "intercompany-transactions" | "intercompany-payments" | "legal-profiles" | "channel-connections";
type Entry = { key: string; collection: Collection; singleton?: boolean };
type Envelope = { id: string; record: unknown; version: number; createdAt: string; updatedAt: string; updatedBy: string };
type Change = { sequence: number; id: string; version: number; action: string; at: string; updatedBy: string; record: unknown };
type CollectionState = { byId: Map<string, Envelope>; cursor: number };
type SyncResponse = {
  ok?: boolean;
  code?: string;
  data?: {
    records?: unknown[];
    envelopes?: Envelope[];
    saved?: Envelope[];
    conflicts?: Envelope[];
    changes?: Change[];
    cursor?: number;
    hasMore?: boolean;
    authoritative?: boolean;
  };
};

type SyncMode = "bootstrap" | "push" | "pull";

export function MethServerSync() {
  const { businessId } = useAccess();
  const applying = useRef(false);
  const running = useRef(false);
  const ready = useRef(false);
  const serverState = useRef<Map<Collection, CollectionState>>(new Map());

  useEffect(() => {
    if (businessId !== "meth" && businessId !== "seiko") return;
    const activeBusiness = businessId;
    const entries = entriesFor(activeBusiness);
    ready.current = false;
    serverState.current.clear();
    let queued: SyncMode | null = null;
    let disposed = false;
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`jinam-commerce:${activeBusiness}`) : null;

    const run = async (mode: SyncMode) => {
      if (disposed) return;
      if (running.current) {
        queued = mode === "push" ? "push" : (queued || mode);
        return;
      }
      running.current = true;
      try {
        if (mode === "bootstrap") {
          let authoritative = true;
          for (const entry of entries) authoritative = await bootstrapEntry(activeBusiness, entry, applying, serverState.current) && authoritative;
          ready.current = true;
          window.dispatchEvent(new CustomEvent("jinam-sync-status", { detail: { ok: true, authoritative, businessId: activeBusiness, at: new Date().toISOString() } }));
        } else if (mode === "push") {
          if (!ready.current || applying.current) return;
          for (const entry of entries) await pushLocalChanges(activeBusiness, entry, applying, serverState.current);
          channel?.postMessage({ type: "server-change", at: Date.now() });
          window.dispatchEvent(new CustomEvent("jinam-sync-status", { detail: { ok: true, authoritative: true, businessId: activeBusiness, at: new Date().toISOString() } }));
        } else {
          if (!ready.current) return;
          for (const entry of entries) await pullServerChanges(activeBusiness, entry, applying, serverState.current);
          window.dispatchEvent(new CustomEvent("jinam-sync-status", { detail: { ok: true, authoritative: true, businessId: activeBusiness, at: new Date().toISOString() } }));
        }
      } catch (cause) {
        console.warn("Jinam commerce sync unavailable", cause);
        window.dispatchEvent(new CustomEvent("jinam-sync-status", { detail: { ok: false, authoritative: false, businessId: activeBusiness, at: new Date().toISOString() } }));
      } finally {
        running.current = false;
        const next = queued;
        queued = null;
        if (next && !disposed) void run(next);
      }
    };

    const localChange = () => { if (!applying.current) void run("push"); };
    const refresh = () => { void run("pull"); };
    const visibility = () => { if (document.visibilityState === "visible") refresh(); };
    const broadcast = () => refresh();

    window.addEventListener("jinam-data-change", localChange);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    channel?.addEventListener("message", broadcast);
    const timer = window.setInterval(refresh, FALLBACK_RECONCILE_MS);
    void run("bootstrap");

    return () => {
      disposed = true;
      ready.current = false;
      window.removeEventListener("jinam-data-change", localChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility);
      channel?.removeEventListener("message", broadcast);
      channel?.close();
      window.clearInterval(timer);
    };
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

async function bootstrapEntry(
  businessId: "meth" | "seiko",
  entry: Entry,
  applying: { current: boolean },
  states: Map<Collection, CollectionState>,
) {
  const localSafetyCopy = readLocal(entry);
  let response = await post({ operation: "list", businessId, collection: entry.collection });
  if (!response.ok) {
    if (isOptionalServerFailure(response.code)) return false;
    throw new Error(response.code || "SYNC_LIST_FAILED");
  }

  let envelopes = envelopesFrom(response);
  if (envelopes.length === 0 && localSafetyCopy.length > 0) {
    const imported = await post({ operation: "import-local", businessId, collection: entry.collection, records: localSafetyCopy });
    if (!imported.ok && !isOptionalServerFailure(imported.code)) throw new Error(imported.code || "SYNC_IMPORT_FAILED");
    if (imported.ok) {
      response = await post({ operation: "list", businessId, collection: entry.collection });
      if (!response.ok) throw new Error(response.code || "SYNC_LIST_FAILED");
      envelopes = envelopesFrom(response);
    }
  }

  const state: CollectionState = { byId: new Map(envelopes.map(envelope => [envelope.id, envelope])), cursor: Number(response.data?.cursor) || 0 };
  states.set(entry.collection, state);
  writeAuthoritative(entry, state, applying);
  return true;
}

async function pushLocalChanges(
  businessId: "meth" | "seiko",
  entry: Entry,
  applying: { current: boolean },
  states: Map<Collection, CollectionState>,
) {
  const state = states.get(entry.collection);
  if (!state) return;
  const local = readLocal(entry);
  const mutations: Array<{ record: unknown; expectedVersion: number | null }> = [];

  for (const record of local) {
    const id = idOf(entry.collection, record);
    if (!id) continue;
    const server = state.byId.get(id);
    if (!server || fingerprint(server.record) !== fingerprint(record)) {
      mutations.push({ record, expectedVersion: server ? server.version : null });
    }
  }
  if (!mutations.length) return;

  for (let offset = 0; offset < mutations.length; offset += 100) {
    const response = await post({ operation: "mutate", businessId, collection: entry.collection, mutations: mutations.slice(offset, offset + 100) });
    if (!response.ok && response.code !== "VERSION_CONFLICT" && !isOptionalServerFailure(response.code)) {
      throw new Error(response.code || "SYNC_SAVE_FAILED");
    }
    for (const envelope of [...(response.data?.saved || []), ...(response.data?.conflicts || [])]) state.byId.set(envelope.id, envelope);
    if (Number.isInteger(response.data?.cursor)) state.cursor = Number(response.data?.cursor);
  }
  writeAuthoritative(entry, state, applying);
}

async function pullServerChanges(
  businessId: "meth" | "seiko",
  entry: Entry,
  applying: { current: boolean },
  states: Map<Collection, CollectionState>,
) {
  const state = states.get(entry.collection);
  if (!state) return;
  let hasMore = true;
  let changed = false;

  while (hasMore) {
    const response = await post({ operation: "changes", businessId, collection: entry.collection, sinceSequence: state.cursor });
    if (!response.ok) {
      if (isOptionalServerFailure(response.code)) return;
      throw new Error(response.code || "SYNC_CHANGES_FAILED");
    }
    const changes = Array.isArray(response.data?.changes) ? response.data!.changes! : [];
    for (const change of changes) {
      const existing = state.byId.get(change.id);
      state.byId.set(change.id, {
        id: change.id,
        record: change.record,
        version: change.version,
        createdAt: existing?.createdAt || change.at,
        updatedAt: change.at,
        updatedBy: change.updatedBy,
      });
      changed = true;
    }
    state.cursor = Number(response.data?.cursor) || state.cursor;
    hasMore = Boolean(response.data?.hasMore);
  }
  if (changed) writeAuthoritative(entry, state, applying);
}

function writeAuthoritative(entry: Entry, state: CollectionState, applying: { current: boolean }) {
  const records = [...state.byId.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(envelope => envelope.record);
  applying.current = true;
  try {
    writeLocal(entry, records);
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("jinam-server-change", { detail: { collection: entry.collection } }));
  } finally {
    queueMicrotask(() => { applying.current = false; });
  }
}

function envelopesFrom(response: SyncResponse): Envelope[] {
  if (Array.isArray(response.data?.envelopes)) return response.data!.envelopes!;
  const now = new Date().toISOString();
  const records = Array.isArray(response.data?.records) ? response.data!.records! : [];
  return records.map(record => ({ id: idOf("orders", record), record, version: 1, createdAt: now, updatedAt: timestamp(record) || now, updatedBy: "server" })).filter(item => item.id);
}

async function post(body: Record<string, unknown>): Promise<SyncResponse> {
  const response = await fetch("/api/erp/meth/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  try { return await response.json() as SyncResponse; }
  catch { return { ok: false, code: `HTTP_${response.status}` }; }
}

function isOptionalServerFailure(code: string | undefined) {
  return code === "ERP_DB_NOT_CONFIGURED" || code === "FORBIDDEN";
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

function idOf(collection: Collection, value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (collection === "legal-profiles" && typeof record.businessId === "string") return record.businessId;
  return "";
}

function fingerprint(value: unknown) {
  try { return JSON.stringify(value); }
  catch { return ""; }
}

function timestamp(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["updatedAt", "createdAt", "placedAt", "paidAt", "settlementDate"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return "";
}
