import {
  listMethFinishedStock,
  MethFulfilmentError,
  saveMethFinishedStock,
} from "../../../../lib/server-meth-fulfilment";

export async function GET(request: Request) {
  try {
    const data = await listMethFinishedStock(request);
    return Response.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    return failure(cause);
  }
}

export async function POST(request: Request) {
  try {
    const data = await saveMethFinishedStock(request);
    return Response.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    return failure(cause);
  }
}

function failure(cause: unknown) {
  if (cause instanceof MethFulfilmentError) {
    return Response.json({ ok: false, code: cause.code, message: cause.message }, { status: cause.status, headers: { "cache-control": "no-store" } });
  }
  console.error("MeTh finished stock failed", cause);
  return Response.json({ ok: false, code: "METH_STOCK_FAILED", message: "Finished stock could not be loaded or saved." }, { status: 503, headers: { "cache-control": "no-store" } });
}
