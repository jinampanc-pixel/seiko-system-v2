"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CHANNEL_PROVIDERS,
  detectChannelProvider,
  newConnectionFromDetection,
  nextAuthorizationStep,
  type ChannelConnection,
  type ChannelProvider,
} from "./lib/channel-connectors";

const STORE_KEY = "jinam:meth:channel-connections:v1";

type Envelope = { id: string; record: ChannelConnection; version: number };
type SyncResponse = { ok?: boolean; code?: string; message?: string; data?: { envelopes?: Envelope[]; saved?: Envelope[]; conflicts?: Envelope[] } };
type ShopifyStartResponse = { ok?: boolean; code?: string; message?: string; data?: { authorizationUrl?: string; shop?: string } };

function readConnections(): ChannelConnection[] {
  try { const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function saveConnections(connections: ChannelConnection[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(connections));
  window.dispatchEvent(new Event("jinam-data-change"));
}

export function ChannelConnectionSettings() {
  const [url, setUrl] = useState("");
  const [providerOverride, setProviderOverride] = useState<ChannelProvider | "">("");
  const [connections, setConnections] = useState<ChannelConnection[]>(() => typeof window === "undefined" ? [] : readConnections());
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const detection = useMemo(() => detectChannelProvider(url), [url]);
  const provider = providerOverride || detection.provider;
  const step = detection.normalizedUrl ? nextAuthorizationStep(provider, detection.normalizedUrl) : null;

  useEffect(() => {
    const refresh = () => setConnections(readConnections());
    window.addEventListener("storage", refresh);
    window.addEventListener("jinam-server-change", refresh);
    const params = new URLSearchParams(window.location.search);
    if (params.get("channel_connected") === "shopify") setNotice("Shopify authorized and webhook setup completed.");
    else if (params.get("channel_message")) setNotice(params.get("channel_message") || "");
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("jinam-server-change", refresh);
    };
  }, []);

  const prepare = () => {
    if (!detection.normalizedUrl) return;
    const base = newConnectionFromDetection({ ...detection, provider });
    const existing = connections.find(item => item.provider === provider && item.storeUrl === base.storeUrl);
    const next = existing
      ? connections.map(item => item.id === existing.id ? { ...item, status: "needs_authorization" as const, updatedAt: new Date().toISOString() } : item)
      : [base, ...connections];
    setConnections(next);
    saveConnections(next);
    setNotice(provider === "shopify" ? "Shopify connection prepared. Authorize it when your Shopify app credentials and store are ready." : `${CHANNEL_PROVIDERS[provider].label} connection prepared. Provider authorization is still required.`);
  };

  const authorizeShopify = async (connection: ChannelConnection) => {
    setBusyId(connection.id);
    setNotice("");
    try {
      await persistConnection(connection);
      const response = await fetch("/api/erp/meth/channels/shopify/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const body = await safeJson<ShopifyStartResponse>(response);
      if (!body.ok || !body.data?.authorizationUrl) throw new Error(body.message || body.code || "Shopify authorization could not be started.");
      window.location.assign(body.data.authorizationUrl);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Shopify authorization could not be started.");
      setBusyId("");
    }
  };

  return <section className="jinamSettingsCard">
    <h2>Sales channels</h2>
    <p>Paste a store or seller link. Jinam identifies the channel where possible, then asks only for the authorization that provider actually requires.</p>
    <div className="phase2EditorGrid">
      <label>Store / seller link<input value={url} onChange={event => { setUrl(event.target.value); setProviderOverride(""); }} placeholder="https://your-store.myshopify.com"/></label>
      <label>Detected platform<select value={providerOverride || detection.provider} onChange={event => setProviderOverride(event.target.value as ChannelProvider)}><option value="shopify">Shopify</option><option value="woocommerce">WooCommerce</option><option value="amazon">Amazon</option><option value="generic">Other / Custom</option></select></label>
    </div>
    {url && <div className="jinamDashboardList">
      <div className="jinamDashboardRow"><div><strong>{detection.normalizedUrl ? CHANNEL_PROVIDERS[provider].label : "Link not recognized"}</strong><span>{detection.reason}</span></div><span>{detection.confidence} confidence</span></div>
      {step && <div className="jinamDashboardRow"><div><strong>{step.title}</strong><span>{step.detail}</span></div><button type="button" className="primary" onClick={prepare}>Prepare connection</button></div>}
    </div>}
    {notice && <p role="status">{notice}</p>}
    <div className="jinamDashboardList">
      {connections.map(connection => <div className="jinamDashboardRow" key={connection.id}>
        <div><strong>{connection.label}</strong><span>{connection.storeUrl}</span></div>
        <div>
          <strong>{connection.status === "connected" ? "Connected" : connection.status === "error" ? "Needs attention" : connection.status === "disabled" ? "Disabled" : "Authorization required"}</strong>
          <span>{connection.lastError || connection.capabilities.join(" · ")}</span>
          {connection.provider === "shopify" && connection.status !== "connected" && connection.status !== "disabled" && <button type="button" className="primary" disabled={busyId === connection.id} onClick={() => void authorizeShopify(connection)}>{busyId === connection.id ? "Starting…" : "Authorize Shopify"}</button>}
        </div>
      </div>)}
      {!connections.length && <div className="jinamDashboardRow"><strong>No sales channel connected yet</strong><span>That is fine. When your store is ready, paste its link here and continue the guided authorization.</span></div>}
    </div>
    <p><small>Security rule: store URLs and connection metadata may be cached in the browser, but OAuth tokens, refresh tokens, API secrets and webhook secrets are never stored in browser localStorage. Real credentials are accepted and encrypted only by the server-side connector credential store.</small></p>
  </section>;
}

async function persistConnection(connection: ChannelConnection) {
  const list = await syncPost({ operation: "list", businessId: "meth", collection: "channel-connections" });
  if (!list.ok) throw new Error(list.message || list.code || "Shared channel storage is unavailable.");
  const current = (list.data?.envelopes || []).find(item => item.id === connection.id);
  const now = new Date().toISOString();
  const record: ChannelConnection = current
    ? {
        ...current.record,
        provider: connection.provider,
        label: connection.label,
        storeUrl: connection.storeUrl,
        capabilities: connection.capabilities,
        status: "needs_authorization",
        updatedAt: now,
      }
    : { ...connection, status: "needs_authorization", updatedAt: now };
  const save = await syncPost({ operation: "mutate", businessId: "meth", collection: "channel-connections", mutations: [{ record, expectedVersion: current?.version ?? null }] });
  if (!save.ok) {
    const conflict = save.data?.conflicts?.find(item => item.id === connection.id);
    if (!conflict) throw new Error(save.message || save.code || "The channel connection could not be saved.");
    const retryRecord: ChannelConnection = {
      ...conflict.record,
      provider: connection.provider,
      label: connection.label,
      storeUrl: connection.storeUrl,
      capabilities: connection.capabilities,
      status: "needs_authorization",
      updatedAt: new Date().toISOString(),
    };
    const retry = await syncPost({ operation: "mutate", businessId: "meth", collection: "channel-connections", mutations: [{ record: retryRecord, expectedVersion: conflict.version }] });
    if (!retry.ok) throw new Error(retry.message || retry.code || "The channel connection changed again while preparing authorization.");
  }
}

async function syncPost(body: Record<string, unknown>) {
  const response = await fetch("/api/erp/meth/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return safeJson<SyncResponse>(response);
}

async function safeJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { return { ok: false, code: `HTTP_${response.status}`, message: "Server returned an invalid response." } as T; }
}
