import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { emptyBillingProfile, validateBillingProfile, type BillingProfile } from "../../../lib/billing-profile";

const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return fail("Invalid request origin.",403);
  const actor = await authenticateActor(request);
  if (!actor) return fail("Sign in is required.",401);
  const member = await authorizePermission(actor,"seiko","financials.view");
  if (!member) return fail("You cannot view billing settings.",403);
  const reader = request.body?.getReader(); const chunks: Uint8Array[]=[]; let size=0;
  if (reader) for (;;) { const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1_000_000){await reader.cancel();return fail("Assets are too large.",413);}chunks.push(part.value); }
  let body: { operation: string; profile?: BillingProfile; version?: number };
  try { const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}body=JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail("Invalid request."); }
  if (!env.DB) return fail("Shared storage is unavailable.",503);
  try {
    const db=env.DB.withSession("first-primary");
    const row=await db.prepare("SELECT value_json AS data,version FROM erp_preferences WHERE business_id='seiko' AND key='billing.profile.v1'").first<{data:string;version:number}>();
    const profile: BillingProfile=row?JSON.parse(row.data):emptyBillingProfile();
    const isOwner=member.role==="owner", canManage=isOwner||profile.managerEmails.includes(actor.email.toLowerCase());
    const canSign=canManage||Boolean(profile.signatoryEmails?.includes(actor.email.toLowerCase()));
    if(body.operation==="get")return Response.json({ok:true,profile,version:row?.version||0,isOwner,canManage,canSign},{headers:{"Cache-Control":"no-store"}});
    if(body.operation!=="save")return fail("Unknown operation.");
    if(!canManage)return fail("Only the owner or an authorised billing-settings manager can change these details.",403);
    if(!body.profile)return fail("Enter settings.");
    const problem=validateBillingProfile(body.profile);if(problem)return fail(problem);
    if(!isOwner && (JSON.stringify(body.profile.managerEmails)!==JSON.stringify(profile.managerEmails)||JSON.stringify(body.profile.signatoryEmails)!==JSON.stringify(profile.signatoryEmails)||body.profile.supplier.gstin!==profile.supplier.gstin))return fail("Only the owner can change GST details or asset access.",403);
    if(typeof body.version!=="number" || body.version!==(row?.version||0))return fail("Settings changed. Close and reopen before saving.",409);
    const now=new Date().toISOString(), json=JSON.stringify(body.profile);
    // Compare-and-swap; history captures the saved version in the same D1 batch.
    const result=await db.batch([
      db.prepare("INSERT INTO erp_preferences(business_id,key,value_json,version,updated_by_user_id,updated_by_email,updated_at) VALUES('seiko','billing.profile.v1',?,1,?,?,?) ON CONFLICT(business_id,key) DO UPDATE SET value_json=excluded.value_json,version=erp_preferences.version+1,updated_by_user_id=excluded.updated_by_user_id,updated_by_email=excluded.updated_by_email,updated_at=excluded.updated_at WHERE erp_preferences.version=?").bind(json,actor.userId,actor.email,now,body.version),
      db.prepare("INSERT INTO erp_audit_events(id,business_id,entity_type,entity_id,action,version,actor_user_id,actor_email,at,snapshot_json) SELECT ?,'seiko','billing-profile','billing.profile.v1','saved',version,updated_by_user_id,updated_by_email,updated_at,value_json FROM erp_preferences WHERE business_id='seiko' AND key='billing.profile.v1' AND version=? AND updated_by_email=? AND updated_at=?").bind(crypto.randomUUID(),body.version+1,actor.email,now),
    ]);
    if(!result[0].meta.changes)return fail("Settings changed. Reopen before saving.",409);
    return Response.json({ok:true,profile:body.profile,version:body.version+1,isOwner,canManage,canSign});
  }catch{return fail("Settings could not be saved or loaded. Retry when connected.",503);}
}
