"use client";

import { useEffect } from "react";
import { useAccess } from "./access-control";
import { normalizeProductMeasurements, type SeikoOrder } from "./lib/order-domain";

type Envelope = {
  order: SeikoOrder;
  version: number;
  updatedAt: string;
  updatedBy: string;
};

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; code: string; message: string; data?: unknown };
type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const LOCAL_POLL_MS = 1200;
const REMOTE_POLL_MS = 15000;
const RETRY_BACKOFF_MS = 60_000;

function orderKey(businessId: string) {
  return `jinam:${businessId}:orders-v1`;
}

function conflictKey(businessId: string, orderId: string) {
  return `jinam:${businessId}:erp-conflict:${orderId}:${Date.now()}`;
}

function activeConflictKey(businessId: string, orderId: string) {
  return `jinam:${businessId}:erp-conflict-active:${orderId}`;
}

function hasActiveConflict(businessId: string, orderId: string) {
  return Boolean(localStorage.getItem(activeConflictKey(businessId, orderId)));
}

function readLocalOrders(businessId: string): SeikoOrder[] {
  try {
    const value = JSON.parse(localStorage.getItem(orderKey(businessId)) || "[]");
    return Array.isArray(value) ? (value as SeikoOrder[]).map(normalizeProductMeasurements) : [];
  } catch {
    return [];
  }
}

function writeLocalOrders(businessId: string, orders: SeikoOrder[]) {
  const normalized = orders.map(normalizeProductMeasurements);
  localStorage.setItem(orderKey(businessId), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("seiko:orders-cache-updated", { detail: { businessId } }));
}

async function callOrders<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const response = await fetch("/api/erp/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return await response.json() as ApiResult<T>;
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Shared ERP storage is temporarily unreachable." };
  }
}

function timestamp(value: unknown) {
  const result = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(result) ? result : 0;
}

function stable(order: SeikoOrder) {
  return JSON.stringify(normalizeProductMeasurements(order));
}

/**
 * Keeps localStorage as an offline/cache layer while D1 is the shared source of truth.
 * Reads remain available to authorized viewers. Writes/imports are attempted only
 * when the current membership grants the corresponding order permission.
 */
