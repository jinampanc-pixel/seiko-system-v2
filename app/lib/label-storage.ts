"use client";

type SharedRecord = { collection: string; id: string; value: unknown; version: number; deleted: boolean };
type Pending = { collection: string; id: string; value?: unknown; deleted: boolean; expectedVersion: number; blocked?: number };
type State = { records: Map<string, SharedRecord>; pending: Map<string, Pending>; running: boolean; ready: boolean };
const states = new Map<string, State>();
const arrays = ["tasks-v1", "templates-v1", "layouts-v2", "presets-v1"];
const token = (collection: string, id: string) => `${collection}\n${id}`;
const pendingKey = (business: string) => `jinam:${business}:labels:shared-pending-v1`;
const backupKey = (business: string) => `jinam:${business}:labels:browser-adoption-backup-v1`;
function stateFor(business: string): State {
  let state = states.get(business);
  if (!state) {
    let pending: Pending[] = []; try { pending = JSON.parse(localStorage.getItem(pendingKey(business)) || "[]"); } catch { /* Keep malformed storage available in the adoption backup. */ }
    state = { records: new Map(), pending: new Map(pending.map(item => [token(item.collection, item.id), item])), running: false, ready: false }; states.set(business, state);
  }
  return state;
}
function notify(business: string, message: string) { window.dispatchEvent(new CustomEvent("jinam:label-storage", { detail: { business, message } })); }
function persist(business: string, state: State) { localStorage.setItem(pendingKey(business), JSON.stringify([...state.pending.values()])); }
function parseKey(key: string) {
  const match = key.match(/^jinam:([^:]+):(?:labels:(tasks-v1|templates-v1|layouts-v2|presets-v1)|labels:classification:(.+)|packing-person-presentation:(.+)|packing-person-package-layout:(.+))$/);
  return match ? { business: match[1], collection: match[2] || (match[3] ? "classification" : match[4] ? "presentation" : "package-layout"), id: match[3] || match[4] || match[5] || "" } : null;
}
function cacheKey(business: string, collection: string, id: string) {
  return arrays.includes(collection) ? `jinam:${business}:labels:${collection}` : collection === "classification" ? `jinam:${business}:labels:classification:${id}` : `jinam:${business}:packing-person-${collection === "presentation" ? "presentation" : "package-layout"}:${id}`;
}
function entries(collection: string, id: string, value: unknown): Array<{ id: string; value: unknown }> {
  if (!arrays.includes(collection)) return [{ id, value }];
  if (!Array.isArray(value)) throw new Error("Label library must be an array.");
  return value.map(item => { if (!item || typeof item.id !== "string" || !item.id) throw new Error("Saved label has no ID; the original browser copy is retained."); return { id: item.id, value: item }; });
}
async function request(business: string, body: object): Promise<SharedRecord[]> {
  const response = await fetch("/api/erp/labels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: business, ...body }) });
  const result = await response.json();
  if (!response.ok || !result.ok) { const error = new Error(result.message || "Shared label storage is unavailable."); Object.assign(error, { status: response.status }); throw error; }
  return result.records;
}
function accept(state: State, records: SharedRecord[]) { state.records = new Map(records.map(record => [token(record.collection, record.id), record])); }
async function drain(business: string) {
  const state = stateFor(business); if (!state.ready || state.running) return;
  state.running = true;
  const hadPending = state.pending.size > 0;
  let conflictMessage = "";
  try {
    for (;;) {
      const item = [...state.pending.values()].find(item => !item.blocked); if (!item) break;
      const key = token(item.collection, item.id);
      try {
        accept(state, await request(business, { ...item, operation: item.deleted ? "delete" : "save" }));
        const latest = state.pending.get(key);
        if (latest === item) state.pending.delete(key);
        else if (latest) latest.expectedVersion = state.records.get(key)?.version || 0;
        persist(business, state);
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 409 || status === 403) { item.blocked = status; persist(business, state); conflictMessage = (error as Error).message; continue; }
        notify(business, (error as Error).message); return;
      }
    }
    if (hadPending) notify(business, state.pending.size ? conflictMessage || "Some label changes need review. The browser recovery copy is retained." : "Labels saved to shared storage.");
  } finally { state.running = false; }
}

