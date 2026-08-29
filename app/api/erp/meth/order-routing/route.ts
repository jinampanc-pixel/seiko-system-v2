import { MethFulfilmentError, routeMethOrder } from "../../../../lib/server-meth-fulfilment";
import { ensureMethOrderHandoffsForRequest, MethHandoffError } from "../../../../lib/server-meth-handoffs";

export async function POST(request: Request) {
  try {
    const routingRequest = request.clone();
    const data = await routeMethOrder(request);
    const handoffs = await ensureMethOrderHandoffsForRequest(routingRequest, data.order.id);
    return Response.json({
      ok: true,
      data: {
        order: handoffs.order,
        createdHandoffs: handoffs.created,
        blockedHandoffs: handoffs.blocked,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    if (cause instanceof MethFulfilmentError || cause instanceof MethHandoffError) {
      return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
    }
    console.error("MeTh order routing failed", cause);
    return Response.json({ ok: false, code: "METH_ORDER_ROUTING_FAILED", message: "Order could not be routed." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