export function ErpOrderSync() {
  const { businessId, membership, can } = useAccess();
  const canView = Boolean(membership?.modules.includes("orders") && can("orders.view"));
  const canCreate = can("orders.create");
  const canEdit = can("orders.edit");

  useEffect(() => {
    if (!businessId || !canView) return;

    let cancelled = false;
    const activeBusiness = businessId;
    let ready = false;
    let syncing = false;
    let retryAfter = 0;
    let localTimer = 0;
    let remoteTimer = 0;
    const versions = new Map<string, number>();
    const lastSynced = new Map<string, string>();

    const list = async () => callOrders<{ orders: Envelope[] }>({ operation: "list", businessId: activeBusiness });
    const backOff = () => { ready = false; retryAfter = Date.now() + RETRY_BACKOFF_MS; };

    const applyServer = (envelopes: Envelope[]) => {
      const normalizedEnvelopes = envelopes.map(item => ({ ...item, order: normalizeProductMeasurements(item.order) }));
      const orders = normalizedEnvelopes.map(item => item.order);
      versions.clear();
      lastSynced.clear();
      for (const item of normalizedEnvelopes) {
        versions.set(item.order.orderId, item.version);
        lastSynced.set(item.order.orderId, stable(item.order));
      }
      writeLocalOrders(activeBusiness, orders);
    };

    const preserveConflict = (order: SeikoOrder, result: ApiFailure) => {
      const at = new Date().toISOString();
      const recoveryKey = conflictKey(activeBusiness, order.orderId);
      try {
        localStorage.setItem(recoveryKey, JSON.stringify({ at, order, server: result.data || null }));
        localStorage.setItem(activeConflictKey(activeBusiness, order.orderId), JSON.stringify({ at, recoveryKey, message: result.message }));
      } catch { /* preserving the working local copy is still the priority */ }
      window.dispatchEvent(new CustomEvent("seiko:order-sync-conflict", {
        detail: { businessId: activeBusiness, orderId: order.orderId, message: result.message, recoveryKey },
      }));
    };

    const upsert = async (order: SeikoOrder, expectedVersion?: number) => {
      const normalizedOrder = normalizeProductMeasurements(order);
      const result = await callOrders<Envelope>({
        operation: "upsert",
        businessId: activeBusiness,
        order: normalizedOrder,
        expectedVersion: expectedVersion ?? null,
      });
      if (!result.ok) return result;
      const normalizedResult = { ...result, data: { ...result.data, order: normalizeProductMeasurements(result.data.order) } } as ApiSuccess<Envelope>;
      versions.set(normalizedOrder.orderId, normalizedResult.data.version);
      lastSynced.set(normalizedOrder.orderId, stable(normalizedResult.data.order));
      return normalizedResult;
    };

    const initialize = async () => {
      ready = false;
      syncing = true;
      versions.clear();
      lastSynced.clear();

      const local = readLocalOrders(activeBusiness);
      let remote = await list();
      if (cancelled) return;
      if (!remote.ok) {
        syncing = false;
        backOff();
        return;
      }

      retryAfter = 0;
      let envelopes = remote.data.orders.map(item => ({ ...item, order: normalizeProductMeasurements(item.order) }));
      const serverById = new Map(envelopes.map(item => [item.order.orderId, item]));
      const missing = local.filter(order => !serverById.has(order.orderId) && !hasActiveConflict(activeBusiness, order.orderId));

      if (missing.length && canCreate) {
        await callOrders({ operation: "import-local", businessId: activeBusiness, orders: missing.map(normalizeProductMeasurements) });
        remote = await list();
        if (remote.ok) envelopes = remote.data.orders.map(item => ({ ...item, order: normalizeProductMeasurements(item.order) }));
      }

      const refreshedById = new Map(envelopes.map(item => [item.order.orderId, item]));
      let pushedOffline = false;
      if (canEdit) {
        for (const localOrder of local) {
          if (hasActiveConflict(activeBusiness, localOrder.orderId)) continue;
          const server = refreshedById.get(localOrder.orderId);
          if (!server) continue;
          if (timestamp(localOrder.updatedAt) <= timestamp(server.updatedAt)) continue;
          if (stable(localOrder) === stable(server.order)) continue;
          const result = await upsert(localOrder, server.version);
          if (result.ok) pushedOffline = true;
          else if (result.code === "VERSION_CONFLICT") preserveConflict(localOrder, result);
        }
      }

      if (pushedOffline) {
        remote = await list();
        if (remote.ok) envelopes = remote.data.orders.map(item => ({ ...item, order: normalizeProductMeasurements(item.order) }));
      }

      if (cancelled) return;
      applyServer(envelopes);
      ready = true;
      syncing = false;
      retryAfter = 0;
      window.dispatchEvent(new CustomEvent("seiko:erp-shared-ready", { detail: { businessId: activeBusiness } }));
    };

    const pushLocalChanges = async () => {
      if (!ready || syncing) return;
      const local = readLocalOrders(activeBusiness);
      const changed = local.filter(order => !hasActiveConflict(activeBusiness, order.orderId) && lastSynced.get(order.orderId) !== stable(order));
      if (!changed.length) return;

      syncing = true;
      let localChangedByServer = false;
      const byId = new Map(local.map(order => [order.orderId, order]));

      for (const order of changed) {
        if (cancelled) break;
        const existingVersion = versions.get(order.orderId);
        const allowed = existingVersion === undefined ? canCreate : canEdit;
        if (!allowed) {
          lastSynced.set(order.orderId, stable(order));
          continue;
        }
        const result = await upsert(order, existingVersion);
        if (result.ok) {
          byId.set(order.orderId, result.data.order);
          localChangedByServer = true;
        } else if (result.code === "VERSION_CONFLICT") {
          preserveConflict(order, result);
          lastSynced.set(order.orderId, stable(order));
        } else if (["AUTH_REQUIRED", "FORBIDDEN", "ERP_DB_NOT_CONFIGURED"].includes(result.code)) {
          backOff();
          break;
        }
      }

      if (localChangedByServer) writeLocalOrders(activeBusiness, [...byId.values()]);
      syncing = false;
    };

    const pullRemoteChanges = async () => {
      if (!ready || syncing) return;
      const local = readLocalOrders(activeBusiness);
      const dirty = local.some(order => !hasActiveConflict(activeBusiness, order.orderId) && lastSynced.get(order.orderId) !== stable(order));
      if (dirty && (canCreate || canEdit)) return;

      syncing = true;
      const remote = await list();
      if (remote.ok) {
        const normalizedRemote = remote.data.orders.map(item => ({ ...item, order: normalizeProductMeasurements(item.order) }));
        const remoteFingerprint = JSON.stringify(normalizedRemote.map(item => [item.order.orderId, item.version]));
        const localFingerprint = JSON.stringify([...versions.entries()]);
        if (remoteFingerprint !== localFingerprint || local.some(order => hasActiveConflict(activeBusiness, order.orderId))) applyServer(normalizedRemote);
      } else if (["AUTH_REQUIRED", "FORBIDDEN", "ERP_DB_NOT_CONFIGURED"].includes(remote.code)) {
        backOff();
      }
      syncing = false;
    };

    const retry = () => {
      if (!ready && !syncing && Date.now() >= retryAfter) void initialize();
    };

    void initialize();
    localTimer = window.setInterval(() => {
      retry();
      void pushLocalChanges();
    }, LOCAL_POLL_MS);
    remoteTimer = window.setInterval(() => void pullRemoteChanges(), REMOTE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(localTimer);
      window.clearInterval(remoteTimer);
    };
  }, [businessId, canCreate, canEdit, canView]);

  return null;
}
