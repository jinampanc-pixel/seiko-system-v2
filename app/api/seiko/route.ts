type ApiRequest = {
  action?: string;
  payload?: Record<string, unknown>;
};

const TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_ACTIONS = new Set([
  "labelBootstrap",
  "labelRecords",
  "recordScan",
  "traceSearch",
  "traceRecord",
  "health",
]);

export async function POST(request: Request) {
  const upstream = process.env.SEIKO_APPS_SCRIPT_URL;
  const apiKey = process.env.SEIKO_API_KEY;

  if (!upstream || !apiKey) {
    return Response.json(
      { ok: false, code: "BACKEND_NOT_CONNECTED", message: "The operational backend is not connected yet." },
      { status: 503 },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, code: "REQUEST_TOO_LARGE", message: "The request is too large." }, { status: 413 });
  }

  let body: ApiRequest;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ ok: false, code: "REQUEST_TOO_LARGE", message: "The request is too large." }, { status: 413 });
    }
    body = JSON.parse(raw) as ApiRequest;
  } catch {
    return Response.json({ ok: false, code: "INVALID_JSON", message: "Invalid request." }, { status: 400 });
  }

  if (!body.action || !/^[a-z][a-zA-Z0-9]{2,60}$/.test(body.action)) {
    return Response.json({ ok: false, code: "INVALID_ACTION", message: "Invalid operation." }, { status: 400 });
  }
  if (!ALLOWED_ACTIONS.has(body.action)) {
    return Response.json({ ok: false, code: "ACTION_NOT_ALLOWED", message: "This operation is not available." }, { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: body.action, payload: body.payload || {}, apiKey }),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { ok: false, code: "INVALID_BACKEND_RESPONSE", message: "The backend returned an invalid response." }; }
    return Response.json(data, { status: response.ok ? 200 : 502 });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json(
      { ok: false, code: timedOut ? "BACKEND_TIMEOUT" : "BACKEND_UNAVAILABLE", message: timedOut ? "The backend took too long. Please retry." : "The backend is temporarily unavailable." },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
