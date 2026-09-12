import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission, type Actor } from "./server-erp-auth";

export type ShopifyConnectionDocument = {
  id: string;
  businessId: "meth";
  provider: "shopify";
  label: string;
  storeUrl: string;
  externalAccountId?: string;
  status: "draft" | "needs_authorization" | "connected" | "error" | "disabled";
  capabilities: string[];
  credentialRef?: string;
  webhookSecretRef?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

type ConnectionRow = { document_json: string; version: number };
type OAuthStateRow = {
  state: string;
  connection_id: string;
  shop_domain: string;
  actor_user_id: string;
  expires_at: string;
  used_at: string | null;
};
type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
};
type StoredCredential = {
  shop: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

const OAUTH_TTL_MINUTES = 10;
const SHOPIFY_STATE_COOKIE = "jinam_shopify_oauth_state";
const SHOPIFY_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const SHOPIFY_PROVIDER = "shopify";
const DEFAULT_API_VERSION = "2026-07";
const DEFAULT_WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "APP_UNINSTALLED"];

export class ShopifyConnectorError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export async function beginShopifyAuthorization(request: Request, connectionId: string) {
  const db = requireDb();
  const actor = await requireSettingsActor(request);
  await ensureShopifySchema(db);
  const connection = await loadConnection(db, connectionId);
  if (!connection || connection.document.provider !== "shopify" || connection.document.businessId !== "meth") {
    throw new ShopifyConnectorError("SHOPIFY_CONNECTION_REQUIRED", "Prepare a Shopify sales-channel connection first.", 404);
  }

  const shop = canonicalShopDomain(connection.document.storeUrl);
  if (!shop) {
    throw new ShopifyConnectorError(
      "SHOPIFY_STORE_DOMAIN_REQUIRED",
      "Use the store's *.myshopify.com address or its Shopify Admin store URL before authorizing.",
      400,
    );
  }
  const config = shopifyConfig();
  const state = randomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_TTL_MINUTES * 60_000).toISOString();
  await db.prepare(
    `INSERT INTO jinam_channel_oauth_states (state,provider,connection_id,shop_domain,actor_user_id,created_at,expires_at,used_at)
     VALUES (?,?,?,?,?,?,?,NULL)`,
  ).bind(state, SHOPIFY_PROVIDER, connectionId, shop, actor.userId, now.toISOString(), expiresAt).run();
  await db.prepare(`DELETE FROM jinam_channel_oauth_states WHERE expires_at < ? OR used_at IS NOT NULL`).bind(now.toISOString()).run();

  const callback = `${new URL(request.url).origin}/api/erp/meth/channels/shopify/callback`;
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("scope", config.scopes);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);

  return {
    authorizationUrl: authorize.toString(),
    setCookie: stateCookie(state, OAUTH_TTL_MINUTES * 60),
    shop,
  };
}

