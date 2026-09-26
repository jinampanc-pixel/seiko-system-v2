import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { documentTotals, roundMoney, validBillingDate, validateBillingDocument, type SeikoCommercialDocument, type SeikoPaymentRecord } from "../../../lib/seiko-billing";

type DocumentRow = { sequence: number; id: string; data: string; cancelled: number };
type PaymentRow = { sequence: number; id: string; data: string };
const reply = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
const numbered = (prefix: string, date: string, sequence: number) => `${prefix}-${date.slice(0, 4)}-${String(sequence).padStart(5, "0")}`;
function documentFromRow(row: DocumentRow): SeikoCommercialDocument {
  const value = JSON.parse(row.data) as SeikoCommercialDocument;
  return { ...value, number: numbered(value.kind === "invoice" ? "INV" : value.kind === "quotation" ? "QTN" : "DC", value.issueDate, row.sequence), status: row.cancelled ? "cancelled" : "issued" };
}
function paymentFromRow(row: PaymentRow): SeikoPaymentRecord {
  const value = JSON.parse(row.data) as SeikoPaymentRecord;
  return { ...value, receiptNumber: numbered("RCP", value.date, row.sequence) };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply("Invalid request origin.", 403);
  const actor = await authenticateActor(request);
  if (!actor) return reply("Sign in is required.", 401);
  if (!await authorizePermission(actor, "seiko", "financials.view")) return reply("You cannot view SEIKO billing.", 403);
  // Bound the streamed body before decoding it, including requests without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 256 * 1024) { await reader.cancel(); return reply("Document is too large.", 413); } chunks.push(part.value); } }
  let body: { operation?: string; document?: SeikoCommercialDocument; payment?: SeikoPaymentRecord };
  try { const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; } body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return reply("Invalid request."); }
  if (!body || typeof body !== "object") return reply("Invalid request.");
  const canManage = Boolean(await authorizePermission(actor, "seiko", "billing.invoices.manage"));
  if (body.operation !== "list" && !canManage) return reply("You cannot change SEIKO billing.", 403);
  if (!env.DB) return reply("Billing database is not configured.", 503);
  const db = env.DB.withSession("first-primary");
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS seiko_billing_documents (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, total_paise INTEGER NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS seiko_billing_payments (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, invoice_id TEXT NOT NULL, amount_paise INTEGER NOT NULL, data TEXT NOT NULL, created_by TEXT NOT NULL)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS seiko_billing_payment_invoice ON seiko_billing_payments(invoice_id)`).run();
    if (body.operation === "create") {
      const draft = body.document;
      if (!draft || typeof draft.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(draft.id)) return reply("Invalid document ID.");
      const problem = validateBillingDocument(draft); if (problem) return reply(problem);
      const now = new Date().toISOString();
      const saved = { ...draft, number: "", status: "issued", createdAt: now, updatedAt: now };
      await db.prepare(`INSERT INTO seiko_billing_documents(id,data,total_paise,created_by) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(draft.id, JSON.stringify(saved), Math.round(documentTotals(draft).total * 100), actor.email).run();
    } else if (body.operation === "payment") {
      const payment = body.payment;
      if (!payment || typeof payment.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(payment.id) || typeof payment.invoiceId !== "string") return reply("Invalid payment.");
      if (!Number.isFinite(payment.amount) || payment.amount <= 0 || roundMoney(payment.amount) !== payment.amount || !validBillingDate(payment.date) || !payment.mode?.trim()) return reply("Enter a positive amount with at most two decimal places, a valid date and payment mode.");
      const row = await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE id = ?").bind(payment.invoiceId).first<DocumentRow>();
      if (!row) return reply("Invoice was not found.", 404);
      const invoice = documentFromRow(row);
      if (invoice.kind !== "invoice" || row.cancelled || payment.date < invoice.issueDate) return reply("Choose an active invoice and a payment date on or after its issue date.");
      const saved = { ...payment, orderId: invoice.orderId, receiptNumber: "", createdAt: new Date().toISOString() };
      const paise = Math.round(payment.amount * 100);
      // The balance check and insert are one SQLite statement: concurrent payments cannot overpay.
      await db.prepare(`INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by)
        SELECT ?,id,?,?,? FROM seiko_billing_documents WHERE id = ? AND cancelled = 0
        AND total_paise - COALESCE((SELECT SUM(amount_paise) FROM seiko_billing_payments WHERE invoice_id = ?),0) >= ?
        ON CONFLICT(id) DO NOTHING`).bind(payment.id, paise, JSON.stringify(saved), actor.email, invoice.id, invoice.id, paise).run();
      const recorded = await db.prepare("SELECT id FROM seiko_billing_payments WHERE id = ? AND invoice_id = ?").bind(payment.id, invoice.id).first();
      if (!recorded) return reply("Payment exceeds the current outstanding balance. Refresh and check the amount.", 409);
    } else if (body.operation !== "list") return reply("Unknown billing operation.");
    const docs = await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents ORDER BY sequence DESC").all<DocumentRow>();
    const payments = await db.prepare("SELECT sequence,id,data FROM seiko_billing_payments ORDER BY sequence DESC").all<PaymentRow>();
    return Response.json({ ok: true, documents: docs.results.map(documentFromRow), payments: payments.results.map(paymentFromRow), canManage }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return reply("Billing could not be saved or loaded. Your form is still available; retry when connected.", 503);
  }
}
