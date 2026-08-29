"use client";

import { useMemo, useState } from "react";
import {
  CHANNEL_PROVIDERS,
  detectChannelProvider,
  newConnectionFromDetection,
  nextAuthorizationStep,
  type ChannelConnection,
  type ChannelProvider,
} from "./lib/channel-connectors";

const STORE_KEY = "jinam:meth:channel-connections:v1";

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
  const detection = useMemo(() => detectChannelProvider(url), [url]);
  const provider = providerOverride || detection.provider;
  const step = detection.normalizedUrl ? nextAuthorizationStep(provider, detection.normalizedUrl) : null;

  const prepare = () => {
    if (!detection.normalizedUrl) return;
    const base = newConnectionFromDetection({ ...detection, provider });
    const existing = connections.find(item => item.provider === provider && item.storeUrl === base.storeUrl);
    const next = existing
      ? connections.map(item => item.id === existing.id ? { ...item, status: "needs_authorization" as const, updatedAt: new Date().toISOString() } : item)
      : [base, ...connections];
    setConnections(next);
    saveConnections(next);
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
    <div className="jinamDashboardList">
      {connections.map(connection => <div className="jinamDashboardRow" key={connection.id}><div><strong>{connection.label}</strong><span>{connection.storeUrl}</span></div><div><strong>{connection.status === "connected" ? "Connected" : "Authorization required"}</strong><span>{connection.capabilities.join(" · ")}</span></div></div>)}
      {!connections.length && <div className="jinamDashboardRow"><strong>No sales channel connected yet</strong><span>That is fine. When your store is ready, paste its link here and continue the guided authorization.</span></div>}
    </div>
    <p><small>Security rule: store URLs and connection metadata may be saved here, but OAuth tokens, API secrets and webhook secrets are never stored in browser localStorage. Real credentials will be accepted only by the server-side connector credential store.</small></p>
  </section>;
}