export async function finishShopifyAuthorization(request: Request) {
  const db = requireDb();
  const actor = await requireSettingsActor(request);
  await ensureShopifySchema(db);
  const config = shopifyConfig();
  const url = new URL(request.url);
  const hmac = url.searchParams.get("hmac") || "";
  if (!hmac || !await verifyOAuthHmac(url.searchParams, hmac, config.clientSecret)) {
    throw new ShopifyConnectorError("SHOPIFY_CALLBACK_HMAC_INVALID", "Shopify authorization could not be verified.", 403);
  }

  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  if (!state || !code || !SHOPIFY_DOMAIN.test(shop)) {
    throw new ShopifyConnectorError("SHOPIFY_CALLBACK_INVALID", "Shopify did not return a valid authorization response.", 400);
  }
  const cookieState = cookieValue(request.headers.get("cookie") || "", SHOPIFY_STATE_COOKIE);
  if (!cookieState || !constantTimeTextEqual(cookieState, state)) {
    throw new ShopifyConnectorError("SHOPIFY_STATE_INVALID", "The Shopify authorization session does not match this browser.", 403);
  }

  const challenge = await db.prepare(
    `SELECT state,connection_id,shop_domain,actor_user_id,expires_at,used_at
       FROM jinam_channel_oauth_states WHERE state = ? AND provider = ?`,
  ).bind(state, SHOPIFY_PROVIDER).first<OAuthStateRow>();
  if (!challenge || challenge.used_at || challenge.expires_at <= new Date().toISOString()) {
    throw new ShopifyConnectorError("SHOPIFY_STATE_EXPIRED", "The Shopify authorization session expired. Start authorization again.", 403);
  }
  if (challenge.actor_user_id !== actor.userId || challenge.shop_domain.toLowerCase() !== shop) {
    throw new ShopifyConnectorError("SHOPIFY_STATE_INVALID", "The Shopify authorization response does not match the request that started it.", 403);
  }

  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      expiring: "1",
    }),
  });
  if (!tokenResponse.ok) {
    throw new ShopifyConnectorError("SHOPIFY_TOKEN_EXCHANGE_FAILED", "Shopify authorization succeeded, but Jinam could not obtain a store access token.", 502);
  }
  const token = await tokenResponse.json() as TokenResponse;
  if (!token.access_token || !token.refresh_token || !Number(token.expires_in) || !Number(token.refresh_token_expires_in)) {
    throw new ShopifyConnectorError("SHOPIFY_TOKEN_RESPONSE_INVALID", "Shopify did not return the required expiring offline credentials.", 502);
  }

  const credentialRef = `shopify:${challenge.connection_id}`;
  const now = Date.now();
  const credential: StoredCredential = {
    shop,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    scope: token.scope || config.scopes,
    accessExpiresAt: new Date(now + Number(token.expires_in) * 1000).toISOString(),
    refreshExpiresAt: new Date(now + Number(token.refresh_token_expires_in) * 1000).toISOString(),
  };
  await storeCredential(db, credentialRef, credential, config.encryptionKey);
  await db.prepare(`UPDATE jinam_channel_oauth_states SET used_at = ? WHERE state = ? AND used_at IS NULL`).bind(new Date().toISOString(), state).run();

  const webhook = await registerConfiguredWebhooks(request, shop, credential.accessToken);
  const status: ShopifyConnectionDocument["status"] = webhook.errors.length ? "error" : "connected";
  const lastError = webhook.errors.length ? `Shopify authorized, but webhook setup needs attention: ${webhook.errors.join("; ")}` : undefined;
  await updateConnectionAfterAuthorization(db, challenge.connection_id, actor, {
    externalAccountId: shop,
    status,
    credentialRef,
    lastError,
  });

  return {
    connectionId: challenge.connection_id,
    shop,
    status,
    registeredWebhooks: webhook.registered,
    webhookErrors: webhook.errors,
    clearCookie: stateCookie("", 0),
  };
}

