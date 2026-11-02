import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import type { Permission } from "../../../lib/access-control";

const reply=(message:string,status=400)=>Response.json({ok:false,message},{status,headers:{"Cache-Control":"no-store"}});
const permissions:Record<string,Permission>={order:"orders.view",production:"production.view",billing:"billing.view",receipt:"billing.view",labels:"labels.print"};
const actions=["pdf-prepared","download-requested","print-requested","document-opened","share-requested"];
export async function POST(request:Request){
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return reply("Invalid request origin.",403);
 try{
  const actor=await authenticateActor(request);if(!actor)return reply("Sign in is required.",401);
  const reader=request.body?.getReader();let raw="",size=0;const decoder=new TextDecoder();if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return reply("Activity request is too large.",413);}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();
  const b=JSON.parse(raw),permission=permissions[b.kind];
  if(!permission||!['seiko','meth','veyn-health'].includes(b.businessId)||typeof b.id!=="string"||!b.id||b.id.length>128||!actions.includes(b.action)||typeof b.eventId!=="string"||!/^[a-f0-9-]{36}$/i.test(b.eventId)||b.digest!==undefined&&!/^[a-f0-9]{64}$/.test(b.digest)||b.title!==undefined&&(typeof b.title!=="string"||b.title.length>240))return reply("Choose a valid record and output action.");
  if(!await authorizePermission(actor,b.businessId,permission))return reply("You cannot output this record.",403);
  if(b.kind==='labels'&&!await authorizePermission(actor,b.businessId,'orders.view'))return reply("Order information access is required.",403);
  if((b.kind==='billing'||b.kind==='receipt')&&!await authorizePermission(actor,b.businessId,'financials.view'))return reply("Financial information access is required.",403);
  const db=env.DB?.withSession('first-primary');if(!db)return reply("Activity storage is unavailable.",503);
  let source:{data:string;version:number;sequence?:number}|null=null;
  if(b.kind==='order'||b.kind==='labels')source=await db.prepare("SELECT document_json AS data,version FROM erp_orders WHERE business_id=? AND id=? AND json_extract(document_json,'$.deletedAt') IS NULL").bind(b.businessId,b.id).first();
  if(b.kind==='production')source=await db.prepare("SELECT document_json AS data,version FROM jinam_shared_records WHERE scope=? AND collection='production-handoffs-v1' AND id=? AND id!='ledger'").bind(b.businessId,b.id).first();
  if(b.kind==='billing'||b.kind==='receipt'){
   if(b.businessId!=='seiko')return reply("This billing record is unavailable.",404);
   source=await db.prepare(b.kind==='billing'?"SELECT data,sequence,COALESCE(json_extract(data,'$.revision'),1) AS version FROM seiko_billing_documents WHERE id=?":"SELECT data,sequence,COALESCE(json_extract(data,'$.revision'),1) AS version FROM seiko_billing_payments WHERE id=?").bind(b.id).first();
  }
  if(b.kind==='labels'&&b.id==='standalone')source={data:JSON.stringify({name:"Standalone labels"}),version:0};
  if(!source)return reply("Save this record to shared storage before printing or exporting it.",409);
  const doc=JSON.parse(source.data),reference=b.kind==='billing'?`${doc.kind==='invoice'?'INV':doc.kind==='quotation'?'QTN':'DC'}-${doc.issueDate.slice(0,4)}-${String(source.sequence).padStart(5,"0")}`:b.kind==='receipt'?(doc.receiptNumber||`RCP-${doc.date.slice(0,4)}-${String(source.sequence).padStart(5,"0")}`):doc.number||doc.details?.orderNo||doc.name||b.id;
  const snapshot=JSON.stringify({reference,title:b.title||reference,digest:b.digest,displayName:actor.displayName,orderIds:doc.allocations?[...new Set(doc.allocations.map((a:{orderId:string})=>a.orderId))]:[doc.orderId||b.id]});
  const existing=await db.prepare("SELECT business_id,entity_type,entity_id,action,actor_user_id,snapshot_json FROM erp_audit_events WHERE id=?").bind(b.eventId).first<{business_id:string;entity_type:string;entity_id:string;action:string;actor_user_id:string;snapshot_json:string}>();
  if(existing){if(existing.business_id!==b.businessId||existing.entity_type!=='output-'+b.kind||existing.entity_id!==b.id||existing.action!==b.action||existing.actor_user_id!==actor.userId||JSON.parse(existing.snapshot_json).digest!==b.digest)return reply("This activity reference was already used for another action.",409);return Response.json({ok:true});}
  // Identity and time come from the authenticated server, never from the caller.
  await db.prepare("INSERT OR IGNORE INTO erp_audit_events(id,business_id,entity_type,entity_id,action,version,actor_user_id,actor_email,at,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(b.eventId,b.businessId,'output-'+b.kind,b.id,b.action,source.version,actor.userId,actor.email,new Date().toISOString(),snapshot).run();
  return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return reply("Activity could not be recorded. Retry before printing or exporting.",503);}
}
export async function GET(request:Request){
 try{
  const actor=await authenticateActor(request);if(!actor)return reply("Sign in is required.",401);
  const url=new URL(request.url),business=url.searchParams.get('businessId')||'seiko',cursor=url.searchParams.get('before')||'9999',kind=url.searchParams.get('kind')||'';
  if(!['seiko','meth','veyn-health'].includes(business)||!['','order','production','billing','receipt','labels'].includes(kind)||cursor.length>128)return reply("Choose a valid activity filter.");
  if(!await authorizePermission(actor,business,'audit.view'))return reply("You cannot view activity history.",403);
  const db=env.DB?.withSession('first-primary');if(!db)return reply("Activity storage is unavailable.",503);
  const results=await db.prepare(`SELECT * FROM (
   SELECT id,'order' AS kind,entity_id AS recordId,action,actor_email AS actor,at,version,COALESCE(json_extract(snapshot_json,'$.details.orderNo'),entity_id) AS reference FROM erp_audit_events WHERE business_id=? AND entity_type='order'
   UNION ALL SELECT id,substr(entity_type,8),entity_id,action,actor_email,at,version,COALESCE(json_extract(snapshot_json,'$.reference'),entity_id) FROM erp_audit_events WHERE business_id=? AND entity_type LIKE 'output-%'
   UNION ALL SELECT 'label-'||sequence,'labels',entity_id,action,actor_email,at,version,COALESCE(json_extract(after_json,'$.name'),entity_id) FROM erp_label_history WHERE business_id=?
   UNION ALL SELECT 'production-'||sequence,'production',id,action,actor_email,at,version,COALESCE(json_extract(snapshot_json,'$.number'),id) FROM jinam_shared_changes WHERE scope=? AND collection='production-handoffs-v1' AND id!='ledger'
   UNION ALL SELECT 'billing-'||sequence,CASE WHEN entity_type='payment' THEN 'receipt' ELSE 'billing' END,entity_id,action,COALESCE(actor_email,json_extract(json_extract(after_json,'$.data'),'$.amendedBy')),at,COALESCE(json_extract(json_extract(after_json,'$.data'),'$.revision'),1),COALESCE(NULLIF(json_extract(json_extract(after_json,'$.data'),'$.number'),''),NULLIF(json_extract(json_extract(after_json,'$.data'),'$.receiptNumber'),''),CASE WHEN after_json IS NOT NULL THEN (CASE WHEN entity_type='payment' THEN 'RCP' WHEN json_extract(json_extract(after_json,'$.data'),'$.kind')='invoice' THEN 'INV' WHEN json_extract(json_extract(after_json,'$.data'),'$.kind')='quotation' THEN 'QTN' ELSE 'DC' END)||'-'||substr(COALESCE(json_extract(json_extract(after_json,'$.data'),'$.issueDate'),json_extract(json_extract(after_json,'$.data'),'$.date')),1,4)||'-'||printf('%05d',json_extract(after_json,'$.sequence')) ELSE entity_id END) FROM seiko_storage_audit WHERE ?='seiko' AND entity_type IN ('billing-document','payment')
  ) WHERE (at||'|'||id)<? AND (?='' OR kind=?) ORDER BY at DESC,id DESC LIMIT 101`).bind(business,business,business,business,business,cursor,kind,kind).all();
  const events=results.results.slice(0,100),last=events.at(-1);return Response.json({ok:true,events,next:results.results.length>100&&last?last.at+'|'+last.id:null},{headers:{"Cache-Control":"no-store"}});
 }catch{return reply("Activity history could not be loaded.",503);}
}
