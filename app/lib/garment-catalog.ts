import type { ArtworkAttachment, MeasurementPolicy, ProductPolicy, SeikoOrder } from './order-domain';
import { commerceOf, type PriceRule } from './order-commerce';
import { stableLibraryId, type ProductLibraryRecord } from './business-library';

export type CatalogPrice = { label: string; rate: number; basis: 'set'|'person'|'product'|'fixed'; taxRate: number; hsnSac: string; conditions?:{fieldName:string;match:string}[]; conditionMode?:'all'|'any' };
export type CatalogGarment = { name:string; sizeHeader:string; specifications:Array<{name:string;role:'colour'|'pattern'|'attribute'|'asset';value:string;required:boolean;attachments:ArtworkAttachment[]}>; measurements:Array<Pick<MeasurementPolicy,'name'|'type'|'requiredMode'>> };
export type CatalogEntry = {
  id:string; kind:'garment'|'set'; name:string; category:string; archived:boolean;
  familyId?:string; familyName?:string; aliases?:string[];
  garment?:CatalogGarment; components:Array<{garmentId:string;quantity:number;alternatives:string[]}>;
  prices:CatalogPrice[]; images:ArtworkAttachment[]; sourceOrderIds:string[];
  version:number; updatedAt:string; updatedBy?:string;
};
export const catalogCacheKey=(businessId='seiko')=>`jinam:${businessId}:catalog:v1`;
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const norm=(value:string)=>value.trim().toLocaleLowerCase().replace(/\s+/g,' ');
export const catalogFamilyId=(name:string)=>stableLibraryId('family',name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,''));
export function catalogFamilies(entries:CatalogEntry[]){const groups=new Map<string,{id:string;name:string;aliases:string[];variants:CatalogEntry[]}>();for(const entry of entries.filter(e=>e.kind==='garment')){const name=entry.familyName||entry.garment?.name||entry.name,id=entry.familyId||catalogFamilyId(name);const group=groups.get(id)||{id,name,aliases:[],variants:[]};group.variants.push(entry);group.aliases=[...new Set([...group.aliases,...entry.aliases||[]])];groups.set(id,group);}return [...groups.values()];}
const nameKey=(s:string)=>s.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function standardProduct(entries:CatalogEntry[],name:string){const matches=catalogFamilies(entries.filter(e=>!e.archived)).filter(f=>[f.name,...f.aliases].some(alias=>nameKey(alias)===nameKey(name)));return matches.length===1?matches[0]:undefined;}
export function catalogTerms(entries:CatalogEntry[],role:string){const values=new Map<string,string>();for(const entry of entries.filter(e=>!e.archived))for(const s of entry.garment?.specifications||[])if(s.role===role&&s.value.trim()&&!values.has(nameKey(s.value)))values.set(nameKey(s.value),s.value.trim());return [...values.values()].sort((a,b)=>a.localeCompare(b));}
const signature=(value:unknown)=>stableLibraryId('catalog',JSON.stringify(value));
function catalogFingerprint(familyId:string,g:CatalogGarment){const sorted=(values:unknown[])=>values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return signature({familyId,name:norm(g.name),sizeHeader:norm(g.sizeHeader),specifications:sorted(g.specifications.map(s=>({name:norm(s.name),role:s.role,value:norm(s.value),required:s.required,attachments:s.attachments.map(f=>f.storageKey).sort()}))),measurements:sorted(g.measurements.map(m=>({name:norm(m.name),type:m.type,requiredMode:m.requiredMode})))});}
export function sameCatalogVariant(a:CatalogEntry,b:CatalogEntry){return Boolean(a.garment&&b.garment&&(a.familyId||catalogFamilyId(a.garment.name))===(b.familyId||catalogFamilyId(b.garment.name))&&catalogFingerprint(a.familyId||catalogFamilyId(a.garment.name),a.garment)===catalogFingerprint(b.familyId||catalogFamilyId(b.garment.name),b.garment)&&a.images.map(f=>f.storageKey).sort().join('|')===b.images.map(f=>f.storageKey).sort().join('|'));}
export function sameCatalogSet(a:CatalogEntry,b:CatalogEntry){const key=(e:CatalogEntry)=>JSON.stringify(e.components.map(c=>({...c,alternatives:[...c.alternatives].sort()})).sort((x,y)=>x.garmentId.localeCompare(y.garmentId)));return a.kind==='set'&&b.kind==='set'&&norm(a.name)===norm(b.name)&&key(a)===key(b);}
export function garmentSnapshot(order:SeikoOrder,product:ProductPolicy):CatalogGarment {
  return {name:product.name.trim(),sizeHeader:product.sizeHeader||'Size',specifications:product.specifications.map(s=>({name:s.name,role:s.role,value:s.mode==='same_for_all'||s.mode==='default_with_exceptions'?s.defaultValue:'',required:s.required,attachments:copy((s.attachments||[]).filter(f=>f.storageKey.startsWith('shared:')))})),measurements:order.measurements.filter(m=>m.appliesTo.includes(product.id)).map(m=>({name:m.name,type:m.type,requiredMode:m.requiredMode==='Always'?'Always':m.requiredMode==='Optional'?'Optional':'When present'}))};
}
export function catalogFromOrders(orders:SeikoOrder[],legacy:ProductLibraryRecord[]=[],known:CatalogEntry[]=[]):CatalogEntry[] {
  const entries=new Map<string,CatalogEntry>();
  const add=(entry:CatalogEntry)=>{const prior=entries.get(entry.id);entries.set(entry.id,prior?{...prior,prices:[...prior.prices,...entry.prices.filter(p=>!prior.prices.some(v=>JSON.stringify(v)===JSON.stringify(p)))],sourceOrderIds:[...new Set([...prior.sourceOrderIds,...entry.sourceOrderIds])]}:entry);};
  for(const order of orders){
    const ids=new Map<string,string>();
    for(const product of order.products.filter(p=>p.name.trim())){
      const standard=standardProduct(known,product.name),garment=garmentSnapshot(order,product),familyName=standard?.name||product.catalogFamilyName||product.name.trim(),familyId=standard?.id||product.catalogFamilyId||catalogFamilyId(familyName);garment.name=familyName;for(const spec of garment.specifications){spec.value=catalogTerms(known,spec.role).find(value=>nameKey(value)===nameKey(spec.value))||spec.value.trim();}const snapshot=catalogFingerprint(familyId,garment),existing=known.find(e=>e.garment&&!e.images.length&&(e.familyId||catalogFamilyId(e.garment.name))===familyId&&catalogFingerprint(familyId,e.garment)===snapshot),id=product.catalogEntryId&&product.catalogSnapshotSignature===snapshot?product.catalogEntryId:existing?.id||snapshot;ids.set(product.id,id);
      add({id,kind:'garment',familyId,familyName,name:[garment.name,...garment.specifications.filter(s=>s.value).map(s=>s.value)].join(' · '),category:'',garment,components:[],prices:[],images:[],archived:false,sourceOrderIds:[order.orderId],version:0,updatedAt:order.updatedAt});
    }
    for(const rule of commerceOf(order).rules){
      if(!rule.contents.length||rule.contents.some(c=>!ids.has(c.productId)||(c.alternatives||[]).some(id=>!ids.has(id))))continue;
      const components=rule.contents.map(c=>({garmentId:ids.get(c.productId)!,quantity:c.quantity,alternatives:(c.alternatives||[]).map(id=>ids.get(id)!)}));
      const price:CatalogPrice={label:rule.name||'Standard',rate:rule.rate,basis:rule.mode==='package'?(rule.packageCharge==='set'?'set':'person'):rule.mode,taxRate:rule.taxRate,hsnSac:rule.hsnSac};
      const conditions=rule.conditions?.length?rule.conditions:rule.fieldId?[{fieldId:rule.fieldId,match:rule.match}]:[];
      if(conditions.length){price.conditions=conditions.map(c=>({fieldName:order.fields.find(f=>f.id===c.fieldId.replace(/^field:/,''))?.name||'',match:c.match}));price.conditionMode=rule.conditionMode||'all';}
      const scope=(rule.conditions||[]).map(c=>`${order.fields.find(f=>f.id===c.fieldId.replace(/^field:/,''))?.name||'Group'}: ${c.match}`).join(' / ')||rule.match;
      if(scope)price.label+=' · '+scope;
      if(rule.mode==='product'&&components.length===1){const entry=entries.get(components[0].garmentId)!;if(!entry.prices.some(p=>JSON.stringify(p)===JSON.stringify(price)))entry.prices.push(price);continue;}
      const name=rule.name.trim()||components.map(c=>entries.get(c.garmentId)?.name).join(' + ');
      const set:CatalogEntry={id:signature({components,name:norm(name)}),kind:'set',name,category:'',components,prices:[price],images:[],archived:false,sourceOrderIds:[order.orderId],version:0,updatedAt:order.updatedAt};set.id=known.find(e=>sameCatalogSet(e,set))?.id||set.id;add(set);
    }
  }
  for(const record of legacy.filter(p=>!p.archived)){
    if([...entries.values()].some(e=>e.kind==='garment'&&norm(e.name)===norm(record.name)))continue;
    add({id:signature({legacy:record.id}),kind:'garment',familyId:catalogFamilyId(record.name),familyName:record.name,name:record.name,category:record.category,garment:{name:record.name,sizeHeader:'Size',specifications:[],measurements:[]},components:[],prices:record.sellingPrice?[{label:'Standard',rate:record.sellingPrice,basis:'product',taxRate:record.taxRate,hsnSac:record.hsnSac}]:[],images:[],archived:false,sourceOrderIds:record.sourceOrderIds,version:0,updatedAt:record.updatedAt});
  }
  const all=[...entries.values()],garments=all.filter(entry=>entry.kind==='garment'&&catalogErrors(entry,all).length===0);return [...garments,...all.filter(entry=>entry.kind==='set'&&catalogErrors(entry,garments).length===0)];
}
export function catalogErrors(entry:CatalogEntry,all:CatalogEntry[]):string[]{
  const errors:string[]=[];
  if(!entry||!['garment','set'].includes(entry.kind)||!entry.name?.trim()||entry.name.length>160)errors.push('Enter a Catalog Name up to 160 characters.');
  if(entry.kind==='garment'&&(!entry.garment||!entry.garment.name?.trim()))errors.push('Enter the garment name.');
  if(entry.kind==='garment'&&entry.familyName&&(!entry.familyName.trim()||entry.familyName.length>160||entry.familyId!==catalogFamilyId(entry.familyName)))errors.push('Choose a valid main product for this variant.');
  if(entry.aliases?.some(a=>!a.trim()||catalogFamilies(all.filter(e=>e.id!==entry.id)).some(f=>f.id!==entry.familyId&&[f.name,...f.aliases].some(v=>nameKey(v)===nameKey(a)))))errors.push('An abbreviation must belong to only one main product.');
  if(!Array.isArray(entry.sourceOrderIds)||entry.sourceOrderIds.some(id=>typeof id!=='string'||id.length>120))errors.push('Invalid source order references.');
  if(entry.kind==='set'&&(!entry.components?.length||entry.components.some(c=>!Number.isSafeInteger(c.quantity)||c.quantity<1||![c.garmentId,...c.alternatives].every(id=>all.some(e=>e.id===id&&e.kind==='garment')))))errors.push('Choose valid garments and whole quantities for every set component.');
  const used=entry.components?.flatMap(c=>[c.garmentId,...c.alternatives])||[];
  if(new Set(used).size!==used.length)errors.push('A garment can appear only once in a set, including alternatives.');
  if(!Array.isArray(entry.prices)||entry.prices.some(p=>!['set','person','product','fixed'].includes(p.basis)||!Number.isFinite(p.rate)||p.rate<0||!Number.isFinite(p.taxRate)||p.taxRate<0||p.taxRate>100||!p.label?.trim()||(entry.kind==='garment'&&p.basis!=='product')||(entry.kind==='set'&&p.basis==='product')))errors.push('Complete each price with a valid rate, tax and charge basis.');
  if(entry.garment?.measurements.some(m=>!m.name.trim()||!['number','text'].includes(m.type)||!['Optional','When present','Always'].includes(m.requiredMode)))errors.push('Complete the measurement definitions.');
  if(entry.prices.some(p=>p.conditions?.some(c=>!c.fieldName?.trim()||!c.match?.trim())))errors.push('Complete the reusable price conditions.');
  if(entry.garment?.specifications.some(s=>!s.name.trim()||!['colour','pattern','attribute','asset'].includes(s.role)||(s.attachments||[]).some(f=>!f.storageKey?.startsWith('shared:'))))errors.push('Complete specification names, types and shared attachments.');
  if((entry.images||[]).some(f=>!f.storageKey?.startsWith('shared:')))errors.push('Upload Catalog images to shared storage.');
  return errors;
}
/** Copy definitions only. Never copy students, assignments or source-order condition IDs. */
export function applyCatalogEntry(order:SeikoOrder,entry:CatalogEntry,all:CatalogEntry[],priceIndex=-1):SeikoOrder {
  const next=copy(order),mapping=new Map<string,string>();
  const add=(id:string)=>{if(mapping.has(id))return mapping.get(id)!;const existing=next.products.find(p=>p.catalogEntryId===id);if(existing){mapping.set(id,existing.id);return existing.id;}const item=all.find(e=>e.id===id&&!e.archived&&e.kind==='garment');if(!item?.garment)throw new Error('A garment in this set is missing or archived. Restore it in Catalog first.');const g=item.garment,pid=crypto.randomUUID();mapping.set(id,pid);
    const component=entry.components.find(c=>c.garmentId===id||c.alternatives.includes(id));
    next.products.push({id:pid,catalogEntryId:id,catalogFamilyId:item.familyId||catalogFamilyId(g.name),catalogFamilyName:item.familyName||g.name,name:g.name,sizeHeader:g.sizeHeader,quantityMode:component?.alternatives.length?'per_person':'same_for_all',defaultQuantity:component?.alternatives.length?0:component?.quantity||1,orderTotal:0,quantityGroupRules:[],specifications:[...g.specifications.map(s=>({id:crypto.randomUUID(),name:s.name,role:s.role,mode:'same_for_all' as const,defaultValue:s.value,required:s.required,groupRules:[],attachments:copy(s.attachments)})),...(item.images.length?[{id:crypto.randomUUID(),name:'Reference Images',role:'asset' as const,mode:'same_for_all' as const,defaultValue:'',required:false,groupRules:[],attachments:copy(item.images)}]:[])]});
    next.measurements.push(...g.measurements.map(m=>({...m,id:crypto.randomUUID(),appliesTo:[pid]})));const added=next.products.at(-1)!;added.catalogSnapshotSignature=catalogFingerprint(added.catalogFamilyId!,garmentSnapshot(next,added));return pid;};
  const contents=entry.kind==='garment'?[{productId:add(entry.id),quantity:1}]:entry.components.map(c=>({productId:add(c.garmentId),quantity:c.quantity,alternatives:c.alternatives.map(add)}));
  const price=entry.prices[priceIndex];
  if(entry.kind==='set'&&entry.images.length&&contents[0])next.products.find(p=>p.id===contents[0].productId)!.specifications.push({id:crypto.randomUUID(),name:entry.name+' Reference Images',role:'asset',mode:'same_for_all',defaultValue:'',required:false,groupRules:[],attachments:copy(entry.images)});
  if(price){const conditions=price.conditions?.map(c=>{const matches=next.fields.filter(f=>norm(f.name)===norm(c.fieldName));if(matches.length!==1)throw new Error('Add one Person Detail named '+c.fieldName+' before using this price, or add garments without pricing.');return {fieldId:matches[0].id,match:c.match};});const rule:PriceRule={id:crypto.randomUUID(),name:entry.name,mode:price.basis==='set'||price.basis==='person'?'package':price.basis,packageCharge:price.basis==='set'?'set':price.basis==='person'?'person':undefined,rate:price.rate,taxRate:price.taxRate,hsnSac:price.hsnSac,fieldId:'',match:'',...(conditions?.length?{conditions,conditionMode:price.conditionMode||'all'}:{}),contents:price.basis==='fixed'?[]:contents};next.commerce={...commerceOf(next),rules:[...commerceOf(next).rules,rule]};}
  return next;
}
