import { catalogCacheKey, catalogFromOrders, type CatalogEntry } from './garment-catalog';
import type { SeikoOrder } from './order-domain';
import type { ProductLibraryRecord } from './business-library';
export function cachedCatalog():CatalogEntry[]{try{return JSON.parse(localStorage.getItem(catalogCacheKey())||'[]');}catch{return [];}}
async function call(operation:string,entries?:CatalogEntry[]){const response=await fetch('/api/erp/catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,businessId:'seiko',entries})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||'Catalog could not be saved.');return result;}
export async function refreshCatalog():Promise<CatalogEntry[]>{const result=await call('list');try{localStorage.setItem(catalogCacheKey(),JSON.stringify(result.entries));}catch{/* shared data remains authoritative */}window.dispatchEvent(new Event('seiko:catalog-updated'));return result.entries;}
export async function saveCatalog(entry:CatalogEntry){await call('save',[entry]);try{return await refreshCatalog();}catch{const next=[...cachedCatalog().filter(e=>e.id!==entry.id),{...entry,version:entry.version+1,updatedAt:new Date().toISOString()}];try{localStorage.setItem(catalogCacheKey(),JSON.stringify(next));}catch{/* Shared save already succeeded. */}window.dispatchEvent(new Event('seiko:catalog-updated'));return next;}}
export async function saveCatalogDependencies(entries:CatalogEntry[]){for(let i=0;i<entries.length;i+=100)await call('learn',entries.slice(i,i+100));}
let learning:Promise<void>|null=null,lastLearned='';
export function learnCatalog(orders:SeikoOrder[],legacy:ProductLibraryRecord[]=[]):Promise<void>{
  if(learning)return learning.then(()=>learnCatalog(orders,legacy));
  const signature=JSON.stringify({orders:orders.map(o=>({id:o.orderId,products:o.products,measurements:o.measurements,fields:o.fields,rules:o.commerce?.rules})),legacy:legacy.map(p=>({id:p.id,name:p.name,sellingPrice:p.sellingPrice,taxRate:p.taxRate,hsnSac:p.hsnSac}))});
  if(signature===lastLearned)return Promise.resolve();
  learning=(async()=>{const known=await refreshCatalog(),entries=catalogFromOrders(orders,legacy,known);for(let i=0;i<entries.length;i+=100)await call('learn',entries.slice(i,i+100));await refreshCatalog();lastLearned=signature;})().finally(()=>{learning=null;});return learning;
}
