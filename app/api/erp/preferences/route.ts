import { env } from "cloudflare:workers";
import { authenticateActor, authorizeBusiness } from "../../../lib/server-erp-auth";

type Body = { operation?: "get" | "set"; businessId?: string; key?: string; value?: unknown };
const BUSINESS_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,127}$/;

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json() as Body; } catch { return err("INVALID_JSON", "Invalid request.", 400); }
  const businessId = body.businessId?.trim() || "";
  const key = body.key?.trim() || "";
  if (!BUSINESS_ID.test(businessId) || !KEY.test(key)) return err("INVALID_REQUEST", "Business and preference key are required.", 400);
  const actor = await authenticateActor(request);
  if (!actor) return err("AUTH_REQUIRED", "Sign in is required.", 401);
  const membership = await authorizeBusiness(actor, businessId, body.operation === "set" ? "admin" : "read");
  if (!membership) return err("FORBIDDEN", "You do not have permission for this business.", 403);
  if (body.operation === "set" && membership.role !== "owner") return err("OWNER_REQUIRED", "Only the owner can manage these options.", 403);
  const db = env.DB;
  if (!db) return err("ERP_DB_NOT_CONFIGURED", "Shared ERP storage is not connected.", 503);
  if (body.operation === "get") {
    const row = await db.prepare(`SELECT value_json, version FROM erp_preferences WHERE business_id = ? AND key = ?`).bind(businessId, key).first<{ value_json: string; version: number }>();
    let value: unknown = null;
    try { value = row?.value_json ? JSON.parse(row.value_json) : null; } catch { value = null; }
    return Response.json({ ok: true, data: { value, version: Number(row?.version || 0), canManage: membership.role === "owner" } });
  }
  if (body.operation !== "set") return err("INVALID_OPERATION", "Choose a valid operation.", 400);
  const now = new Date().toISOString();
  const json = JSON.stringify(body.value ?? null);
  await db.prepare(`INSERT INTO erp_preferences (business_id,key,value_json,version,updated_at,updated_by_user_id,updated_by_email)
    VALUES (?,?,?,1,?,?,?)
    ON CONFLICT(business_id,key) DO UPDATE SET value_json=excluded.value_json,version=erp_preferences.version+1,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id,updated_by_email=excluded.updated_by_email`)
    .bind(businessId,key,json,now,actor.userId,actor.email).run();
  return Response.json({ ok: true, data: { value: body.value ?? null, canManage: true } });
}

function err(code: string, message: string, status: number) { return Response.json({ ok: false, code, message }, { status }); }
