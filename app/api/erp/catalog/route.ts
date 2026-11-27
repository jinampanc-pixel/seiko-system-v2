import { env } from 'cloudflare:workers';
import { authenticateActor, authorizePermission } from '../../../lib/server-erp-auth';
import { catalogErrors, sameCatalogVariant, sameCatalogSet, type CatalogEntry } from '../../../lib/garment-catalog';
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status});
export async function POST(request:Request){
  const url=new URL(request.url);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return fail('Invalid origin.',403);
  let body:{businessId?:string;operation?:string;entries?:CatalogEntry[]};
  try{body=await request.json();}catch{return fail('Invalid request.');}
  const business=body.businessId||'seiko';
  if(business!=='seiko')return fail('Catalog is available for SEIKO.',400);
  const actor=await authenticateActor(request);if(!actor)return fail('Sign in is required.',401);
  if(!await authorizePermission(actor,business,body.operation==='list'?'orders.view':'orders.setup'))return fail('You cannot manage this Catalog.',403);
  if(!env.DB)return fail('Shared Catalog storage is unavailable.',503);
  const db=env.DB.withSession('first-primary');
  const finance=Boolean(await authorizePermission(actor,business,'financials.view'));
  const managePrices=Boolean(await authorizePermission(actor,business,'billing.invoices.manage'));
  const rows=await db.prepare("SELECT value_json,version,updated_at,updated_by_email FROM erp_preferences WHERE business_id=? AND key LIKE 'catalog.entry.%'").bind(business).all<{value_json:string;version:number;updated_at:string;updated_by_email:string}>();
  const entries=(rows.results||[]).map(row=>({...JSON.parse(row.value_json),version:row.version,updatedAt:row.updated_at,updatedBy:row.updated_by_email})) as CatalogEntry[];
  const visible=(e:CatalogEntry)=>finance?e:{...e,prices:[]};
  if(body.operation==='list')return Response.json({ok:true,entries:entries.map(visible)},{headers:{'Cache-Control':'no-store'}});
  if(!['save','learn'].includes(body.operation||'')||!Array.isArray(body.entries)||body.entries.length>100)return fail('Choose up to 100 Catalog entries.');
  const incoming=body.entries;
  for(const entry of incoming){
    if(!entry||!/^[-a-zA-Z0-9]{1,90}$/.test(entry.id)||JSON.stringify(entry).length>180000)return fail('Invalid Catalog entry.');
    let errors:string[];try{errors=catalogErrors(entry,[...entries,...incoming]);}catch{return fail('Invalid Catalog details.');}if(errors.length)return fail(errors.join(' '));
    const old=entries.find(e=>e.id===entry.id);
    if(body.operation==='save'&&entry.kind==='garment'&&entries.some(e=>e.id!==entry.id&&sameCatalogVariant(e,entry)))return fail('This exact variant is already in Catalog. Edit the existing variant instead.',409);
    if(body.operation==='save'&&entry.kind==='set'&&entries.some(e=>e.id!==entry.id&&sameCatalogSet(e,entry)))return fail('This named set already exists. Edit its price options instead.',409);
    if(body.operation==='save'&&old&&old.version!==entry.version)return fail('This Catalog entry changed elsewhere. Close and reopen the editor before saving.',409);
    if(body.operation==='save'&&!managePrices&&entry.prices.length&&JSON.stringify(entry.prices)!==JSON.stringify(old?.prices||[]))return fail('You cannot change Catalog prices.',403);
  }
  for(const source of incoming){
    const old=entries.find(e=>e.id===source.id),now=new Date().toISOString();
    if(body.operation==='learn'&&old){
      const ids=[...new Set([...old.sourceOrderIds,...source.sourceOrderIds])];
      const prices=managePrices?[...old.prices,...source.prices.filter(p=>!old.prices.some(v=>JSON.stringify(v)===JSON.stringify(p)))]:old.prices;
      if(ids.length!==old.sourceOrderIds.length||prices.length!==old.prices.length){const result=await db.prepare('UPDATE erp_preferences SET value_json=?,version=version+1 WHERE business_id=? AND key=? AND version=?').bind(JSON.stringify({...old,prices,sourceOrderIds:ids}),business,'catalog.entry.'+old.id,old.version).run();if(!result.meta.changes)return fail('Catalog changed while learning. Updates will retry on refresh.',409);}
      continue;
    }
    const entry={...source,prices:managePrices?source.prices:old?.prices||[],version:undefined,updatedBy:undefined};
    if(old){const result=await db.prepare('UPDATE erp_preferences SET value_json=?,version=version+1,updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE business_id=? AND key=? AND version=?').bind(JSON.stringify(entry),now,actor.userId,actor.email,business,'catalog.entry.'+entry.id,old.version).run();if(!result.meta.changes)return fail('Catalog changed elsewhere. Reopen this entry.',409);}
    else {const result=await db.prepare('INSERT INTO erp_preferences(business_id,key,value_json,version,updated_at,updated_by_user_id,updated_by_email) VALUES(?,?,?,1,?,?,?) ON CONFLICT(business_id,key) DO NOTHING').bind(business,'catalog.entry.'+entry.id,JSON.stringify(entry),now,actor.userId,actor.email).run();if(body.operation==='save'&&!result.meta.changes)return fail('Catalog changed elsewhere. Reopen this entry.',409);}
  }
  return Response.json({ok:true});
}
