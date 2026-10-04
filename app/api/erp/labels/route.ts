import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";

type LabelRow = { collection: string; id: string; document_json: string; version: number; deleted: number; updated_at: string };
const collections = new Set(["tasks-v1", "templates-v1", "layouts-v2", "presets-v1", "presentation", "package-layout", "classification"]);
const reply = (message: string, status = 400) => Response.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply("Invalid request origin.", 403);
  try {
    const actor = await authenticateActor(request);
    if (!actor) return reply("Sign in is required.", 401);
    const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); return reply("Label record is too large.", 413); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: { operation?: string; businessId?: string; collection?: string; id?: string; value?: unknown; expectedVersion?: number };
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply("Invalid request."); }
    if (!body || !["seiko", "meth", "veyn-health"].includes(body.businessId || "")) return reply("Choose a valid business.");
    const business = body.businessId!;
    if (!await authorizePermission(actor, business, "labels.view")) return reply("You cannot view these labels.", 403);
    if (!env.DB) return reply("Label storage is unavailable.", 503);
    const db = env.DB.withSession("first-primary");
    if (body.operation !== "list") {
      if (!["import-local", "save", "delete"].includes(body.operation || "") || !collections.has(body.collection || "") || typeof body.id !== "string" || !body.id.length || body.id.length > 160) return reply("Invalid label operation.");
      const collection = body.collection!;
      const permission = ["tasks-v1", "classification", "presentation", "package-layout"].includes(collection) ? "labels.create" : collection === "presets-v1" ? "labels.manage_sizes" : "labels.manage_layouts";
      if (!await authorizePermission(actor, business, permission)) return reply("You cannot change these labels.", 403);
      if (body.operation !== "delete" && ["tasks-v1", "templates-v1", "layouts-v2", "presets-v1"].includes(collection) && (!body.value || typeof body.value !== "object" || Array.isArray(body.value) || (body.value as { id?: unknown }).id !== body.id)) return reply("Saved label ID does not match its record.");
      const now = new Date().toISOString();
      if (body.operation === "import-local") {
        if (body.value === undefined) return reply("A label record is required.");
        // First browser adoption is insert-only. Existing remote data and tombstones win.
        await db.prepare("INSERT INTO erp_label_records(business_id,collection,id,document_json,updated_at,updated_by_email) VALUES(?,?,?,?,?,?) ON CONFLICT(business_id,collection,id) DO NOTHING").bind(business, collection, body.id, JSON.stringify(body.value), now, actor.email).run();
      } else {
        if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion! < 0) return reply("Refresh labels before saving.", 409);
        if (body.operation === "save" && body.value === undefined) return reply("A label record is required.");
        const value = JSON.stringify(body.value ?? null);
        const result = body.expectedVersion === 0
          ? await db.prepare("INSERT INTO erp_label_records(business_id,collection,id,document_json,deleted,updated_at,updated_by_email) VALUES(?,?,?,?,?,?,?) ON CONFLICT(business_id,collection,id) DO NOTHING").bind(business, collection, body.id, value, body.operation === "delete" ? 1 : 0, now, actor.email).run()
          : await db.prepare("UPDATE erp_label_records SET document_json=CASE WHEN ?=1 THEN document_json ELSE ? END,deleted=?,version=version+1,updated_at=?,updated_by_email=? WHERE business_id=? AND collection=? AND id=? AND version=? AND deleted=0").bind(body.operation === "delete" ? 1 : 0, value, body.operation === "delete" ? 1 : 0, now, actor.email, business, collection, body.id, body.expectedVersion).run();
        if (!result.meta?.changes) return reply("These labels changed on another device. Your local copy is retained for recovery; refresh before saving again.", 409);
      }
    }
    const rows = await db.prepare("SELECT collection,id,document_json,version,deleted,updated_at FROM erp_label_records WHERE business_id=? ORDER BY collection,id").bind(business).all<LabelRow>();
    return Response.json({ ok: true, records: rows.results.map((row: LabelRow) => ({ collection: row.collection, id: row.id, value: JSON.parse(row.document_json), version: row.version, deleted: Boolean(row.deleted), updatedAt: row.updated_at })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return reply("Shared label storage is unreachable. Your local label data remains available.", 503); }
}
