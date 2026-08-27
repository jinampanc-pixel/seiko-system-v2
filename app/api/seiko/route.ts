import { authenticateActor, authorizePermission, getActorMemberships } from "../../lib/server-erp-auth";
import { buildFoundationBootstrap } from "../../lib/server-session";
import type { Permission } from "../../lib/access-control";

type ApiRequest = {
  action?: string;
  businessId?: string;
  payload?: Record<string, unknown>;
};

const TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_ACTIONS = new Set([
  "foundationBootstrap",
  "labelBootstrap",
  "labelRecords",
  "recordScan",
  "traceSearch",
  "traceRecord",
  "health",
]);
const BUSINESS_FREE_ACTIONS = new Set(["foundationBootstrap", "health"]);
const BUSINESS_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;
const ACTION_PERMISSION: Partial<Record<string, Permission>> = {
  labelBootstrap: "labels.view",
  labelRecords: "labels.view",
  recordScan: "scan.use",
  traceSearch: "trace.view",
  traceRecord: "trace.view",
};

export async function POST(request: Request) {
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

  if (body.action === "health") return Response.json({ ok: true, data: { status: "ok" } });

  const actor = await authenticateActor(request);
  if (!actor) {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", message: "Sign in is required." }, { status: 401 });
  }

  if (body.action === "foundationBootstrap") {
    const memberships = await getActorMemberships(actor);
    if (!memberships.length) {
      return Response.json({ ok: false, code: "NO_ACCESS", message: "Your account has not been given access to a business yet." }, { status: 403 });
    }
    return Response.json({ ok: true, data: buildFoundationBootstrap(actor, memberships) });
  }

  const businessId = body.businessId?.trim();
  if (!BUSINESS_FREE_ACTIONS.has(body.action) && (!businessId || !BUSINESS_ID.test(businessId))) {
    return Response.json({ ok: false, code: "BUSINESS_REQUIRED", message: "Select a valid business." }, { status: 400 });
  }

  const requiredPermission = ACTION_PERMISSION[body.action];
  if (businessId && requiredPermission && !await authorizePermission(actor, businessId, requiredPermission)) {
    return Response.json({ ok: false, code: "FORBIDDEN", message: "You do not have permission to perform this operation." }, { status: 403 });
  }

  const upstream = process.env.SEIKO_APPS_SCRIPT_URL;
  const apiKey = process.env.SEIKO_API_KEY;
  if (!upstream || !apiKey) {
    return Response.json(
      { ok: false, code: "BACKEND_NOT_CONNECTED", message: "The operational backend is not connected yet." },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: body.action,
        businessId: businessId || null,
        payload: { ...(body.payload || {}), businessId: businessId || null },
        actor: { userId: actor.userId, email: actor.email },
        apiKey,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { data = { ok: false, code: "INVALID_BACKEND_RESPONSE", message: "The backend returned an invalid response." }; }
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
