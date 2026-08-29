import { acceptShopifyWebhook, ShopifyConnectorError } from "../../../../../../lib/server-shopify";

export async function POST(request: Request) {
  try {
    const result = await acceptShopifyWebhook(request);
    return Response.json({ ok: true, data: result }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (cause instanceof ShopifyConnectorError) {
      return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
    }
    console.error("Shopify webhook failed", cause);
    return Response.json({ ok: false, code: "SHOPIFY_WEBHOOK_FAILED", message: "Webhook could not be accepted." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
