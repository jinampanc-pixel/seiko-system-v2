import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { actionName, DEFAULT_ORDER_ACTIONS, type OrderActionType } from "../../../lib/order-workflow";
const key="order.action-types.v1";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status});
export async function POST(request:Request){
  if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return fail("Invalid origin.",403);
  try{
    const actor=await authenticateActor(request);if(!actor)return fail("Sign in required.",401);
    const reader=request.body?.getReader();let bytes=0,text="";const decoder=new TextDecoder();if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>16000){await reader.cancel();return fail("Request too large.",413);}text+=decoder.decode(part.value,{stream:true});}
    let body:{businessId?:string;operation?:string;name?:string;id?:string;expectedVersion?:number};try{body=JSON.parse(text);}catch{return fail("Invalid request.");}
    if(!body||typeof body.businessId!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/.test(body.businessId))return fail("Choose a business.");
    const business=body.businessId;if(!await authorizePermission(actor,business,"orders.view"))return fail("Order access required.",403);
    const canManage=Boolean(await authorizePermission(actor,business,"suggestions.manage"));
    const canAdd=Boolean(await authorizePermission(actor,business,"orders.edit"));
    const db=env.DB?.withSession("first-primary");if(!db)return fail("Shared storage unavailable.",503);
    const row=await db.prepare("SELECT value_json,version FROM erp_preferences WHERE business_id=? AND key=?").bind(business,key).first<{value_json:string;version:number}>();
    const version=row?.version||0,types:OrderActionType[]=row?JSON.parse(row.value_json):DEFAULT_ORDER_ACTIONS.map(item=>({...item}));
    const respond=(items=types,nextVersion=version)=>Response.json({ok:true,types:items,version:nextVersion,canManage,canAdd},{headers:{"Cache-Control":"no-store"}});
    if(body.operation==="list")return respond();
    if(body.operation==="create"?!canAdd:!canManage)return fail("You cannot manage these action names.",403);
    let next=[...types];
    if(["create","rename"].includes(body.operation||"")&&(typeof body.name!=="string"||!body.name.trim()||body.name.trim().replace(/\s+/g," ").length>120))return fail("Enter an action name up to 120 characters.");
    if(body.operation==="create"){
      const name=actionName(body.name),existing=types.find(t=>t.name.toLocaleLowerCase()===name.toLocaleLowerCase());
      if(existing){if(existing.deletedAt)return fail("This action name was retired. Restore it in Action Names or choose another name.",409);return respond();}
      if(types.length>=200)return fail("The action-name library is full. Rename or reuse an existing action.");
      next.push({id:crypto.randomUUID(),name});
    }else{
      const target=types.find(item=>item.id===body.id);if(!target)return fail("Action name not found.",404);
      if(body.operation==="rename"){
        const name=actionName(body.name);if(types.some(t=>t.id!==target.id&&t.name.toLocaleLowerCase()===name.toLocaleLowerCase()))return fail("That action name already exists.",409);
        next=types.map(t=>t.id===target.id?{...t,name}:t);
      }else if(body.operation==="delete")next=types.map(t=>t.id===target.id?{...t,deletedAt:t.deletedAt||new Date().toISOString()}:t);
      else if(body.operation==="restore")next=types.map(t=>{const copy={...t};if(t.id===target.id)delete copy.deletedAt;return copy;});
      else return fail("Choose a valid library action.");
    }
    if(body.expectedVersion!==version)return fail("Action names changed. Reload before saving.",409);
    const now=new Date().toISOString(),json=JSON.stringify(next);
    const result=row?await db.prepare("UPDATE erp_preferences SET value_json=?,version=version+1,updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE business_id=? AND key=? AND version=?").bind(json,now,actor.userId,actor.email,business,key,version).run():await db.prepare("INSERT INTO erp_preferences(business_id,key,value_json,version,updated_at,updated_by_user_id,updated_by_email) VALUES(?,?,?,1,?,?,?) ON CONFLICT(business_id,key) DO NOTHING").bind(business,key,json,now,actor.userId,actor.email).run();
    if(!result.meta?.changes)return fail("Action names changed. Reload before saving.",409);
    return respond(next,version+1);
  }catch(cause){return fail((cause as Error).message||"Action names could not be saved.",503);}
}
