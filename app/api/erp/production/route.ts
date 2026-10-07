import { env } from 'cloudflare:workers';
import { authenticateActor, authorizePermission } from '../../../lib/server-erp-auth';
import { completedQuantity, productionDemand, reserveMembers, validateRelease, type ProductionHandoff, type ProductionLedger, type ProductionOrder } from '../../../lib/production-handoffs';

const collection = 'production-handoffs-v1';
const reply = (message:string,status=400) => Response.json({ok:false,message},{status,headers:{'Cache-Control':'no-store'}});
type Body = { businessId?:string; operation?:string; expectedVersion?:number; handoff?:ProductionHandoff; id?:string; reason?:string; event?:{allocationKey:string;operation:string;quantity:number;rejects:number;extras:number;reason:string} };
export async function POST(request:Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply('Invalid request origin.',403);
  try {
    const actor = await authenticateActor(request);
    if (!actor) return reply('Sign in is required.',401);
    const reader=request.body?.getReader(); const chunks:Uint8Array[]=[]; let size=0;
    if(reader) for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024*1024){await reader.cancel();return reply('Handoff request is too large.',413);}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let body:Body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply('Invalid request.');}
    if(!body||typeof body!=="object"||Array.isArray(body))return reply("Invalid request.");
    const business=body.businessId;
    if (!business || !['seiko','meth','veyn-health'].includes(business)) return reply('Select a valid business.');
    if (!await authorizePermission(actor,business,'production.view') || !await authorizePermission(actor,business,'orders.view')) return reply('You cannot view production for this business.',403);
    const db=env.DB?.withSession('first-primary'); if(!db)return reply('Shared production storage is unavailable.',503);
    const records=await db.prepare('SELECT id,document_json,version FROM jinam_shared_records WHERE scope=? AND collection=? ORDER BY created_at,id').bind(business,collection).all<{id:string;document_json:string;version:number}>();
    const stored=records.results.find(row=>row.id==='ledger');
    const ledger:ProductionLedger={handoffs:records.results.filter(row=>row.id!=='ledger').map(row=>JSON.parse(row.document_json))};
    const version=stored?.version||0;
    const result=await db.prepare("SELECT document_json,version FROM erp_orders WHERE business_id=? AND archived=0 AND json_extract(document_json,'$.deletedAt') IS NULL").bind(business).all<{document_json:string;version:number}>();
    const orders:ProductionOrder[]=result.results.map(row=>({order:JSON.parse(row.document_json),version:row.version}));
    if(body.operation==='list')return Response.json({ok:true,ledger,version,orders},{headers:{'Cache-Control':'no-store'}});
    if(!await authorizePermission(actor,business,'production.manage'))return reply('You cannot change production for this business.',403);
    if(body.expectedVersion!==version)return reply('Production changed on another device. Your open edits remain; refresh and review before retrying.',409);
    const now=new Date().toISOString();let target:ProductionHandoff|undefined;
    const guards:ProductionOrder[]=[];
    if(body.operation==='save'){
      const input=body.handoff;
      if(!input || input.id==='ledger' || typeof input.id!=='string' || input.id.length>100 || !input.id || typeof input.name!=='string' || !input.name.trim() || !Array.isArray(input.allocations) || !Array.isArray(input.lays) || input.allocations.length>3000 || input.lays.length>100)return reply('Invalid handoff.');
      const previous=ledger.handoffs.find(item=>item.id===input.id);
      if(previous && previous.status!=='Draft')return reply('Released handoffs are fixed. Create an additional handoff for changes.',409);
      if(!['normal','rework','extra'].includes(input.purpose)||typeof input.reason!=='string')return reply('Invalid handoff purpose.');
      const demand=productionDemand(orders);const seen=new Set<string>();
      const allocations=[];
      for(const row of input.allocations){
        const source=demand.find(item=>item.key===row.key);
        if(!source || seen.has(row.key) || !Number.isSafeInteger(row.quantity)||row.quantity<=0||row.quantity>100000||typeof row.lay!=='string'||typeof row.stack!=='string')return reply('Review the allocation quantities and refresh changed orders.');
        if(source.sourceVersion!==row.sourceVersion)return reply('A source order changed. Refresh demand and review quantities.',409);
        seen.add(row.key);allocations.push({...source,quantity:row.quantity,lay:row.lay,stack:row.stack});
      }
      const layIds=new Set<string>();
      for(const lay of input.lays){if(typeof lay.id!=='string'||!lay.id||layIds.has(lay.id)||['pattern','fabric','width','stretch','grain','direction','checks'].some(key=>typeof lay[key as keyof typeof lay]!=='string')||typeof lay.confirmed!=='boolean')return reply('Invalid cutting lay.');layIds.add(lay.id);}
      target={id:input.id,number:previous?.number||`PH-${String(ledger.handoffs.length+1).padStart(5,'0')}`,name:input.name.trim(),status:'Draft',purpose:input.purpose,reason:input.reason,allocations,lays:input.lays,events:[],createdAt:previous?.createdAt||now,history:[...(previous?.history||[]),{at:now,actor:actor.email,action:'Draft saved'}]};
      if(previous)ledger.handoffs=ledger.handoffs.map(item=>item.id===target!.id?target!:item);else ledger.handoffs.push(target);
    }else{
      target=ledger.handoffs.find(item=>item.id===body.id);if(!target)return reply('Handoff not found.',404);
      if(body.operation==='release'){
        if(target.status!=='Draft')return reply('Only a draft can be released.',409);
        try{const demand=productionDemand(orders);validateRelease(target,ledger,demand);reserveMembers(target,ledger,demand);}catch(error){return reply((error as Error).message,409);}
        guards.push(...orders.filter(item=>target!.allocations.some(row=>row.orderId===item.order.orderId)));
        target.status='Released';
      }else if(body.operation==='event'){
        if(!['Released','In progress'].includes(target.status))return reply('Only released or active handoffs can record work.',409);
        const event=body.event;const row=target.allocations.find(item=>item.key===event?.allocationKey);
        if(!row || !event || typeof event.operation!=='string'||!event.operation.trim()||event.operation.length>80||[event.quantity,event.rejects,event.extras].some(value=>!Number.isSafeInteger(value)||value<0)||event.quantity+event.rejects+event.extras===0)return reply('Enter an operation and positive whole quantities.');
        if(event.quantity+completedQuantity(target,row.key,event.operation.trim())>row.quantity)return reply('Completed quantity exceeds this allocation. Record authorised extras separately.');
        if((event.rejects||event.extras)&&!event.reason?.trim())return reply('Explain rejects or authorised extras.');
        target.events.push({...event,id:crypto.randomUUID(),operation:event.operation.trim(),at:now,actor:actor.email});target.status='In progress';
      }else if(body.operation==='close'){
        if(!['Released','In progress'].includes(target.status)||!body.reason?.trim())return reply('Provide a closure note for a released handoff.');
        target.status='Closed';
      }else if(body.operation==='cancel'){
        if(target.events.length || ['Closed','Cancelled'].includes(target.status)||!body.reason?.trim())return reply('Only unused handoffs can be cancelled, with a reason.');
        target.status='Cancelled';
      }else return reply('Choose a valid production operation.');
      target.history.push({at:now,actor:actor.email,action:`${body.operation}${body.reason?`: ${body.reason}`:''}`});
    }
    const json=JSON.stringify(target);
    if(new TextEncoder().encode(json).length>1536*1024)return reply('This handoff reached its history limit. Existing work is preserved; split further work into a new handoff.',413);
    if(new Set(target!.allocations.map(row=>row.orderId)).size>25)return reply('Use at most 25 orders in one handoff; split larger groups.');
    // A small business revision lock serialises claims, while each handoff has its own durable row.
    // The random nonce makes a losing CAS incapable of writing another request's handoff.
    const nonce=crypto.randomUUID(),lock=JSON.stringify({nonce});
    const condition=guards.map(()=>" AND EXISTS(SELECT 1 FROM erp_orders WHERE business_id=? AND id=? AND version=? AND archived=0 AND json_extract(document_json,'$.deletedAt') IS NULL)").join('');
    const args=guards.flatMap(item=>[business,item.order.orderId,item.version]);
    const claim=stored
      ? db.prepare(`UPDATE jinam_shared_records SET document_json=?,version=version+1,updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE scope=? AND collection=? AND id='ledger' AND version=?${condition}`).bind(lock,now,actor.userId,actor.email,business,collection,version,...args)
      : db.prepare("INSERT INTO jinam_shared_records(scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email) VALUES(?,?,'ledger',?,1,?,?,?,?) ON CONFLICT(scope,collection,id) DO NOTHING").bind(business,collection,lock,now,now,actor.userId,actor.email);
    const write=db.prepare(`INSERT INTO jinam_shared_records(scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email)
      SELECT ?,?,?,?,1,?,?,?,? WHERE EXISTS(SELECT 1 FROM jinam_shared_records WHERE scope=? AND collection=? AND id='ledger' AND version=? AND json_extract(document_json,'$.nonce')=?)
      ON CONFLICT(scope,collection,id) DO UPDATE SET document_json=excluded.document_json,version=jinam_shared_records.version+1,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id,updated_by_email=excluded.updated_by_email`)
      .bind(business,collection,target!.id,json,target!.createdAt,now,actor.userId,actor.email,business,collection,version+1,nonce);
    const written=await db.batch([claim,write]);
    if(!written[0].meta?.changes||!written[1].meta?.changes)return reply('Production or a source order changed. Refresh and review before retrying.',409);
    return Response.json({ok:true,ledger,version:version+1,orders},{headers:{'Cache-Control':'no-store'}});
  }catch{return reply('Shared production storage is unreachable. Your open edits remain; retry when connected.',503);}
}
