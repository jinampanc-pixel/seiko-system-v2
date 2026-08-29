import { acceptShopifyWebhook, ShopifyConnectorError } from "../../../../../../lib/server-shopify";
import {
  ingestShopifyOrderWebhook,
  markShopifyOrderWebhookFailed,
  MethFulfilmentError,
} from "../../../../../../lib/server-meth-fulfilment";

export async function POST(request: Request) {
  const processingRequest = request.clone();
  try {
    const result = await acceptShopifyWebhook(request);
    let processing: { status: "duplicate" | "staged" | "processed" | "failed"; orderId?: string; message?: string } = {
      status: result.duplicate ? "duplicate" : "staged",
    };

    if (!result.duplicate && (result.topic === "orders/create" || result.topic === "orders/updated")) {
      const rawBody = await processingRequest.text();
      try {
        const ingested = await ingestShopifyOrderWebhook({
          webhookId: result.webhookId,
          eventId: result.eventId,
          topic: result.topic,
          rawBody,
        });
        processing = { status: ingested.processed ? "processed" : "staged", orderId: ingested.orderId };
      } catch (cause) {
        await markShopifyOrderWebhookFailed(result.webhookId, cause);
        const message = cause instanceof MethFulfilmentError ? cause.message : "Verified Shopify order was staged but could not yet be normalized.";
        processing = { status: "failed", message };
        console.error("Shopify order ingestion failed after webhook acceptance", cause);
      }
    }

    return Response.json({ ok: true, data: { ...result, processing } }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (cause instanceof ShopifyConnectorError) {
      return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
    }
    console.error("Shopify webhook failed", cause);
    return Response.json({ ok: false, code: "SHOPIFY_WEBHOOK_FAILED", message: "Webhook could not be accepted." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
