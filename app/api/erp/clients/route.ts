import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { normalizeClientType, type SeikoClientRecord } from "../../../lib/seiko-clients";

type ClientRow = { data: string; archived: number };
const reply = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

function sanitizeClient(input: SeikoClientRecord, existing?: SeikoClientRecord): SeikoClientRecord {
  const now = new Date().toISOString();
  return {
    id: clean(input.id, 80), name: clean(input.name, 160), type: normalizeClientType(input.type),
    contactPerson: clean(input.contactPerson, 160), phone: clean(input.phone, 40), email: clean(input.email, 254).toLowerCase(),
    billingAddress: clean(input.billingAddress, 1000), deliveryAddress: clean(input.deliveryAddress, 1000), gstin: clean(input.gstin, 30).toUpperCase(),
    archived: Boolean(input.archived), sourceOrderIds: [...new Set([...(existing?.sourceOrderIds || []), ...(Array.isArray(input.sourceOrderIds) ? input.sourceOrderIds.map(value => clean(value, 100)).filter(Boolean) : [])])].slice(0, 500),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply("Invalid request origin.", 403);
  const actor = await authenticateActor(request);
  if (!actor) return reply("Sign in is required.", 401);
  if (!await authorizePermission(actor, "seiko", "financials.view")) return reply("You cannot view SEIKO clients.", 403);
  let body: { operation?: string; client?: SeikoClientRecord; clients?: SeikoClientRecord[] };
  try { if (Number(request.headers.get("content-length") || 0) > 512 * 1024) return reply("Client data is too large.", 413); body = await request.json(); }
  catch { return reply("Invalid request."); }
  const canManage = Boolean(await authorizePermission(actor, "seiko", "billing.invoices.manage"));
  if (body.operation !== "list" && !canManage) return reply("You cannot change SEIKO clients.", 403);
  if (!env.DB) return reply("Client database is not configured.", 503);
  const db = env.DB.withSession("first-primary");
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS seiko_clients (id TEXT PRIMARY KEY, name_key TEXT NOT NULL, phone_key TEXT NOT NULL, email_key TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS seiko_clients_lookup ON seiko_clients(name_key,phone_key,email_key)`).run();
    const inputs = body.operation === "import" ? body.clients : body.client ? [body.client] : [];
    if (!["list", "save", "import"].includes(body.operation || "")) return reply("Unknown client operation.");
    if (inputs.length > 250) return reply("Import clients in batches of 250 or fewer.");
    for (const input of inputs) {
      if (!input || !/^[a-zA-Z0-9-]{8,80}$/.test(clean(input.id, 80)) || !clean(input.name, 160) || !clean(input.phone, 40)) return reply("Each client needs a valid ID, name and phone number.");
      const nameKey = clean(input.name, 160).toLowerCase(); const phoneKey = clean(input.phone, 40).replace(/\D/g, ""); const emailKey = clean(input.email, 254).toLowerCase();
      const duplicate = await db.prepare(`SELECT data,archived FROM seiko_clients WHERE id = ? OR (phone_key <> '' AND phone_key = ?) OR (email_key <> '' AND email_key = ?) OR (name_key = ? AND phone_key = ?) LIMIT 1`).bind(input.id, phoneKey, emailKey, nameKey, phoneKey).first<ClientRow>();
      const existing = duplicate ? JSON.parse(duplicate.data) as SeikoClientRecord : undefined;
      const imported = body.operation === "import" && existing ? { ...existing, ...input, name: clean(input.name, 160) || existing.name, contactPerson: clean(input.contactPerson, 160) || existing.contactPerson, phone: clean(input.phone, 40) || existing.phone, email: clean(input.email, 254) || existing.email, billingAddress: clean(input.billingAddress, 1000) || existing.billingAddress, deliveryAddress: clean(input.deliveryAddress, 1000) || existing.deliveryAddress, gstin: clean(input.gstin, 30) || existing.gstin } : input;
      const saved = sanitizeClient({ ...imported, id: existing?.id || input.id }, existing);
      await db.prepare(`INSERT INTO seiko_clients(id,name_key,phone_key,email_key,archived,data,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,phone_key=excluded.phone_key,email_key=excluded.email_key,archived=excluded.archived,data=excluded.data,updated_by=excluded.updated_by`).bind(saved.id, saved.name.toLowerCase(), saved.phone.replace(/\D/g, ""), saved.email.toLowerCase(), saved.archived ? 1 : 0, JSON.stringify(saved), actor.email, actor.email).run();
    }
    const rows = await db.prepare("SELECT data,archived FROM seiko_clients ORDER BY archived ASC, name_key ASC").all<ClientRow>();
    return Response.json({ ok: true, clients: rows.results.map(row => ({ ...JSON.parse(row.data), archived: Boolean(row.archived) })), canManage }, { headers: { "Cache-Control": "no-store" } });
  } catch { return reply("Clients could not be saved or loaded. Retry when connected.", 503); }
}