export async function acceptShopifyWebhook(request: Request) {
  const db = requireDb();
  await ensureShopifySchema(db);
  const config = shopifyConfig({ requireScopes: false, requireEncryption: false });
  const rawBody = await request.text();
  const suppliedHmac = request.headers.get("x-shopify-hmac-sha256") || "";
  if (!suppliedHmac || !await verifyWebhookHmac(rawBody, suppliedHmac, config.clientSecret)) {
    throw new ShopifyConnectorError("SHOPIFY_WEBHOOK_HMAC_INVALID", "Webhook signature is invalid.", 401);
  }

  const shop = (request.headers.get("x-shopify-shop-domain") || "").toLowerCase();
  const topic = (request.headers.get("x-shopify-topic") || "").toLowerCase();
  const webhookId = request.headers.get("x-shopify-webhook-id") || "";
  const eventId = request.headers.get("x-shopify-event-id") || webhookId;
  if (!SHOPIFY_DOMAIN.test(shop) || !topic || !webhookId) {
    throw new ShopifyConnectorError("SHOPIFY_WEBHOOK_INVALID", "Verified Shopify webhook is missing required delivery metadata.", 400);
  }

  const connection = await findConnectionByShop(db, shop);
  if (!connection) {
    throw new ShopifyConnectorError("SHOPIFY_CONNECTION_UNKNOWN", "No MeTh Shopify connection matches this verified store.", 404);
  }
  const duplicate = await db.prepare(
    `SELECT external_event_id FROM jinam_channel_events WHERE provider = ? AND connection_id = ? AND external_event_id = ?`,
  ).bind(SHOPIFY_PROVIDER, connection.document.id, webhookId).first<{ external_event_id: string }>();
  if (duplicate) return { duplicate: true, accepted: true, connectionId: connection.document.id, webhookId };

  const receivedAt = new Date().toISOString();
  const fingerprint = await sha256Hex(rawBody);
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO jinam_channel_events (provider,connection_id,external_event_id,topic,received_at,payload_fingerprint)
       VALUES (?,?,?,?,?,?)`,
    ).bind(SHOPIFY_PROVIDER, connection.document.id, webhookId, topic, receivedAt, fingerprint),
    db.prepare(
      `INSERT OR IGNORE INTO jinam_channel_event_inbox
       (provider,connection_id,external_event_id,external_action_id,shop_domain,topic,received_at,payload_fingerprint,payload_json,processing_status,processed_at,processing_error)
       VALUES (?,?,?,?,?,?,?,?,?,'pending',NULL,NULL)`,
    ).bind(SHOPIFY_PROVIDER, connection.document.id, webhookId, eventId, shop, topic, receivedAt, fingerprint, rawBody),
  ]);

  if (topic === "app/uninstalled") await disableUninstalledConnection(db, connection.document, connection.version);
  return { duplicate: false, accepted: true, connectionId: connection.document.id, webhookId, eventId, topic };
}

export function canonicalShopDomain(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { return ""; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (SHOPIFY_DOMAIN.test(host)) return host;
  if (host === "admin.shopify.com") {
    const match = url.pathname.match(/^\/store\/([a-z0-9][a-z0-9-]*)/i);
    if (match) return `${match[1].toLowerCase()}.myshopify.com`;
  }
  return "";
}

async function registerConfiguredWebhooks(request: Request, shop: string, accessToken: string) {
  const topics = (process.env.SHOPIFY_WEBHOOK_TOPICS || DEFAULT_WEBHOOK_TOPICS.join(","))
    .split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
  const apiVersion = (process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION).trim();
  const endpoint = `${new URL(request.url).origin}/api/erp/meth/channels/shopify/webhook`;
  const registered: string[] = [];
  const errors: string[] = [];
  const query = `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }`;

  for (const topic of topics) {
    try {
      const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-shopify-access-token": accessToken },
        body: JSON.stringify({ query, variables: { topic, webhookSubscription: { uri: endpoint } } }),
      });
      const body = await response.json() as { data?: { webhookSubscriptionCreate?: { webhookSubscription?: { id?: string }; userErrors?: Array<{ message?: string }> } }; errors?: Array<{ message?: string }> };
      const mutation = body.data?.webhookSubscriptionCreate;
      const messages = [...(body.errors || []), ...(mutation?.userErrors || [])].map(item => item.message || "Unknown Shopify error");
      if (!response.ok || messages.length || !mutation?.webhookSubscription?.id) errors.push(`${topic}: ${messages.join(", ") || `HTTP ${response.status}`}`);
      else registered.push(topic);
    } catch {
      errors.push(`${topic}: Shopify could not be reached`);
    }
  }
  return { registered, errors };
}

async function updateConnectionAfterAuthorization(
  db: NonNullable<typeof env.DB>,
  connectionId: string,
  actor: Actor,
  change: Pick<ShopifyConnectionDocument, "externalAccountId" | "status" | "credentialRef"> & { lastError?: string },
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await loadConnection(db, connectionId);
    if (!current) throw new ShopifyConnectorError("SHOPIFY_CONNECTION_REQUIRED", "The prepared Shopify connection no longer exists.", 409);
    const now = new Date().toISOString();
    const next: ShopifyConnectionDocument = {
      ...current.document,
      ...change,
      updatedAt: now,
    };
    if (!change.lastError) delete next.lastError;
    const updated = await db.prepare(
      `UPDATE jinam_shared_records
          SET document_json=?, version=?, updated_at=?, updated_by_user_id=?, updated_by_email=?
        WHERE scope='meth' AND collection='channel-connections' AND id=? AND version=?
        RETURNING version`,
    ).bind(JSON.stringify(next), current.version + 1, now, actor.userId, actor.email, connectionId, current.version).first<{ version: number }>();
    if (updated) return;
  }
  throw new ShopifyConnectorError("SHOPIFY_CONNECTION_CHANGED", "The sales-channel connection changed while authorization was completing. Review it before retrying.", 409);
}

async function disableUninstalledConnection(db: NonNullable<typeof env.DB>, document: ShopifyConnectionDocument, version: number) {
  const now = new Date().toISOString();
  const next = { ...document, status: "disabled" as const, lastError: "Shopify app was uninstalled from the store.", updatedAt: now };
  await db.prepare(
    `UPDATE jinam_shared_records SET document_json=?,version=?,updated_at=?,updated_by_user_id='shopify',updated_by_email='shopify-webhook'
      WHERE scope='meth' AND collection='channel-connections' AND id=? AND version=?`,
  ).bind(JSON.stringify(next), version + 1, now, document.id, version).run();
  if (document.credentialRef) await db.prepare(`DELETE FROM jinam_connector_secrets WHERE credential_ref=?`).bind(document.credentialRef).run();
}

async function findConnectionByShop(db: NonNullable<typeof env.DB>, shop: string) {
  const rows = await db.prepare(
    `SELECT document_json,version FROM jinam_shared_records WHERE scope='meth' AND collection='channel-connections'`,
  ).all<ConnectionRow>();
  for (const row of rows.results || []) {
    try {
      const document = JSON.parse(row.document_json) as ShopifyConnectionDocument;
      if (document.provider === "shopify" && document.externalAccountId?.toLowerCase() === shop) return { document, version: Number(row.version) || 1 };
    } catch { /* ignore malformed connection metadata */ }
  }
  return null;
}

async function loadConnection(db: NonNullable<typeof env.DB>, connectionId: string) {
  if (!connectionId || connectionId.length > 160) return null;
  const row = await db.prepare(
    `SELECT document_json,version FROM jinam_shared_records
      WHERE scope='meth' AND collection='channel-connections' AND id=?`,
  ).bind(connectionId).first<ConnectionRow>();
  if (!row) return null;
  try { return { document: JSON.parse(row.document_json) as ShopifyConnectionDocument, version: Number(row.version) || 1 }; }
  catch { return null; }
}

async function storeCredential(db: NonNullable<typeof env.DB>, credentialRef: string, credential: StoredCredential, encryptionSecret: string) {
  const encrypted = await encryptJson(credential, encryptionSecret);
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO jinam_connector_secrets (credential_ref,provider,ciphertext,iv,created_at,rotated_at)
     VALUES (?,?,?,?,?,NULL)
     ON CONFLICT(credential_ref) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,rotated_at=excluded.created_at`,
  ).bind(credentialRef, SHOPIFY_PROVIDER, encrypted.ciphertext, encrypted.iv, now).run();
}

