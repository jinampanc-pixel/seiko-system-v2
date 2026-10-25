import type { SheetColumn } from './order-sheet-model';
import { quantityForRecord, ruleConditions, predicateState, type SeikoOrder } from './order-domain';
export function missingEntryGroups(order:SeikoOrder,values:Record<string,string|number>){
 const record={recordId:'entry',personId:'',values},ids=new Set<string>();
 for(const p of order.products){const rules=[...(p.quantityMode==='by_group'?p.quantityGroupRules.map(rule=>({rule,field:p.quantityGroupFieldId})):[]),...(quantityForRecord(p,record)>0?p.specifications.filter(s=>s.mode==='by_group'&&!String(values['spec:'+s.id+':override']??'').trim()).flatMap(s=>s.groupRules.map(rule=>({rule,field:s.groupFieldId}))):[])];for(const {rule,field}of rules)if(predicateState(rule,record,field)==='pending')for(const c of ruleConditions(rule,field))ids.add(c.fieldId.replace(/^field:/,''));}
 return order.fields.filter(f=>ids.has(f.id)&&!String(values['field:'+f.id]??'').trim());
}
/** Label slots align equivalent headings while each cell retains its own stable field ID. */
export function measurementEntryGrid(columns:SheetColumn[],groups:[string,string][]){const headings:string[]=[];const rows=groups.map(([id,label])=>{const seen=new Map<string,number>(),cells=new Map<string,SheetColumn>();for(const c of columns.filter(c=>c.groupId===id&&!c.id.endsWith(':assigned_qty'))){const n=(seen.get(c.label)||0)+1;seen.set(c.label,n);const key=c.label+(n>1?' ('+n+')':'');cells.set(key,c);if(!headings.includes(key))headings.push(key);}return {id,label,cells};});return {headings,rows};}

/** Place a formerly shared column under its only remaining product without changing its stored key. */
export function entryDisplayColumns(order:SeikoOrder,columns:SheetColumn[]):SheetColumn[]{return columns.flatMap(column=>{const m=order.measurements.find(m=>column.id.startsWith('measurement:'+m.id+':'));if(!m)return [column];const products=order.products.filter(p=>m.appliesTo.includes(p.id));if(!products.length)return [];if(m.shared&&products.length===1)return [{...column,groupId:'product:'+products[0].id,groupLabel:products[0].name}];if(m.shared)return [{...column,groupLabel:'Shared: '+products.map(p=>p.name).join(', ')}];return [column];});}
