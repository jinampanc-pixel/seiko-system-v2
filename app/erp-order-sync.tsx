"use client";

import { useEffect } from "react";
import type { SeikoOrder } from "./lib/order-domain";

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

function readLocalOrders(businessId: string): SeikoOrder[] {
  try {
    const value = JSON.parse(localStorage.getItem(orderKey(businessId)) || "[]");
    return Array.isArray(value) ? value as SeikoOrder[] : [];
  } catch {
    return [];
  }
}

function writeLocalOrders(businessId: string, orders: SeikoOrder[]) {
  localStorage.setItem(orderKey(businessId), JSON.stringify(orders));
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
  return JSON.stringify(order);
}

/**
 * Keeps localStorage as an offline/cache layer while D1 is the shared source of truth.
 * If D1/Auth is not configured yet this component becomes a quiet no-op, so deployments
 * remain backward-compatible during the infrastructure cutover.
 */
export function ErpOrderSync() {
  useEffect(() => {
    let cancelled = false;
    let activeBusiness = "";
    let ready = false;
    let syncing = false;
    let retryAfter = 0;
    let localTimer = 0;
    let remoteTimer = 0;
    const versions = new Map<string, number>();
    const lastSynced = new Map<string, string>();

    const list = async (businessId: string) => callOrders<{ orders: Envelope[] }>({ operation: "list", businessId });
    const backOff = () => { ready = false; retryAfter = Date.now() + RETRY_BACKOFF_MS; };

    const applyServer = (businessId: string, envelopes: Envelope[]) => {
      const orders = envelopes.map(item => item.order);
      versions.clear();
      lastSynced.clear();
      for (const item of envelopes) {
        versions.set(item.order.orderId, item.version);
        lastSynced.set(item.order.orderId, stable(item.order));
      }
      writeLocalOrders(businessId, orders);
    };

    const preserveConflict = (businessId: string, order: SeikoOrder, result: ApiFailure) => {
      try {
        localStorage.setItem(conflictKey(businessId, order.orderId), JSON.stringify({ at: new Date().toISOString(), order, server: result.data || null }));
      } catch { /* preserving the working local copy is still the priority */ }
      window.dispatchEvent(new CustomEvent("seiko:order-sync-conflict", { detail: { businessId, orderId: order.orderId, message: result.message } }));
    };

    const upsert = async (businessId: string, order: SeikoOrder, expectedVersion?: number) => {
      const result = await callOrders<Envelope>({
        operation: "upsert",
        businessId,
        order,
        expectedVersion: expectedVersion ?? null,
      });
      if (!result.ok) return result;
      versions.set(order.orderId, result.data.version);
      lastSynced.set(order.orderId, stable(result.data.order));
      return result;
    };

    const initialize = async (businessId: string) => {
      ready = false;
      syncing = true;
      versions.clear();
      lastSynced.clear();

      const local = readLocalOrders(businessId);
      let remote = await list(businessId);
      if (cancelled || businessId !== activeBusiness) return;
      if (!remote.ok) {
        syncing = false;
        backOff();
        return;
      }

      retryAfter = 0;
      let envelopes = remote.data.orders;
      const serverById = new Map(envelopes.map(item => [item.order.orderId, item]));
      const missing = local.filter(order => !serverById.has(order.orderId));

      if (missing.length) {
        await callOrders({ operation: "import-local", businessId, orders: missing });
        remote = await list(businessId);
        if (remote.ok) envelopes = remote.data.orders;
      }

      const refreshedById = new Map(envelopes.map(item => [item.order.orderId, item]));
      let pushedOffline = false;
      for (const localOrder of local) {
        const server = refreshedById.get(localOrder.orderId);
        if (!server) continue;
        if (timestamp(localOrder.updatedAt) <= timestamp(server.updatedAt)) continue;
        if (stable(localOrder) === stable(server.order)) continue;
        const result = await upsert(businessId, localOrder, server.version);
        if (result.ok) pushedOffline = true;
        else if (result.code === "VERSION_CONFLICT") preserveConflict(businessId, localOrder, result);
      }

      if (pushedOffline) {
        remote = await list(businessId);
        if (remote.ok) envelopes = remote.data.orders;
      }

      if (cancelled || businessId !== activeBusiness) return;
      applyServer(businessId, envelopes);
      ready = true;
      syncing = false;
      retryAfter = 0;
      window.dispatchEvent(new CustomEvent("seiko:erp-shared-ready", { detail: { businessId } }));
    };

    const pushLocalChanges = async () => {
      if (!ready || syncing || !activeBusiness) return;
      const local = readLocalOrders(activeBusiness);
      const changed = local.filter(order => lastSynced.get(order.orderId) !== stable(order));
      if (!changed.length) return;

      syncing = true;
      let localChangedByServer = false;
      const byId = new Map(local.map(order => [order.orderId, order]));

      for (const order of changed) {
        if (cancelled) break;
        const result = await upsert(activeBusiness, order, versions.get(order.orderId));
        if (result.ok) {
          byId.set(order.orderId, result.data.order);
          localChangedByServer = true;
        } else if (result.code === "VERSION_CONFLICT") {
          preserveConflict(activeBusiness, order, result);
          lastSynced.set(order.orderId, stable(order));
        } else if (result.code === "AUTH_REQUIRED" || result.code === "ERP_DB_NOT_CONFIGURED") {
          backOff();
          break;
        }
      }

      if (localChangedByServer) writeLocalOrders(activeBusiness, [...byId.values()]);
      syncing = false;
    };

    const pullRemoteChanges = async () => {
      if (!ready || syncing || !activeBusiness) return;
      const local = readLocalOrders(activeBusiness);
      const dirty = local.some(order => lastSynced.get(order.orderId) !== stable(order));
      if (dirty) return;

      syncing = true;
      const remote = await list(activeBusiness);
      if (remote.ok) {
        const remoteFingerprint = JSON.stringify(remote.data.orders.map(item => [item.order.orderId, item.version]));
        const localFingerprint = JSON.stringify([...versions.entries()]);
        if (remoteFingerprint !== localFingerprint) applyServer(activeBusiness, remote.data.orders);
      } else if (remote.code === "AUTH_REQUIRED" || remote.code === "ERP_DB_NOT_CONFIGURED") {
        backOff();
      }
      syncing = false;
    };

    const tickBusiness = () => {
      const selected = localStorage.getItem("jinam:selected-business") || "seiko";
      if (selected !== activeBusiness) {
        activeBusiness = selected;
        retryAfter = 0;
        void initialize(selected);
      } else if (!ready && !syncing && Date.now() >= retryAfter) {
        void initialize(selected);
      }
    };

    tickBusiness();
    localTimer = window.setInterval(() => {
      tickBusiness();
      void pushLocalChanges();
    }, LOCAL_POLL_MS);
    remoteTimer = window.setInterval(() => void pullRemoteChanges(), REMOTE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(localTimer);
      window.clearInterval(remoteTimer);
    };
  }, []);

  return null;
}