async function requireSettingsActor(request: Request) {
  const actor = await authenticateActor(request);
  if (!actor) throw new ShopifyConnectorError("AUTH_REQUIRED", "Sign in is required.", 401);
  if (!await authorizePermission(actor, "meth", "settings.manage")) {
    throw new ShopifyConnectorError("FORBIDDEN", "You do not have permission to manage MeTh sales channels.", 403);
  }
  return actor;
}

function requireDb() {
  const db = env.DB;
  if (!db) throw new ShopifyConnectorError("ERP_DB_NOT_CONFIGURED", "Shared Jinam storage is not connected.", 503);
  return db;
}

function shopifyConfig(options: { requireScopes?: boolean; requireEncryption?: boolean } = {}) {
  const clientId = (process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  const scopes = (process.env.SHOPIFY_SCOPES || "").trim();
  const encryptionKey = (process.env.JINAM_CONNECTOR_ENCRYPTION_KEY || "").trim();
  if (!clientId || !clientSecret || (options.requireScopes !== false && !scopes) || (options.requireEncryption !== false && !encryptionKey)) {
    throw new ShopifyConnectorError(
      "SHOPIFY_NOT_CONFIGURED",
      "Shopify is prepared in Jinam, but the server-side app credentials, scopes and connector encryption key have not been configured yet.",
      503,
    );
  }
  return { clientId, clientSecret, scopes, encryptionKey };
}

async function ensureShopifySchema(db: NonNullable<typeof env.DB>) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS jinam_channel_oauth_states (
      state TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS jinam_channel_oauth_states_exp_idx ON jinam_channel_oauth_states(provider,expires_at,used_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jinam_connector_secrets (
      credential_ref TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT NOT NULL,
      rotated_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jinam_channel_events (
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_fingerprint TEXT NOT NULL,
      PRIMARY KEY (provider, connection_id, external_event_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jinam_channel_event_inbox (
      provider TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      external_action_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      topic TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_fingerprint TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      processed_at TEXT,
      processing_error TEXT,
      PRIMARY KEY (provider, connection_id, external_event_id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS jinam_channel_event_inbox_pending_idx ON jinam_channel_event_inbox(processing_status,received_at)`),
  ]);
}

async function verifyOAuthHmac(params: URLSearchParams, suppliedHex: string, secret: string) {
  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = await hmacBytes(message, secret);
  const supplied = hexBytes(suppliedHex);
  return supplied ? constantTimeBytesEqual(expected, supplied) : false;
}

async function verifyWebhookHmac(rawBody: string, suppliedBase64: string, secret: string) {
  const expected = await hmacBytes(rawBody, secret);
  let supplied: Uint8Array;
  try { supplied = new Uint8Array(Buffer.from(suppliedBase64, "base64")); }
  catch { return false; }
  return constantTimeBytesEqual(expected, supplied);
}

async function hmacBytes(message: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function encryptJson(value: unknown, secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ciphertext: Buffer.from(ciphertext).toString("base64"), iv: Buffer.from(iv).toString("base64") };
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexBytes(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function constantTimeTextEqual(a: string, b: string) {
  return constantTimeBytesEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

function randomToken(bytes: number) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(value).toString("base64url");
}

function cookieValue(header: string, name: string) {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function stateCookie(value: string, maxAge: number) {
  return `${SHOPIFY_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/erp/meth/channels/shopify; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
