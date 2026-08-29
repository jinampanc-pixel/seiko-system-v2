import { MethFulfilmentError, routeMethOrder } from "../../../../lib/server-meth-fulfilment";

export async function POST(request: Request) {
  try {
    const data = await routeMethOrder(request);
    return Response.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (cause instanceof MethFulfilmentError) {
      return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
    }
    console.error("MeTh order routing failed", cause);
    return Response.json({ ok: false, code: "METH_ORDER_ROUTING_FAILED", message: "Order could not be routed." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