/** Explicit cache writer: retain drafts durably until the server acknowledges each versioned record. */
export function writeLabelStorage(key: string, json: string) {
  const parsed = parseKey(key); if (!parsed) throw new Error("Unsupported shared label key.");
  const { business, collection, id } = parsed; const state = stateFor(business);
  const previous = localStorage.getItem(key); const value = JSON.parse(json);
  const next = entries(collection, id, value);
  const old = previous ? entries(collection, id, JSON.parse(previous)) : [];
  for (const item of next) {
    const key = token(collection, item.id); const known = state.records.get(key);
    if (JSON.stringify(known?.value) === JSON.stringify(item.value) && !known?.deleted && !state.pending.has(key)) continue;
    const pending = state.pending.get(key);
    state.pending.set(key, { collection, id: item.id, value: item.value, deleted: false, expectedVersion: pending?.expectedVersion ?? known?.version ?? 0, blocked: pending?.blocked });
  }
  for (const item of old) if (!next.some(next => next.id === item.id)) {
    const key = token(collection, item.id); const known = state.records.get(key);
    state.pending.set(key, { collection, id: item.id, deleted: true, expectedVersion: state.pending.get(key)?.expectedVersion ?? known?.version ?? 0 });
  }
  // Save the outbox before the visible cache. A quota failure must not claim a shared save.
  try { persist(business, state); localStorage.setItem(key, json); }
  catch { notify(business, "Label changes could not be retained on this device. Keep this page open and download the recovery copy."); return; }
  notify(business, "Label changes saved on this device; shared save pending."); void drain(business);
}

export function removeLabelStorage(key: string) { writeLabelStorage(key, "null"); }

export async function initializeLabelStorage(business: string) {
  const state = stateFor(business);
  for (const item of state.pending.values()) if (item.blocked === 403) item.blocked = undefined;
  const keys = Object.keys(localStorage).filter(key => parseKey(key)?.business === business);
  const original = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
  if (!localStorage.getItem(backupKey(business))) localStorage.setItem(backupKey(business), JSON.stringify(original));
  accept(state, await request(business, { operation: "list" }));
  for (const [key, pending] of state.pending) {
    const known = state.records.get(key);
    if (known && ((pending.deleted && known.deleted) || (!pending.deleted && !known.deleted && JSON.stringify(pending.value) === JSON.stringify(known.value)))) state.pending.delete(key);
  }
  persist(business, state);
  for (const key of keys) {
    const parsed = parseKey(key)!; const raw = localStorage.getItem(key); if (!raw) continue;
    for (const item of entries(parsed.collection, parsed.id, JSON.parse(raw))) {
      const recordKey = token(parsed.collection, item.id);
      if (!state.records.has(recordKey) && !state.pending.has(recordKey)) {
        try { accept(state, await request(business, { operation: "import-local", collection: parsed.collection, id: item.id, value: item.value })); }
        catch (error) {
          if ((error as { status?: number }).status !== 403) throw error;
          state.pending.set(recordKey, { collection: parsed.collection, id: item.id, value: item.value, deleted: false, expectedVersion: 0, blocked: 403 });
          persist(business, state);
          notify(business, "Some browser labels require an owner with layout permissions to migrate. The local copy is retained.");
        }
      }
    }
  }
  state.ready = true; await drain(business);
  // Remote libraries replace caches only after preserving the original browser data and outbox.
  for (const collection of arrays) {
    const records = [...state.records.values()].filter(record => record.collection === collection && !record.deleted);
    const pending = [...state.pending.values()].filter(item => item.collection === collection);
    const values = new Map(records.map(record => [record.id, record.value]));
    for (const item of pending) { if (item.deleted) values.delete(item.id); else values.set(item.id, item.value); }
    localStorage.setItem(cacheKey(business, collection, ""), JSON.stringify([...values.values()]));
  }
  for (const record of state.records.values()) if (!arrays.includes(record.collection)) {
    const pending = state.pending.get(token(record.collection, record.id));
    const key = cacheKey(business, record.collection, record.id);
    if (pending) localStorage.setItem(key, JSON.stringify(pending.value ?? null));
    else if (record.deleted) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(record.value));
  }
}

export function labelRecoveryCopy(business: string) {
  return { browserAdoption: localStorage.getItem(backupKey(business)), pending: localStorage.getItem(pendingKey(business)), unsavedChanges: [...stateFor(business).pending.values()] };
}
