import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const connectors = readFileSync(new URL("../app/lib/channel-connectors.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/channel-connection-settings.tsx", import.meta.url), "utf8");
const syncRoute = readFileSync(new URL("../app/api/erp/meth/sync/route.ts", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../app/meth-server-sync.tsx", import.meta.url), "utf8");
const shopify = readFileSync(new URL("../app/lib/server-shopify.ts", import.meta.url), "utf8");
const shopifyStart = readFileSync(new URL("../app/api/erp/meth/channels/shopify/start/route.ts", import.meta.url), "utf8");
const shopifyCallback = readFileSync(new URL("../app/api/erp/meth/channels/shopify/callback/route.ts", import.meta.url), "utf8");
const shopifyWebhook = readFileSync(new URL("../app/api/erp/meth/channels/shopify/webhook/route.ts", import.meta.url), "utf8");
const meth = readFileSync(new URL("../app/meth-app.tsx", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("paste-link connector supports Shopify, WooCommerce, Amazon and generic providers", () => {
  for (const provider of ["shopify", "woocommerce", "amazon", "generic"]) assert.match(connectors, new RegExp(`${provider}:`));
  assert.match(connectors, /\.myshopify\.com/);
  assert.match(connectors, /sellercentral\.amazon/);
  assert.match(connectors, /\/wp-json\/wc\//);
  assert.match(settings, /Store \/ seller link/);
  assert.match(settings, /Detected platform/);
  assert.match(settings, /channelConnectionForm/);
  assert.doesNotMatch(settings, /phase2EditorGrid/);
});

test("Shopify paste-link flow can start real authorization in one action", () => {
  assert.match(settings, /Connect Shopify/);
  assert.match(settings, /prepareConnection/);
  assert.match(settings, /connectCurrent/);
  assert.match(settings, /authorizeShopify\(connection\)/);
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

test("MeTh and SEIKO shared commerce records converge through authoritative D1 changes", () => {
  assert.match(syncRoute, /jinam_shared_records/);
  assert.match(syncRoute, /SHARED = new Set<Collection>/);
  assert.match(syncRoute, /"handoffs", "intercompany-transactions", "intercompany-payments"/);
  assert.match(syncRoute, /jinam_shared_changes/);
  assert.match(bridge, /operation: "changes"/);
  assert.match(bridge, /FALLBACK_RECONCILE_MS = 60_000/);
  assert.doesNotMatch(bridge, /12_000/);
  assert.match(meth, /<MethServerSync\/>/);
  assert.match(enhancements, /<MethServerSync \/>/);
});

test("channel event storage has an idempotent external event key", () => {
  assert.match(syncRoute, /jinam_channel_events/);
  assert.match(syncRoute, /PRIMARY KEY \(provider, connection_id, external_event_id\)/);
  assert.match(shopify, /x-shopify-webhook-id/);
  assert.match(shopify, /INSERT OR IGNORE INTO jinam_channel_events/);
  assert.match(shopify, /jinam_channel_event_inbox/);
});

test("the connector model normalizes provider capabilities before implementation details", () => {
  for (const capability of ["orders", "products", "payments", "fulfilments", "settlements", "returns"]) assert.match(connectors, new RegExp(`"${capability}"`));
  assert.match(connectors, /interface ChannelAdapterContract/);
  assert.match(connectors, /syncFulfilment/);
  assert.match(connectors, /NormalizedChannelEvent/);
});

test("Shopify authorization is real OAuth and remains unavailable until server credentials exist", () => {
  assert.match(settings, /Authorize Shopify/);
  assert.match(settings, /\/api\/erp\/meth\/channels\/shopify\/start/);
  assert.match(shopifyStart, /beginShopifyAuthorization/);
  assert.match(shopify, /\/admin\/oauth\/authorize/);
  assert.match(shopify, /SHOPIFY_CLIENT_ID/);
  assert.match(shopify, /SHOPIFY_CLIENT_SECRET/);
  assert.match(shopify, /SHOPIFY_SCOPES/);
  assert.match(shopify, /SHOPIFY_NOT_CONFIGURED/);
  assert.match(shopify, /expiring: "1"/);
  assert.match(shopifyCallback, /finishShopifyAuthorization/);
});

test("Shopify OAuth callback is bound to browser state and verified before token exchange", () => {
  assert.match(shopify, /SHOPIFY_STATE_COOKIE/);
  assert.match(shopify, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(shopify, /verifyOAuthHmac/);
  assert.match(shopify, /constantTimeTextEqual/);
  assert.match(shopify, /actor_user_id/);
  assert.match(shopify, /SHOPIFY_CALLBACK_HMAC_INVALID/);
});

test("Shopify access and refresh tokens are encrypted server-side and never enter browser connection data", () => {
  assert.match(shopify, /refreshToken/);
  assert.match(shopify, /JINAM_CONNECTOR_ENCRYPTION_KEY/);
  assert.match(shopify, /AES-GCM/);
  assert.match(shopify, /jinam_connector_secrets/);
  assert.doesNotMatch(settings, /refreshToken/);
  assert.doesNotMatch(settings, /accessToken/);
});

test("Shopify webhooks verify raw-body HMAC before trusting delivery metadata", () => {
  assert.match(shopifyWebhook, /acceptShopifyWebhook/);
  assert.match(shopify, /const rawBody = await request\.text\(\)/);
  assert.match(shopify, /x-shopify-hmac-sha256/);
  assert.match(shopify, /verifyWebhookHmac\(rawBody/);
  assert.match(shopify, /x-shopify-shop-domain/);
  assert.match(shopify, /x-shopify-event-id/);
});

test("Shopify webhook registration is attempted only after a real access token is returned", () => {
  assert.match(shopify, /registerConfiguredWebhooks\(request, shop, credential\.accessToken\)/);
  assert.match(shopify, /webhookSubscriptionCreate/);
  assert.match(shopify, /ORDERS_CREATE/);
  assert.match(shopify, /ORDERS_UPDATED/);
  assert.match(shopify, /APP_UNINSTALLED/);
  assert.match(shopify, /status: "disabled"/);
});
