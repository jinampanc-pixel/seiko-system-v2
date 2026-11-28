import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { applyWorkflowCommand, DEFAULT_ORDER_ACTIONS, type OrderActionType, type OrderWorkflow, type WorkflowCommand } from "../../../lib/order-workflow";
import { ORDER_STATUSES } from "../../../lib/order-statuses";
const collection="order-tracking-v1";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status});
export async function POST(request:Request){
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return fail("Invalid origin.",403);
 try{
  const actor=await authenticateActor(request);if(!actor)return fail("Sign in required.",401);
  const reader=request.body?.getReader();let size=0,text="";const decoder=new TextDecoder();if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20000){await reader.cancel();return fail("Request too large.",413);}text+=decoder.decode(part.value,{stream:true});}
  let body:{businessId?:string;operation?:string;orderId?:string;orderIds?:string[];command?:WorkflowCommand;requestedBy?:string};try{body=JSON.parse(text);}catch{return fail("Invalid request.");}
  if(!body||typeof body.businessId!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/.test(body.businessId))return fail("Choose a business.");
  if(body.requestedBy&&body.requestedBy!==actor.email)return fail("The signed-in user changed. Retry in the current session.",403);
  const business=body.businessId;
  if(!await authorizePermission(actor,business,"orders.view"))return fail("Order access required.",403);
  const canEdit=Boolean(await authorizePermission(actor,business,"orders.edit"));
  const db=env.DB?.withSession("first-primary");if(!db)return fail("Tracking storage unavailable.",503);
  if(body.operation==="list"){
   const ids=body.orderIds;if(!Array.isArray(ids)||!ids.length||ids.length>25||ids.some(id=>typeof id!=="string"||!id||id.length>128))return fail("Choose up to 25 orders.");
   const placeholders=ids.map(()=>"?").join(",");
   const existing=await db.prepare(`SELECT id FROM erp_orders WHERE business_id=? AND id IN (${placeholders}) AND json_extract(document_json,'$.deletedAt') IS NULL`).bind(business,...ids).all<{id:string}>();
   const rows=await db.prepare(`SELECT id,document_json,version FROM jinam_shared_records WHERE scope=? AND collection=? AND id IN (${placeholders})`).bind(business,collection,...ids).all<{id:string;document_json:string;version:number}>();
   return Response.json({ok:true,canEdit,records:existing.results.map(order=>{const row=rows.results.find(r=>r.id===order.id);return {orderId:order.id,workflow:row?JSON.parse(row.document_json):{notes:[],actions:[]},version:row?.version||0};})},{headers:{"Cache-Control":"no-store"}});
  }
  if(body.operation!=="update"||typeof body.orderId!=="string"||!body.orderId||body.orderId.length>128||!body.command)return fail("Choose an order and tracking update.");
  if(!canEdit)return fail("You cannot edit order tracking.",403);
  const orderId=body.orderId;
  if(!await db.prepare("SELECT id FROM erp_orders WHERE business_id=? AND id=? AND json_extract(document_json,'$.deletedAt') IS NULL").bind(business,orderId).first())return fail("Order unavailable.",404);
  let command=body.command;
  if(command.kind==="status"&&!(ORDER_STATUSES as readonly string[]).includes(command.value))return fail("Choose a valid tracking status.");
  if(command.kind==="action"){
   const row=await db.prepare("SELECT value_json FROM erp_preferences WHERE business_id=? AND key='order.action-types.v1'").bind(business).first<{value_json:string}>();
   const types:OrderActionType[]=row?JSON.parse(row.value_json):DEFAULT_ORDER_ACTIONS,typeId=command.typeId,type=types.find(t=>t.id===typeId&&!t.deletedAt);
   if(!type)return fail("Choose an active action name.");command={...command,name:type.name};
  }
  for(let attempt=0;attempt<3;attempt++){
   const row=await db.prepare("SELECT document_json,version FROM jinam_shared_records WHERE scope=? AND collection=? AND id=?").bind(business,collection,orderId).first<{document_json:string;version:number}>();
   const current:OrderWorkflow=row?JSON.parse(row.document_json):{notes:[],actions:[]},now=new Date().toISOString();
   let next:OrderWorkflow;try{next=applyWorkflowCommand(current,command,actor.email,now);}catch(cause){return fail((cause as Error).message);}
   const json=JSON.stringify(next);
   if(json===JSON.stringify(current))return Response.json({ok:true,canEdit,record:{orderId,workflow:current,version:row?.version||0}},{headers:{"Cache-Control":"no-store"}});
   if(new TextEncoder().encode(json).length>600000)return fail("This tracking record is full. Its existing notes are preserved.");
   const result=row?await db.prepare("UPDATE jinam_shared_records SET document_json=?,version=version+1,updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE scope=? AND collection=? AND id=? AND version=? AND EXISTS(SELECT 1 FROM erp_orders WHERE business_id=? AND id=? AND json_extract(document_json,'$.deletedAt') IS NULL)").bind(json,now,actor.userId,actor.email,business,collection,orderId,row.version,business,orderId).run():await db.prepare("INSERT INTO jinam_shared_records(scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email) SELECT ?,?,?,?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM erp_orders WHERE business_id=? AND id=? AND json_extract(document_json,'$.deletedAt') IS NULL) ON CONFLICT(scope,collection,id) DO NOTHING").bind(business,collection,orderId,json,now,now,actor.userId,actor.email,business,orderId).run();
   if(result.meta?.changes)return Response.json({ok:true,canEdit,record:{orderId,workflow:next,version:(row?.version||0)+1}},{headers:{"Cache-Control":"no-store"}});
  }
  return fail("Another tracking update arrived. Retry; your text remains open.",409);
 }catch{return fail("Tracking is temporarily unavailable. Order operations are unchanged.",503);}
}
