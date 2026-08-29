import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const connectors = readFileSync(new URL("../app/lib/channel-connectors.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/channel-connection-settings.tsx", import.meta.url), "utf8");
const syncRoute = readFileSync(new URL("../app/api/erp/meth/sync/route.ts", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../app/meth-server-sync.tsx", import.meta.url), "utf8");
const meth = readFileSync(new URL("../app/meth-app.tsx", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("paste-link connector supports Shopify, WooCommerce, Amazon and generic providers", () => {
  for (const provider of ["shopify", "woocommerce", "amazon", "generic"]) assert.match(connectors, new RegExp(`${provider}:`));
  assert.match(connectors, /\.myshopify\.com/);
  assert.match(connectors, /sellercentral\.amazon/);
  assert.match(connectors, /\/wp-json\/wc\//);
  assert.match(settings, /Store \/ seller link/);
  assert.match(settings, /Detected platform/);
});

test("a pasted URL starts setup but never pretends to authorize a provider", () => {
  assert.match(connectors, /needs_authorization/);
  assert.match(connectors, /merchant authorization is still required/);
  assert.match(connectors, /Seller Central authorization is required/);
  assert.match(settings, /Authorization required/);
  assert.doesNotMatch(settings, /accessToken/);
  assert.doesNotMatch(settings, /consumerSecret/);
});

test("connector credentials are server references rather than browser secrets", () => {
  assert.match(connectors, /credentialRef\?: string/);
  assert.match(connectors, /webhookSecretRef\?: string/);
  assert.match(syncRoute, /jinam_connector_secrets/);
  assert.match(syncRoute, /ciphertext TEXT NOT NULL/);
  assert.match(settings, /never stored in browser localStorage/);
});

test("MeTh and SEIKO shared commerce records converge through D1", () => {
  assert.match(syncRoute, /jinam_shared_records/);
  assert.match(syncRoute, /SHARED = new Set<Collection>/);
  assert.match(syncRoute, /"handoffs", "intercompany-transactions", "intercompany-payments"/);
  assert.match(bridge, /12_000/);
  assert.match(meth, /<MethServerSync\/>/);
  assert.match(enhancements, /<MethServerSync \/>/);
});

test("channel event storage has an idempotent external event key", () => {
  assert.match(syncRoute, /jinam_channel_events/);
  assert.match(syncRoute, /PRIMARY KEY \(provider, connection_id, external_event_id\)/);
});

test("the connector model normalizes provider capabilities before implementation details", () => {
  for (const capability of ["orders", "products", "payments", "fulfilments", "settlements", "returns"]) assert.match(connectors, new RegExp(`"${capability}"`));
  assert.match(connectors, /interface ChannelAdapterContract/);
  assert.match(connectors, /syncFulfilment/);
  assert.match(connectors, /NormalizedChannelEvent/);
});
