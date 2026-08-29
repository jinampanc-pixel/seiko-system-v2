export type ChannelProvider = "shopify" | "woocommerce" | "amazon" | "generic";
export type ChannelCapability = "orders" | "products" | "payments" | "fulfilments" | "settlements" | "returns";
export type ChannelConnectionStatus = "draft" | "needs_authorization" | "connected" | "error" | "disabled";

export type ChannelProviderDefinition = {
  provider: ChannelProvider;
  label: string;
  capabilities: readonly ChannelCapability[];
  authorization: "oauth" | "application_auth" | "seller_authorization" | "api_credentials";
  canDetectFromDomain: boolean;
  note: string;
};

export type ChannelDetection = {
  input: string;
  normalizedUrl: string;
  host: string;
  provider: ChannelProvider;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type ChannelConnection = {
  id: string;
  businessId: "meth";
  provider: ChannelProvider;
  label: string;
  storeUrl: string;
  externalAccountId?: string;
  status: ChannelConnectionStatus;
  capabilities: ChannelCapability[];
  credentialRef?: string;
  webhookSecretRef?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedChannelEvent = {
  id: string;
  connectionId: string;
  provider: ChannelProvider;
  externalEventId: string;
  topic: "order.created" | "order.updated" | "payment.updated" | "fulfilment.updated" | "settlement.updated" | "return.updated";
  externalResourceId: string;
  occurredAt: string;
  receivedAt: string;
  payloadFingerprint: string;
};

export interface ChannelAdapterContract {
  provider: ChannelProvider;
  capabilities: readonly ChannelCapability[];
  authorize(connection: ChannelConnection): Promise<{ authorizationUrl?: string; status: ChannelConnectionStatus }>;
  ingest(event: NormalizedChannelEvent): Promise<void>;
  syncFulfilment?(connection: ChannelConnection, externalOrderId: string, tracking: { carrier?: string; trackingNumber?: string; trackingUrl?: string }): Promise<void>;
}

export const CHANNEL_PROVIDERS: Record<ChannelProvider, ChannelProviderDefinition> = {
  shopify: {
    provider: "shopify",
    label: "Shopify",
    capabilities: ["orders", "products", "payments", "fulfilments", "settlements", "returns"],
    authorization: "oauth",
    canDetectFromDomain: true,
    note: "The store link identifies Shopify, but merchant authorization is still required before Jinam can access Admin API data.",
  },
  woocommerce: {
    provider: "woocommerce",
    label: "WooCommerce",
    capabilities: ["orders", "products", "payments", "fulfilments", "returns"],
    authorization: "application_auth",
    canDetectFromDomain: false,
    note: "Most WooCommerce stores use a custom domain. Jinam can start from the store URL, then the store owner grants API access through WooCommerce authorization.",
  },
  amazon: {
    provider: "amazon",
    label: "Amazon",
    capabilities: ["orders", "products", "payments", "fulfilments", "settlements", "returns"],
    authorization: "seller_authorization",
    canDetectFromDomain: true,
    note: "An Amazon/Seller Central link identifies the provider, but Seller Central authorization is required before SP-API data can be accessed.",
  },
  generic: {
    provider: "generic",
    label: "Other / Custom",
    capabilities: ["orders", "products", "payments", "fulfilments", "settlements", "returns"],
    authorization: "api_credentials",
    canDetectFromDomain: false,
    note: "Use this for another marketplace, custom website or REST API. Jinam keeps the same normalized order and fulfilment model behind the connector.",
  },
};

export function normalizeStoreUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function detectChannelProvider(input: string): ChannelDetection {
  const normalizedUrl = normalizeStoreUrl(input);
  if (!normalizedUrl) return { input, normalizedUrl: "", host: "", provider: "generic", confidence: "low", reason: "Enter a valid store or seller URL." };
  const url = new URL(normalizedUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();

  if (host === "admin.shopify.com" || host.endsWith(".myshopify.com") || host === "shopify.com") {
    return { input, normalizedUrl, host, provider: "shopify", confidence: "high", reason: "Shopify domain detected." };
  }
  if (/^(sellercentral\.)?amazon\./.test(host) || host.includes("sellercentral.amazon.")) {
    return { input, normalizedUrl, host, provider: "amazon", confidence: "high", reason: "Amazon or Seller Central domain detected." };
  }
  if (path.includes("/wp-admin") || path.includes("/wp-json/wc/") || path.includes("/wc-auth/")) {
    return { input, normalizedUrl, host, provider: "woocommerce", confidence: "medium", reason: "WordPress/WooCommerce path detected." };
  }
  return { input, normalizedUrl, host, provider: "generic", confidence: "low", reason: "Custom domains cannot always reveal the commerce platform from the URL alone. Choose the provider if Jinam cannot identify it automatically." };
}

export function nextAuthorizationStep(provider: ChannelProvider, storeUrl: string) {
  const definition = CHANNEL_PROVIDERS[provider];
  if (provider === "shopify") return { title: "Authorize Shopify", detail: "Install/authorize the Jinam app for this store. Jinam will then receive an access token and register order/fulfilment webhooks.", requiresExternalApproval: true };
  if (provider === "woocommerce") return { title: "Grant WooCommerce access", detail: "Jinam will open the store's WooCommerce application authorization page so the owner can grant read/write API access.", requiresExternalApproval: true };
  if (provider === "amazon") return { title: "Authorize Seller Central", detail: "Complete the Amazon Seller Central/SP-API authorization flow for the seller account. A pasted marketplace URL cannot grant API access by itself.", requiresExternalApproval: true };
  return { title: "Add API connection details", detail: `For ${new URL(storeUrl).hostname}, add the API/authentication method supplied by that sales channel. Jinam will keep the same normalized order model.`, requiresExternalApproval: true };
}

export function newConnectionFromDetection(detection: ChannelDetection): ChannelConnection {
  const now = new Date().toISOString();
  const provider = detection.provider;
  return {
    id: cryptoSafeId(`${provider}:${detection.normalizedUrl}`),
    businessId: "meth",
    provider,
    label: CHANNEL_PROVIDERS[provider].label,
    storeUrl: detection.normalizedUrl,
    status: "needs_authorization",
    capabilities: [...CHANNEL_PROVIDERS[provider].capabilities],
    createdAt: now,
    updatedAt: now,
  };
}

function cryptoSafeId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `chn_${Math.abs(hash >>> 0).toString(36).padStart(7, "0")}`;
}
