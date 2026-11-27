import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { billingToday, storedBillingIntegrityIssues, allocateOrderPayments, refundablePaymentAmount, invoiceOutstanding, documentTotals, roundMoney, validBillingDate, validateBillingDocument, type SeikoCommercialDocument, type SeikoPaymentRecord } from "../../../lib/seiko-billing";
import { billingSnapshotError, type BillingProfile } from "../../../lib/billing-profile";

type DocumentRow = { sequence: number; id: string; data: string; cancelled: number };
type PaymentRow = { sequence: number; id: string; data: string };
type ClientRow = { data: string; archived: number };
const reply = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
const numbered = (prefix: string, date: string, sequence: number) => `${prefix}-${date.slice(0, 4)}-${String(sequence).padStart(5, "0")}`;
function documentFromRow(row: DocumentRow): SeikoCommercialDocument {
  const value = JSON.parse(row.data) as SeikoCommercialDocument;
  return { ...value, number: value.number || numbered(value.kind === "invoice" ? "INV" : value.kind === "quotation" ? "QTN" : "DC", value.issueDate, row.sequence), status: row.cancelled ? "cancelled" : "issued" };
}
function paymentFromRow(row: PaymentRow): SeikoPaymentRecord {
  const value = JSON.parse(row.data) as SeikoPaymentRecord;
  return { ...value, receiptNumber: value.receiptNumber || numbered(value.refundOf?"RFD":"RCP", value.date, row.sequence) };
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
  if (reader) { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 1024 * 1024) { await reader.cancel(); return reply("Document is too large.", 413); } chunks.push(part.value); } }
  let body: { requestedBy?:string; operation?: string; id?: string; orderId?: string; taxMode?: "gst" | "non_gst"; document?: SeikoCommercialDocument; payment?: SeikoPaymentRecord; invoiceId?:string; expectedRevision?:number; expectedUpdatedAt?:string };
  try { const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; } body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return reply("Invalid request."); }
  if (!body || typeof body !== "object") return reply("Invalid request.");
  if(body.requestedBy&&body.requestedBy!==actor.email)return reply("This pending document belongs to another signed-in user.",403);
  if (body.orderId !== undefined && (typeof body.orderId !== "string" || !body.orderId.trim() || body.orderId.length > 200)) return reply("Invalid order filter.");
  if (body.taxMode !== undefined && !["gst", "non_gst"].includes(body.taxMode)) return reply("Choose a valid tax register.");
  const membership = await authorizePermission(actor, "seiko", "billing.invoices.manage");
  const canManage = Boolean(membership);
  const quotationMembership=await authorizePermission(actor,"seiko","billing.quotations.manage");
  const challanMembership=await authorizePermission(actor,"seiko","billing.delivery_challans.manage");
  const canManageQuotations=Boolean(quotationMembership);
  const canManageChallans=Boolean(challanMembership);
  const canManageDocument=(kind:string)=>kind==="invoice"?canManage:kind==="quotation"?canManageQuotations:kind==="delivery_challan"?canManageChallans:false;
  const canAmendReceipts = Boolean(await authorizePermission(actor,"seiko","billing.receipts.amend"));
  const canRefund=Boolean(await authorizePermission(actor,"seiko","billing.refunds.manage"));
  const canArchive=Boolean(await authorizePermission(actor,"seiko","billing.documents.archive"));
  const canDelete=Boolean(await authorizePermission(actor,"seiko","billing.documents.delete"));
  const lifecycle=["archive","restore","delete","recover"].includes(body.operation||"");
  if (lifecycle ? (["archive","restore"].includes(body.operation!) ? !canArchive : !canDelete) : body.operation === "refund" ? !canRefund : body.operation === "amend_payment" ? !canAmendReceipts : ["create","amend"].includes(body.operation||"") ? !(canManage||canManageQuotations||canManageChallans) : body.operation !== "list" && !canManage) return reply("You do not have permission for this billing action.", 403);
  if (!env.DB) return reply("Billing database is not configured.", 503);
  const db = env.DB.withSession("first-primary");
  // Capture before reading balances, then compare again in the write statement.
  // An advance, receipt amendment or invoice edit invalidates a stale balance.
  const paymentStampSql="COALESCE((SELECT group_concat(id || ':' || data, '|') FROM (SELECT id,data FROM seiko_billing_payments ORDER BY id)),'')";
  const documentStampSql="COALESCE((SELECT group_concat(id || ':' || data || ':' || cancelled, '|') FROM (SELECT id,data,cancelled FROM seiko_billing_documents ORDER BY id)),'')";
  const paymentBalance = async (invoiceId:string, omitPaymentId="") => {
    const stamp=await db.prepare("SELECT "+paymentStampSql+" AS payments, "+documentStampSql+" AS documents").first<{payments:string;documents:string}>();
    const docs=await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents").all<DocumentRow>();
    const receipts=await db.prepare("SELECT sequence,id,data FROM seiko_billing_payments").all<PaymentRow>();
    const decodedDocs:SeikoCommercialDocument[]=docs.results.map(documentFromRow);
    const invoice=decodedDocs.find(d=>d.id===invoiceId);
    const allocated=allocateOrderPayments(decodedDocs,receipts.results.filter((p:PaymentRow)=>p.id!==omitPaymentId).map(paymentFromRow));
    return {stamp,invoice,outstanding:invoice?invoiceOutstanding(invoice,allocated):0};
  };
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS erp_preferences (business_id TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by_user_id TEXT NOT NULL,updated_by_email TEXT NOT NULL, UNIQUE(business_id,key))").run();
    const profileRow = await db.prepare("SELECT value_json AS data FROM erp_preferences WHERE business_id='seiko' AND key='billing.profile.v1'").first<{data:string}>();
    const profile: BillingProfile | null = profileRow ? JSON.parse(profileRow.data) : null;
    const billingMembership=membership||quotationMembership||challanMembership;
    const canConfigure = billingMembership?.role === "owner" || Boolean(profile?.managerEmails.includes(actor.email.toLowerCase()));
    const snapshotError = (doc:SeikoCommercialDocument, original?:SeikoCommercialDocument) => billingSnapshotError(doc,profile,billingMembership?.role==="owner",canConfigure,actor.email,original);
    await db.prepare(`CREATE TABLE IF NOT EXISTS seiko_billing_documents (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, total_paise INTEGER NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS seiko_billing_payments (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, invoice_id TEXT NOT NULL, amount_paise INTEGER NOT NULL, data TEXT NOT NULL, created_by TEXT NOT NULL)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS seiko_clients (id TEXT PRIMARY KEY, name_key TEXT NOT NULL, phone_key TEXT NOT NULL, email_key TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_by TEXT NOT NULL, updated_by TEXT NOT NULL)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS seiko_billing_payment_invoice ON seiko_billing_payments(invoice_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS seiko_billing_document_order ON seiko_billing_documents(json_extract(data, '$.orderId'))`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS seiko_billing_payment_order ON seiko_billing_payments(json_extract(data, '$.orderId'))`).run();
    const ledgerSnapshot=await db.prepare("SELECT 'document' AS row_kind,sequence,id,data,cancelled,total_paise,0 AS amount_paise FROM seiko_billing_documents UNION ALL SELECT 'payment',sequence,id,data,0,0,amount_paise FROM seiko_billing_payments").all<DocumentRow&{row_kind:string;total_paise:number;amount_paise:number}>();
    const storedDocs={results:ledgerSnapshot.results.filter((r:{row_kind:string})=>r.row_kind==="document")},storedPayments={results:ledgerSnapshot.results.filter((r:{row_kind:string})=>r.row_kind==="payment")};
    if(storedBillingIntegrityIssues(storedDocs.results,storedPayments.results).length)return reply("Financial records failed an integrity check. No new financial changes were saved. Review or recover the affected records before continuing.",409);
    const respondLedger=async()=>{
      const snapshot=body.operation==="list"?ledgerSnapshot:await db.prepare("SELECT 'document' AS row_kind,sequence,id,data,cancelled,total_paise,0 AS amount_paise FROM seiko_billing_documents UNION ALL SELECT 'payment',sequence,id,data,0,0,amount_paise FROM seiko_billing_payments").all<DocumentRow&{row_kind:string;total_paise:number;amount_paise:number}>();
      const docs=snapshot.results.filter((r:{row_kind:string})=>r.row_kind==="document"),receipts=snapshot.results.filter((r:{row_kind:string})=>r.row_kind==="payment");
      if(storedBillingIntegrityIssues(docs,receipts).length)return reply("Financial records changed or failed integrity verification. Refresh before continuing; the submitted action may already be recorded under its existing reference.",409);
      const documents:SeikoCommercialDocument[]=docs.map(documentFromRow),payments=allocateOrderPayments(documents,receipts.map(paymentFromRow));
      const invoiceOrders=new Map(documents.map(d=>[d.id,d.orderId]));
      const orderFilter=body.operation==="list"?body.orderId:undefined,taxFilter=body.operation==="list"?body.taxMode:undefined;
      return Response.json({ok:true,documents:documents.filter(d=>(!orderFilter||d.orderId===orderFilter)&&(!taxFilter||d.taxMode===taxFilter)),payments:payments.filter(p=>!orderFilter||p.orderId===orderFilter||invoiceOrders.get(p.invoiceId)===orderFilter),canManage,canManageQuotations,canManageChallans,canAmendReceipts,canRefund,canArchive,canDelete},{headers:{"Cache-Control":"no-store"}});
    };
    if (lifecycle) {
      if(typeof body.id!=="string"||!body.id||body.id.length>200)return reply("Choose a document.");
      const row=await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE id=?").bind(body.id).first<DocumentRow>();
      if(!row)return reply("Document not found.",404);
      const original=JSON.parse(row.data) as SeikoCommercialDocument;
      if(body.operation==="recover" ? !original.deletedAt : Boolean(original.deletedAt))return reply("Refresh the document list before continuing.",409);
      if(body.operation==="delete"){
        if(row.cancelled)return reply("Cancelled documents can be archived; their cancellation history must be preserved.",409);
        const linked=await db.prepare("SELECT id FROM seiko_billing_payments WHERE invoice_id=? OR (?='invoice' AND json_extract(data,'$.orderId')=? AND ?<>'') LIMIT 1").bind(row.id,original.kind,original.orderId||"",original.orderId||"").first();
        if(linked)return reply("This document is linked to payments or an order advance. Archive it to preserve its financial history.",409);
      }
      const now=new Date().toISOString();
      const saved={...original,updatedAt:now,archivedAt:body.operation==="archive"?now:body.operation==="restore"?undefined:original.archivedAt,deletedAt:body.operation==="delete"?now:undefined};
      const json=JSON.stringify(saved), cancelled=body.operation==="delete"?1:body.operation==="recover"?0:row.cancelled;
      const updated=await db.batch([
        db.prepare("UPDATE seiko_billing_documents SET data=?,cancelled=? WHERE id=? AND data=? AND (?<>'delete' OR NOT EXISTS(SELECT 1 FROM seiko_billing_payments WHERE invoice_id=? OR (?='invoice' AND json_extract(data,'$.orderId')=? AND ?<>'')))").bind(json,cancelled,row.id,row.data,body.operation,row.id,original.kind,original.orderId||"",original.orderId||""),
        db.prepare("INSERT INTO erp_audit_events(id,business_id,entity_type,entity_id,action,version,actor_user_id,actor_email,at,snapshot_json) SELECT ?,'seiko','billing-document',?,?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM seiko_billing_documents WHERE id=? AND data=?)").bind(crypto.randomUUID(),row.id,body.operation,actor.userId,actor.email,now,JSON.stringify({before:original,after:saved}),row.id,json),
      ]);
      if(!updated[0].meta.changes)return reply("Document or payments changed. Refresh before trying again.",409);
    } else if (body.operation === "create") {
      const draft = body.document;
      if (!draft || typeof draft.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(draft.id)) return reply("Invalid document ID.");
      if(!canManageDocument(draft.kind))return reply("You do not have permission to create this document type.",403);
      const creationFingerprint=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(draft))))).map(n=>n.toString(16).padStart(2,"0")).join("");
      const previous=storedDocs.results.find((r:DocumentRow)=>r.id===draft.id);
      if(previous){if(previous.cancelled||JSON.parse(previous.data).creationFingerprint!==creationFingerprint)return reply("This document reference was already saved with different details. Reload before making a correction.",409);return await respondLedger();}
      if(draft.credits?.length||draft.pricingSnapshot||draft.supplementaryFor)return reply("Use the reviewed order billing workflow for linked invoices and credits.");
      if(draft.orderId&&draft.kind==="invoice"){const pricing=await db.prepare("SELECT json_extract(document_json,'$.commerce.quantityBasis') AS basis,json_array_length(json_extract(document_json,'$.commerce.rules')) AS count FROM erp_orders WHERE id=? AND business_id='seiko'").bind(draft.orderId).first<{basis:string;count:number}>();if(pricing?.basis==="ordered"&&!pricing.count)return reply("Set the agreed order pricing before issuing this order's invoice.",409);}
      if(draft.orderId&&draft.kind==="invoice"){const sheetSource=await db.prepare("SELECT json_extract(document_json,'$.googleSheet.id') AS id FROM erp_orders WHERE id=? AND business_id='seiko'").bind(draft.orderId).first<{id:string}>();if(sheetSource?.id)return reply("Set the order pricing and use Billing review to issue an invoice from validated Google Sheet records.",409);}
      if(draft.orderId&&draft.kind==="invoice"){const priced=await db.prepare("SELECT json_array_length(json_extract(document_json,'$.commerce.rules')) AS count FROM erp_orders WHERE id=? AND business_id='seiko'").bind(draft.orderId).first<{count:number}>();if(priced?.count)return reply("Review the order pricing and billable roster before issuing this invoice.",409);}
      const now = new Date().toISOString();
      let clientSnapshot = {};
      if (draft.clientId) {
        const row = await db.prepare("SELECT data,archived FROM seiko_clients WHERE id = ?").bind(draft.clientId).first<ClientRow>();
        if (!row || row.archived) return reply("The selected client is unavailable. Refresh clients and choose again.", 409);
        const client = JSON.parse(row.data) as { id:string; type:string; name:string; contactPerson:string; phone:string; email:string; billingAddress:string; gstin:string };
        clientSnapshot = { clientId: client.id, clientType: client.type, clientName: client.name, clientContactPerson: client.contactPerson, clientPhone: client.phone, clientEmail: client.email, clientAddress: client.billingAddress, clientGstin: client.gstin };
      }
      const saved: SeikoCommercialDocument = { ...draft, ...clientSnapshot, creationFingerprint, archivedAt:undefined,deletedAt:undefined, revision:undefined,amendedAt:undefined,amendedBy:undefined, number: "", status: "issued", createdAt: now, updatedAt: now };
      const problem = validateBillingDocument(saved); if (problem) return reply(problem);
      const snapshotProblem = snapshotError(saved); if (snapshotProblem) return reply(snapshotProblem,403);
      await db.prepare(`INSERT INTO seiko_billing_documents(id,data,total_paise,created_by)
        SELECT ?,?,?,? ${saved.orderId ? "WHERE EXISTS (SELECT 1 FROM erp_orders WHERE id = ? AND business_id = 'seiko' AND json_extract(document_json, '$.deletedAt') IS NULL)" : ""}
        ON CONFLICT(id) DO NOTHING`).bind(draft.id, JSON.stringify(saved), Math.round(documentTotals(draft).total * 100), actor.email, ...(saved.orderId ? [saved.orderId] : [])).run();
      const recorded=await db.prepare("SELECT data,cancelled FROM seiko_billing_documents WHERE id = ?").bind(saved.id).first<{data:string;cancelled:number}>();
      if(!recorded)return reply("The order is unavailable. Refresh before creating this document.",409);
      if(recorded.cancelled||JSON.parse(recorded.data).creationFingerprint!==creationFingerprint)return reply("This document reference was already saved with different details. Reload before making a correction.",409);
    } else if (body.operation === "amend") {
      const draft = body.document;
      if (!draft?.id) return reply("Choose a document to amend.");
      const row = await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE id = ?").bind(draft.id).first<DocumentRow>();
      if (!row || row.cancelled) return reply("This document is unavailable for amendment.", 404);
      const original = documentFromRow(row);
      if(!canManageDocument(original.kind))return reply("You do not have permission to amend this document type.",403);
      if(draft.updatedAt&&original.updatedAt&&draft.updatedAt!==original.updatedAt)return reply("A newer document revision exists. Reload before amending.",409);
      if((original.pricingSnapshot||original.credits?.length)&&(JSON.stringify(draft.lines)!==JSON.stringify(original.lines)||draft.taxMode!==original.taxMode||draft.taxTreatment!==original.taxTreatment))return reply("Use order billing review to change priced amounts or record credits. Client details can still be amended.",409);
      if (draft.orderId !== original.orderId) return reply("The source order cannot be changed during amendment.");
      if (draft.kind !== original.kind) return reply("The document type cannot be changed.");
      const now = new Date().toISOString();
      const saved: SeikoCommercialDocument = { ...draft, pricingSnapshot:original.pricingSnapshot,credits:original.credits,supplementaryFor:original.supplementaryFor, archivedAt:original.archivedAt,deletedAt:original.deletedAt, id: original.id, number: original.number, status: "issued", createdAt: original.createdAt, updatedAt: now, revision: (original.revision || 0) + 1, amendedAt: now, amendedBy: actor.email };
      const problem = validateBillingDocument(saved); if (problem) return reply(problem);
      const snapshotProblem = snapshotError(saved, original); if (snapshotProblem) return reply(snapshotProblem,403);
      const paid = await db.prepare("SELECT COALESCE(SUM(amount_paise),0) AS total FROM seiko_billing_payments WHERE invoice_id = ?").bind(draft.id).first<{ total: number }>();
      if(saved.kind==="invoice"&&await db.prepare("SELECT id FROM seiko_billing_payments WHERE invoice_id=? AND json_extract(data,'$.date')<? LIMIT 1").bind(saved.id,saved.issueDate).first())return reply("The invoice date cannot be later than a directly linked receipt date.",409);
      const totalPaise = Math.round(documentTotals(saved).total * 100);
      if (saved.kind === "invoice" && totalPaise < Number(paid?.total || 0) && totalPaise < Math.round(documentTotals(original).total*100)) return reply("The amended invoice total cannot be lower than payments already received.", 409);
      // Check both the original revision and payments in the same statement as the amendment.
      const amended = await db.prepare("UPDATE seiko_billing_documents SET data = ?, total_paise = ? WHERE id = ? AND data = ? AND cancelled = 0 AND (? <> 'invoice' OR ? >= COALESCE((SELECT SUM(amount_paise) FROM seiko_billing_payments WHERE invoice_id = ?),0) OR ? >= ?) AND (?<>'invoice' OR NOT EXISTS(SELECT 1 FROM seiko_billing_payments WHERE invoice_id=? AND json_extract(data,'$.date')<?))").bind(JSON.stringify(saved), totalPaise, saved.id, row.data, saved.kind, totalPaise, saved.id, totalPaise, Math.round(documentTotals(original).total*100),saved.kind,saved.id,saved.issueDate).run();
      if (!amended.meta?.changes) return reply("This document or its payments changed while you were editing. Refresh before amending again.", 409);
    } else if(body.operation==="refund"){
      const draft=body.payment;
      if(!draft||typeof draft.id!=="string"||!/^[a-zA-Z0-9-]{8,80}$/.test(draft.id)||typeof draft.refundOf!=="string"||!draft.refundOf||!Number.isFinite(draft.amount)||draft.amount<=0||draft.amount>1e9||roundMoney(draft.amount)!==draft.amount||!validBillingDate(draft.date)||typeof draft.mode!=="string"||!draft.mode.trim()||typeof draft.notes!=="string"||!draft.notes.trim()||draft.notes.length>2000)return reply("Enter a valid refund amount, date, method and reason.");
      if(draft.date>billingToday())return reply("A planned refund is not money returned. Record the refund only on or after its actual payment date.");
      const stamp=await db.prepare("SELECT "+paymentStampSql+" AS payments, "+documentStampSql+" AS documents").first<{payments:string;documents:string}>();
      const rows=await db.prepare("SELECT sequence,id,data FROM seiko_billing_payments").all<PaymentRow>();
      const docs=await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents").all<DocumentRow>();
      const receipts:SeikoPaymentRecord[]=rows.results.map(paymentFromRow),decodedDocs:SeikoCommercialDocument[]=docs.results.map(documentFromRow);
      const source=receipts.find(p=>p.id===draft.refundOf),sourceRow=rows.results.find((p:PaymentRow)=>p.id===draft.refundOf);
      if(!source||!sourceRow||source.refundOf||source.amount<=0)return reply("Choose the original payment receipt.",404);
      const retry=receipts.find(p=>p.id===draft.id);
      if(retry){if(retry.refundOf!==source.id||retry.amount!==-draft.amount||retry.date!==draft.date||retry.mode!==draft.mode.trim()||retry.notes!==draft.notes.trim()||(retry.reference||"")!==String(draft.reference||""))return reply("This refund reference was already saved with different details.",409);}
      else if(draft.date<source.date||draft.amount>refundablePaymentAmount(source,decodedDocs,receipts))return reply("Refund exceeds the available credit or advance, or predates the payment. Review billing before refunding.",409);
      const saved:SeikoPaymentRecord={id:draft.id,refundOf:source.id,refundReceiptNumber:source.receiptNumber,invoiceId:source.invoiceId,orderId:source.orderId,orderNo:source.orderNo,clientName:source.clientName||decodedDocs.find(d=>d.id===source.invoiceId)?.clientName,clientPhone:source.clientPhone,receiptNumber:"",amount:-draft.amount,date:draft.date,mode:draft.mode.trim(),reference:String(draft.reference||""),notes:draft.notes.trim(),showNotes:true,appearance:source.appearance,createdAt:new Date().toISOString(),refundedBy:actor.email};
      await db.prepare("INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) SELECT ?,?,?,?,? WHERE "+paymentStampSql+"=? AND "+documentStampSql+"=? AND EXISTS(SELECT 1 FROM seiko_billing_payments WHERE id=? AND data=?) ON CONFLICT(id) DO NOTHING").bind(saved.id,saved.invoiceId,Math.round(saved.amount*100),JSON.stringify(saved),actor.email,stamp?.payments||"",stamp?.documents||"",source.id,sourceRow.data).run();
      const recorded=await db.prepare("SELECT data FROM seiko_billing_payments WHERE id=?").bind(saved.id).first<{data:string}>();
      if(!recorded)return reply("The refundable balance changed. Reload before recording this refund.",409);
      const value=JSON.parse(recorded.data) as SeikoPaymentRecord;if(value.refundOf!==saved.refundOf||value.amount!==saved.amount||value.date!==saved.date||value.mode!==saved.mode||value.notes!==saved.notes||value.reference!==saved.reference)return reply("This refund reference was already saved with different details.",409);
    } else if (body.operation === "link_payment") {
      if(typeof body.id!=="string"||typeof body.invoiceId!=="undefined"&&(typeof body.invoiceId!=="string"||body.invoiceId.length>200)||(!body.orderId&&!body.invoiceId)||body.orderId&&body.invoiceId)return reply("Choose one order or invoice.");
      const row=await db.prepare("SELECT sequence,id,data FROM seiko_billing_payments WHERE id=?").bind(body.id).first<PaymentRow>();
      if(!row)return reply("Payment slip not found.",404);
      const original=paymentFromRow(row);
      // A lost response may leave the caller retrying a successful link. The
      // same target is a read-only replay; another target is still forbidden.
      if(original.linkedAt&&(body.invoiceId?original.invoiceId===body.invoiceId:!original.invoiceId&&original.orderId===body.orderId))return await respondLedger();
      if(original.refundOf||await db.prepare("SELECT id FROM seiko_billing_payments WHERE json_extract(data,'$.refundOf')=? LIMIT 1").bind(original.id).first())return reply("Refunded receipts cannot be relinked.",409);
      if(original.invoiceId||original.orderId)return reply("This receipt is already linked. Refresh the payment list.",409);
      if((original.revision||0)!==(body.expectedRevision||0)||original.updatedAt!==body.expectedUpdatedAt)return reply("This receipt changed. Reload before linking it.",409);
      const now=new Date().toISOString();
      let target:{invoiceId:string;orderId:string;orderNo:string;clientName:string;clientPhone:string};
      let invoiceData="";
      // Guard the complete payment snapshot: concurrent receipts/advances cannot consume the same balance.
      const stampSql="COALESCE((SELECT group_concat(id || ':' || data, '|') FROM (SELECT id,data FROM seiko_billing_payments ORDER BY id)),'')";
      const docStampSql="COALESCE((SELECT group_concat(id || ':' || data || ':' || cancelled, '|') FROM (SELECT id,data,cancelled FROM seiko_billing_documents ORDER BY id)),'')";
      const stamp=await db.prepare("SELECT "+stampSql+" AS stamp, "+docStampSql+" AS docs").first<{stamp:string;docs:string}>();
      if(body.invoiceId){
        const invoiceRow=await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE id=?").bind(body.invoiceId).first<DocumentRow>();
        if(!invoiceRow||invoiceRow.cancelled)return reply("Choose an active invoice.",409);
        const invoice=documentFromRow(invoiceRow);invoiceData=invoiceRow.data;
        if(invoice.kind!=="invoice"||invoice.deletedAt||original.date<invoice.issueDate)return reply("Choose an invoice issued on or before the payment date.");
        const documents=await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents").all<DocumentRow>();
        const payments=await db.prepare("SELECT sequence,id,data FROM seiko_billing_payments ORDER BY sequence DESC").all<PaymentRow>();
        const allocated=allocateOrderPayments(documents.results.map(documentFromRow),payments.results.map(paymentFromRow));
        if(original.amount>invoiceOutstanding(invoice,allocated))return reply("The slip exceeds this invoice's balance. Link it to the order to keep the excess as an advance.",409);
        target={invoiceId:invoice.id,orderId:invoice.orderId||"",orderNo:invoice.orderNo||"",clientName:invoice.clientName,clientPhone:invoice.clientPhone||""};
      }else{
        const order=await db.prepare("SELECT document_json,status FROM erp_orders WHERE id=? AND business_id='seiko' AND json_extract(document_json,'$.deletedAt') IS NULL").bind(body.orderId).first<{document_json:string;status:string}>();
        if(!order||order.status==="Cancelled")return reply("Choose an active order.",409);
        const details=JSON.parse(order.document_json).details;
        target={invoiceId:"",orderId:body.orderId!,orderNo:details.orderNo||"",clientName:details.clientName||"",clientPhone:details.contactNumber||""};
      }
      const saved:SeikoPaymentRecord={...original,...target,linkedAt:now,linkedBy:actor.email,originalPayer:original.clientName,originalPhone:original.clientPhone,updatedAt:now,revision:(original.revision||0)+1};
      const json=JSON.stringify(saved);
      const result=await db.batch([
        db.prepare("UPDATE seiko_billing_payments SET invoice_id=?,data=? WHERE id=? AND data=? AND NOT EXISTS(SELECT 1 FROM seiko_billing_payments WHERE json_extract(data,'$.refundOf')=?) AND "+stampSql+"=? AND "+docStampSql+"=? AND (?='' OR EXISTS(SELECT 1 FROM seiko_billing_documents WHERE id=? AND data=? AND cancelled=0)) AND (?='' OR EXISTS(SELECT 1 FROM erp_orders WHERE id=? AND business_id='seiko' AND status<>'Cancelled' AND json_extract(document_json,'$.deletedAt') IS NULL))").bind(saved.invoiceId,json,row.id,row.data,original.id,stamp?.stamp||"",stamp?.docs||"",saved.invoiceId,saved.invoiceId,invoiceData,body.orderId||"",body.orderId||""),
        db.prepare("INSERT INTO erp_audit_events(id,business_id,entity_type,entity_id,action,version,actor_user_id,actor_email,at,snapshot_json) SELECT ?,'seiko','billing-payment',?,'link',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM seiko_billing_payments WHERE id=? AND data=?)").bind(crypto.randomUUID(),row.id,saved.revision,actor.userId,actor.email,now,JSON.stringify({before:original,after:saved}),row.id,json)
      ]);
      if(!result[0].meta.changes)return reply("Receipt, order or invoice balance changed. Refresh before linking.",409);
    } else if (body.operation === "amend_payment") {
      const draft=body.payment;
      if(!draft?.id)return reply("Choose a receipt to amend.");
      const row=await db.prepare("SELECT sequence,id,data FROM seiko_billing_payments WHERE id=?").bind(draft.id).first<PaymentRow>();
      if(!row)return reply("Receipt not found.",404);
      const original=paymentFromRow(row);
      if(original.refundOf)return reply("Refund receipts are permanent. Record a new correction instead of amending the refund.",409);
      if((draft.amount!==original.amount||draft.date!==original.date)&&await db.prepare("SELECT id FROM seiko_billing_payments WHERE json_extract(data,'$.refundOf')=? LIMIT 1").bind(original.id).first())return reply("The amount and date of a refunded receipt cannot be changed.",409);
      if(draft.revision!==original.revision||draft.updatedAt!==original.updatedAt)return reply("A newer receipt revision exists. Reload before amending.",409);
      if(draft.showNotes!==undefined&&typeof draft.showNotes!=="boolean")return reply("Invalid receipt notes setting.");
      if(draft.invoiceId!==original.invoiceId||draft.orderId!==original.orderId)return reply("The receipt's invoice and order cannot be changed.");
      if(!Number.isFinite(draft.amount)||draft.amount<=0||draft.amount>1_000_000_000||roundMoney(draft.amount)!==draft.amount||!validBillingDate(draft.date)||typeof draft.mode!=="string"||!draft.mode.trim())return reply("Enter a positive amount with at most two decimal places, a valid date and payment mode.");
      if(draft.date>billingToday())return reply("Future payments remain pending. A receipt can record only funds already received.");
      if(original.invoiceId){
        const invoice=await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE id=?").bind(original.invoiceId).first<DocumentRow>();
        if(!invoice||invoice.cancelled||draft.date<JSON.parse(invoice.data).issueDate)return reply("Choose a payment date on or after the active invoice's issue date.");
      }
      // Keep the authorised original appearance and source snapshot. Receipt corrections
      // cannot replace signature assets or reassign money to another order.
      const now=new Date().toISOString();
      const saved:SeikoPaymentRecord={...original,allocations:undefined,amount:draft.amount,date:draft.date,mode:draft.mode.trim(),reference:String(draft.reference||""),notes:String(draft.notes||""),showNotes:draft.showNotes??original.showNotes,updatedAt:now,revision:(original.revision||0)+1,amendedAt:now,amendedBy:actor.email};
      const json=JSON.stringify(saved),paise=Math.round(saved.amount*100),oldPaise=Math.round(original.amount*100);
      const balance=original.invoiceId?await paymentBalance(original.invoiceId,original.id):null;
      if(balance&&(!balance.invoice||balance.invoice.status==="cancelled"||balance.invoice.deletedAt||saved.date<balance.invoice.issueDate))return reply("The invoice changed. Reload before amending this receipt.",409);
      if(balance&&paise>oldPaise&&saved.amount>balance.outstanding)return reply("The amended receipt exceeds the invoice balance after advances. Reload before amending.",409);
      const results=await db.batch([
        db.prepare("UPDATE seiko_billing_payments SET data=?,amount_paise=? WHERE id=? AND data=? AND (?=1 OR NOT EXISTS(SELECT 1 FROM seiko_billing_payments WHERE json_extract(data,'$.refundOf')=?)) AND (?='' OR ("+paymentStampSql+"=? AND "+documentStampSql+"=?)) AND (?='' OR ?<=? OR EXISTS(SELECT 1 FROM seiko_billing_documents d WHERE d.id=? AND d.cancelled=0 AND d.total_paise-COALESCE((SELECT SUM(p.amount_paise) FROM seiko_billing_payments p WHERE p.invoice_id=d.id AND p.id<>?),0)>=?))").bind(json,paise,row.id,row.data,saved.amount===original.amount&&saved.date===original.date?1:0,original.id,original.invoiceId,balance?.stamp?.payments||"",balance?.stamp?.documents||"",original.invoiceId,paise,oldPaise,original.invoiceId,row.id,paise),
        db.prepare("INSERT INTO erp_audit_events(id,business_id,entity_type,entity_id,action,version,actor_user_id,actor_email,at,snapshot_json) SELECT ?,'seiko','billing-payment',?,'amend',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM seiko_billing_payments WHERE id=? AND data=?)").bind(crypto.randomUUID(),row.id,saved.revision,actor.userId,actor.email,now,JSON.stringify({before:original,after:saved}),row.id,json),
      ]);
      if(!results[0].meta.changes)return reply("Receipt or invoice balance changed. Reload and check the amount before amending.",409);
    } else if (body.operation === "payment") {
      const payment = body.payment;
      if(payment?.showNotes!==undefined&&typeof payment.showNotes!=="boolean")return reply("Invalid receipt notes setting.");
      if (!payment || typeof payment.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(payment.id) || typeof payment.invoiceId !== "string") return reply("Invalid payment.");
      if (!Number.isFinite(payment.amount) || payment.amount <= 0 || payment.amount > 1_000_000_000 || roundMoney(payment.amount) !== payment.amount || !validBillingDate(payment.date) || (typeof payment.mode!=="string"||!payment.mode.trim())) return reply("Enter a positive amount with at most two decimal places, a valid date and payment mode.");
      if(payment.date>billingToday())return reply("Future or promised payments remain pending. Record a receipt only after the money is received.");
      const prior=await db.prepare("SELECT data FROM seiko_billing_payments WHERE id=?").bind(payment.id).first<{data:string}>();
      if(prior){
        const stored=JSON.parse(prior.data) as SeikoPaymentRecord;
        if(stored.invoiceId!==payment.invoiceId||(!payment.invoiceId&&(stored.orderId||"")!==(payment.orderId||""))||stored.amount!==payment.amount||stored.date!==payment.date||stored.mode!==payment.mode.trim()||(stored.reference||"")!==String(payment.reference||"")||(stored.notes||"")!==String(payment.notes||""))return reply("This payment reference was already saved with different details. Reload the receipt before making a correction.",409);
        if(!stored.invoiceId&&!stored.orderId&&(stored.clientName!==payment.clientName?.trim()||(stored.clientPhone||"")!==String(payment.clientPhone||"")))return reply("This payment reference was already saved for a different payer.",409);
        return await respondLedger();
      }
      if (payment.appearance) {
        // Appearance is a snapshot only; it must not override receipt/invoice financial fields.
        const { supplier, signatory, showSignatory, showSignature, showStamp, showSigningDate, signingDate } = payment.appearance;
        payment.appearance = { supplier, signatory, showSignatory, showSignature, showStamp, showSigningDate, signingDate };
        const error = snapshotError(payment.appearance as SeikoCommercialDocument);
        if (error) return reply(error,403);
        if (showSigningDate && (!signingDate || !validBillingDate(signingDate))) return reply("Choose a valid signing date.");
        if ((showSignature && !signatory?.signature) || (showStamp && !signatory?.stamp)) return reply("Choose a saved signatory with the selected assets.");
      }
      // Payments may be collected first and linked to a verified source later.
      if (!payment.invoiceId && !payment.orderId) {
        if(typeof payment.clientName!=="string"||!payment.clientName.trim()||payment.clientName.length>200||String(payment.clientPhone||"").length>80)return reply("Enter the payer name and a valid phone number.");
        const now=new Date().toISOString();
        const saved:SeikoPaymentRecord={id:payment.id,invoiceId:"",orderId:"",receiptNumber:"",clientName:payment.clientName.trim(),clientPhone:String(payment.clientPhone||""),amount:payment.amount,date:payment.date,mode:payment.mode.trim(),reference:String(payment.reference||""),notes:String(payment.notes||""),showNotes:payment.showNotes,appearance:payment.appearance,createdAt:now};
        await db.prepare("INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES (?,'',?,?,?) ON CONFLICT(id) DO NOTHING").bind(saved.id,Math.round(saved.amount*100),JSON.stringify(saved),actor.email).run();
        const stored=await db.prepare("SELECT data FROM seiko_billing_payments WHERE id=?").bind(saved.id).first<{data:string}>();
        const existing=stored&&JSON.parse(stored.data);
        if(!existing||existing.invoiceId||existing.orderId||existing.amount!==saved.amount||existing.date!==saved.date||existing.clientName!==saved.clientName||existing.clientPhone!==saved.clientPhone||existing.mode!==saved.mode||existing.reference!==saved.reference||existing.notes!==saved.notes)return reply("This payment reference was already saved with different details.",409);
      } else if (!payment.invoiceId) {
        if (typeof payment.orderId !== "string" || !payment.orderId) return reply("Choose an order for this payment.");
        const orderRow = await db.prepare("SELECT document_json,status FROM erp_orders WHERE id = ? AND business_id = 'seiko' AND json_extract(document_json, '$.deletedAt') IS NULL").bind(payment.orderId).first<{ document_json: string; status: string }>();
        if (!orderRow) return reply("Order was not found. Save the order before taking payment.", 404);
        if (orderRow.status === "Cancelled") return reply("Cannot receive payment for a cancelled order.");
        const order = JSON.parse(orderRow.document_json) as { details: { orderNo?: string; clientName?: string; contactNumber?: string } };
        const saved: SeikoPaymentRecord = { id: payment.id, invoiceId: "", orderId: payment.orderId, orderNo: order.details.orderNo || "", clientName: order.details.clientName || "", clientPhone: order.details.contactNumber || "", receiptNumber: "", amount: payment.amount, date: payment.date, mode: payment.mode.trim(), reference: String(payment.reference || ""), notes: String(payment.notes || ""), showNotes:payment.showNotes, createdAt: new Date().toISOString() };
        saved.appearance = payment.appearance;
        await db.prepare("INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM erp_orders WHERE id = ? AND business_id = 'seiko' AND status<>'Cancelled' AND document_json=? AND json_extract(document_json, '$.deletedAt') IS NULL) ON CONFLICT(id) DO NOTHING").bind(saved.id, "", Math.round(saved.amount * 100), JSON.stringify(saved), actor.email, saved.orderId,orderRow.document_json).run();
        const recorded = await db.prepare("SELECT data FROM seiko_billing_payments WHERE id = ?").bind(saved.id).first<{ data: string }>();
        const original = recorded && JSON.parse(recorded.data) as SeikoPaymentRecord;
        if (!original || original.orderId !== saved.orderId || original.invoiceId || original.amount !== saved.amount || original.date !== saved.date || original.mode !== saved.mode || original.reference !== saved.reference || original.notes !== saved.notes) return reply("This payment reference was already saved with different details. Refresh before trying again.", 409);
      } else {
      const row = await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE id = ?").bind(payment.invoiceId).first<DocumentRow>();
      if (!row) return reply("Invoice was not found.", 404);
      const invoice = documentFromRow(row);
      if (invoice.kind !== "invoice" || row.cancelled || payment.date < invoice.issueDate) return reply("Choose an active invoice and a payment date on or after its issue date.");
      const saved:SeikoPaymentRecord = { id:payment.id,invoiceId:invoice.id,orderId:invoice.orderId,orderNo:invoice.orderNo,clientName:invoice.clientName,clientPhone:invoice.clientPhone,amount:payment.amount,date:payment.date,mode:payment.mode.trim(),reference:String(payment.reference||""),notes:String(payment.notes||""),showNotes:payment.showNotes,appearance:payment.appearance, receiptNumber: "", createdAt: new Date().toISOString() };
      const paise = Math.round(payment.amount * 100);
      const balance=await paymentBalance(invoice.id);
      if(!prior&&payment.amount>balance.outstanding)return reply("Payment exceeds the balance after order advances. Refresh and check the amount.",409);
      // The balance check and insert are one SQLite statement: concurrent payments cannot overpay.
      await db.prepare(`INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by)
        SELECT ?,id,?,?,? FROM seiko_billing_documents WHERE id = ? AND cancelled = 0
        AND total_paise - COALESCE((SELECT SUM(amount_paise) FROM seiko_billing_payments WHERE invoice_id = ?),0) >= ?
        AND data=? AND ${paymentStampSql}=? AND ${documentStampSql}=?
        ON CONFLICT(id) DO NOTHING`).bind(payment.id, paise, JSON.stringify(saved), actor.email, invoice.id, invoice.id, paise,row.data,balance.stamp?.payments||"",balance.stamp?.documents||"").run();
      const recorded = await db.prepare("SELECT data FROM seiko_billing_payments WHERE id = ? AND invoice_id = ?").bind(payment.id, invoice.id).first<{data:string}>();
      if (!recorded) return reply("Payment or balance changed. Refresh and check the amount.", 409);
      const recordedPayment=JSON.parse(recorded.data) as SeikoPaymentRecord;
      if(recordedPayment.amount!==saved.amount||recordedPayment.date!==saved.date||recordedPayment.mode!==saved.mode||(recordedPayment.reference||"")!==saved.reference||(recordedPayment.notes||"")!==saved.notes)return reply("This payment reference was already saved with different details. Reload before trying again.",409);
      }
    } else if (body.operation !== "list") return reply("Unknown billing operation.");
    return await respondLedger();
  } catch {
    return reply("Billing could not be saved or loaded. Your form is still available; retry when connected.", 503);
  }
}
