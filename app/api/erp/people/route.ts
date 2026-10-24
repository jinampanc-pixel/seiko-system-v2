import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { personName, assignedQuantities, deliveredQuantity, recordEligibility, pricingQuote } from "../../../lib/order-commerce";
import { normalizeProductMeasurements, groupRuleMatches, type SeikoOrder } from "../../../lib/order-domain";
import { allocateOrderPayments, documentTotals, invoiceOutstanding, type SeikoCommercialDocument, type SeikoPaymentRecord } from "../../../lib/seiko-billing";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request){
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return fail("Invalid origin.",403);
 const actor=await authenticateActor(request);if(!actor)return fail("Sign in required.",401);
 try{
 const raw=await request.text();if(raw.length>4096)return fail("Request too large.",413);const body=JSON.parse(raw) as {operation?:string;businessId?:string;query?:string;page?:number;orderId?:string;recordId?:string};
 const business=body.businessId||"seiko";if(!/^[a-zA-Z0-9_-]{2,64}$/.test(business)||!await authorizePermission(actor,business,"orders.view"))return fail("Person records require order-view access for this business.",403);
 const db=env.DB?.withSession("first-primary");if(!db)return fail("Shared storage is unavailable.",503);
 if(body.operation==="search"){
 const q=body.query?.trim().toLowerCase();if(!q||q.length<2||q.length>120)return fail("Enter at least two characters of a name, person ID or another detail.");
 const page=Number(body.page||1);if(!Number.isInteger(page)||page<1||page>10000)return fail("Choose a valid search page.");
 const found=await db.prepare(`SELECT o.id AS order_id,o.order_no,json_extract(o.document_json,'$.details.clientName') AS client,
 json_extract(o.document_json,'$.fields') AS fields_json,r.value AS record_json,
 json_extract(o.document_json,'$.commerce.people.'||json_quote(json_extract(r.value,'$.recordId'))||'.state') AS state,
 json_extract(o.document_json,'$.googleSheet.id') AS sheet_id
 FROM erp_orders o,json_each(o.document_json,'$.records') r
 WHERE o.business_id=? AND json_extract(o.document_json,'$.deletedAt') IS NULL
 AND (instr(lower(CAST(json_extract(r.value,'$.personId') AS TEXT)),?)>0 OR instr(lower(CAST(json_extract(r.value,'$.recordId') AS TEXT)),?)>0
 OR EXISTS(SELECT 1 FROM json_each(r.value,'$.values') v WHERE instr(lower(CAST(v.value AS TEXT)),?)>0))
 ORDER BY o.updated_at DESC,o.id,CAST(r.key AS INTEGER) LIMIT 21 OFFSET ?`).bind(business,q,q,q,(page-1)*20).all<{order_id:string;order_no:string;client:string;fields_json:string;record_json:string;state:string;sheet_id:string}>();
 const results=found.results.slice(0,20).map(row=>{const record=JSON.parse(row.record_json),fields=JSON.parse(row.fields_json||"[]") as SeikoOrder["fields"],nameField=fields.find(f=>/name/i.test(f.name))||fields[0];return {orderId:row.order_id,recordId:record.recordId,personId:record.personId,name:String(record.values[`field:${nameField?.id}`]||record.personId),orderNo:row.order_no,client:row.client,state:record.held?"hold":row.state||"active",sheetLinked:Boolean(row.sheet_id)};});
 return Response.json({ok:true,results,page,hasMore:found.results.length>20,sourceNote:"Search uses validated app records. Sheet edits appear after synchronization; opening a person checks that order’s latest sheet."},{headers:{"Cache-Control":"no-store"}});
 }
 if(body.operation!=="detail"||typeof body.orderId!=="string"||body.orderId.length>128||typeof body.recordId!=="string"||body.recordId.length>150)return fail("Choose a person record.");
 const load=()=>db.prepare("SELECT document_json,updated_at FROM erp_orders WHERE business_id=? AND id=? AND json_extract(document_json,'$.deletedAt') IS NULL").bind(business,body.orderId).first<{document_json:string;updated_at:string}>();let row=await load();if(!row)return fail("Order not found.",404);
 let syncWarning="",syncedAt:string|null=null;const source=JSON.parse(row.document_json) as SeikoOrder;
 if(business==="seiko"&&source.googleSheet){try{const service=await import("../../../lib/server-order-sheets");await service.syncOrderSheet(db,actor,body.orderId,true);syncedAt=(await service.orderSheetLink(db,body.orderId))?.synced_at||null;row=await load();}catch(e){syncWarning=(e as Error).message;}}
 if(!row)return fail("Order not found.",404);const order=normalizeProductMeasurements(JSON.parse(row.document_json) as SeikoOrder),record=order.records.find(r=>r.recordId===body.recordId);if(!record)return fail("Person not found. Search again after syncing the order.",404);
 const q=assignedQuantities(order),products=order.products.filter(p=>p.quantityMode!=="order_total").map(p=>{const specifications=p.specifications.map(s=>({label:s.name,value:s.mode==="per_person"?record.values[`spec:${s.id}`]:s.mode==="default_with_exceptions"?record.values[`spec:${s.id}:override`]||s.defaultValue:s.mode==="by_group"?s.groupRules.find(rule=>groupRuleMatches(rule.match,String(record.values[`field:${s.groupFieldId}`]||"")))?.value||s.defaultValue:s.defaultValue}));return {name:p.name,quantity:q.get(record.recordId)?.[p.id]||0,delivered:deliveredQuantity(order,record.recordId,p.id),specifications,measurements:order.measurements.filter(m=>m.appliesTo.includes(p.id)).map(m=>({label:m.name,value:record.values[m.shared?`measurement:${m.id}:shared`:`measurement:${m.id}:product:${p.id}`]??""}))};});
 const financial=Boolean(await authorizePermission(actor,business,"financials.view"));let finance=null;
 if(financial&&business==="seiko"){
 const rows=await db.prepare("SELECT sequence,data,cancelled FROM seiko_billing_documents WHERE json_extract(data,'$.orderId')=? AND json_extract(data,'$.kind')='invoice' AND json_extract(data,'$.deletedAt') IS NULL ORDER BY sequence").bind(order.orderId).all<{sequence:number;data:string;cancelled:number}>();const docs=rows.results.map(r=>{const d=JSON.parse(r.data) as SeikoCommercialDocument;return {...d,number:`INV-${d.issueDate.slice(0,4)}-${String(r.sequence).padStart(5,"0")}`,status:r.cancelled?"cancelled" as const:"issued" as const};});
 const payments=await db.prepare("SELECT data FROM seiko_billing_payments WHERE json_extract(data,'$.orderId')=? OR invoice_id IN (SELECT id FROM seiko_billing_documents WHERE json_extract(data,'$.orderId')=?)").bind(order.orderId,order.orderId).all<{data:string}>(),allocated=allocateOrderPayments(docs,payments.results.map(r=>JSON.parse(r.data) as SeikoPaymentRecord));
 finance={agreedItems:pricingQuote(order).units.filter(u=>u.recordId===record.recordId).map(u=>({description:u.description,amount:u.amount})),orderInvoices:docs.map(d=>({number:d.number,status:d.status,total:documentTotals(d).total,balance:invoiceOutstanding(d,allocated)}))};
 }
 const person=order.commerce?.people[record.recordId];
 return Response.json({ok:true,person:{orderId:order.orderId,recordId:record.recordId,name:personName(order,record.recordId),personId:record.personId,orderNo:order.details.orderNo,client:order.details.clientName,state:record.held?"hold":person?.state||"active",batch:person?.batch||"",standardSize:person?.readySize||"",eligibility:recordEligibility(order,record),fields:order.fields.map(f=>({label:f.name,value:record.values[`field:${f.id}`]??""})),products,deliveries:(order.commerce?.deliveries||[]).filter(d=>d.recordId===record.recordId).map(d=>({date:d.date,kind:d.kind,product:order.products.find(p=>p.id===d.productId)?.name||"Removed product",quantity:d.quantity,reference:d.reference})),queries:(order.commerce?.issues||[]).filter(i=>i.recordId===record.recordId).map(i=>({type:i.type,status:i.status,description:i.description,owner:i.owner,promisedDate:i.promisedDate,history:i.history})),finance,sheetUrl:order.googleSheet?.url||null,syncedAt,updatedAt:row.updated_at,syncWarning}},{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("Person records could not be loaded. Retry when connected.",503);}
}
