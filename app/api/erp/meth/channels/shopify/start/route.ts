import { beginShopifyAuthorization, ShopifyConnectorError } from "../../../../../../lib/server-shopify";

type Body = { connectionId?: string };

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json() as Body; }
  catch { return fail("INVALID_JSON", "Invalid request.", 400); }
  const connectionId = body.connectionId?.trim() || "";
  if (!connectionId) return fail("SHOPIFY_CONNECTION_REQUIRED", "Prepare a Shopify sales-channel connection first.", 400);

  try {
    const result = await beginShopifyAuthorization(request, connectionId);
    return Response.json(
      { ok: true, data: { authorizationUrl: result.authorizationUrl, shop: result.shop } },
      { headers: { "set-cookie": result.setCookie, "cache-control": "no-store" } },
    );
  } catch (cause) {
    if (cause instanceof ShopifyConnectorError) return fail(cause.code, cause.message, cause.status);
    console.error("Shopify authorization start failed", cause);
    return fail("SHOPIFY_AUTH_START_FAILED", "Shopify authorization could not be started.", 503);
  }
}

function fail(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status, headers: { "cache-control": "no-store" } });
}
