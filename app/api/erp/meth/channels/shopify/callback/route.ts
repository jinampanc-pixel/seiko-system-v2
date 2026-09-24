import { finishShopifyAuthorization, ShopifyConnectorError } from "../../../../../../lib/server-shopify";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) return redirect(request, "SHOPIFY_CANCELLED", "Shopify authorization was cancelled.", clearStateCookie());

  try {
    const result = await finishShopifyAuthorization(request);
    if (result.status === "connected") {
      return redirect(request, "", "", result.clearCookie, { channel_connected: "shopify" });
    }
    return redirect(
      request,
      "SHOPIFY_WEBHOOK_SETUP_FAILED",
      result.webhookErrors.join("; ") || "Shopify was authorized, but webhook setup needs attention.",
      result.clearCookie,
    );
  } catch (cause) {
    if (cause instanceof ShopifyConnectorError) return redirect(request, cause.code, cause.message, clearStateCookie());
    console.error("Shopify authorization callback failed", cause);
    return redirect(request, "SHOPIFY_CALLBACK_FAILED", "Shopify authorization could not be completed.", clearStateCookie());
  }
}

function redirect(request: Request, code: string, message: string, cookie: string, extra?: Record<string, string>) {
  const location = new URL("/", request.url);
  location.searchParams.set("business", "meth");
  if (code) location.searchParams.set("channel_error", code);
  if (message) location.searchParams.set("channel_message", message);
  for (const [key, value] of Object.entries(extra || {})) location.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: { location: location.toString(), "set-cookie": cookie, "cache-control": "no-store" },
  });
}

function clearStateCookie() {
  return "jinam_shopify_oauth_state=; Path=/api/erp/meth/channels/shopify; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
