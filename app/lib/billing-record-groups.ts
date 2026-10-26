import { cents, commerceOf, type PriceUnit } from './order-commerce';
import { workspaceColumns, specificationForRecord, type SeikoOrder } from './order-domain';
export function billingRecordGroups(order:SeikoOrder,units:PriceUnit[]){
 const rows=new Map<string,{id:string;ruleId:string;price:string;label:string;details:string;recordIds:string[];quantity:number;unit:string;rate:number;amount:number}>();
 const records=new Map(order.records.map(r=>[r.recordId,r])),columns=workspaceColumns(order),rules=commerceOf(order).rules;
 const nameField=order.fields.find(f=>/name/i.test(f.name));
 for(const u of units){
  const r=records.get(u.recordId),name=String(r?.values[`field:${nameField?.id}`]||(!r&&u.recordId!=='order'?u.personName:'')||'').trim();
  const values=r?columns.filter(c=>c.id!==`field:${nameField?.id}`).flatMap(c=>{const value=r.values[c.id];return value==null||String(value).trim()===''?[]:[{id:c.id,label:c.groupId==='record'?c.label:`${c.groupLabel} / ${c.label}`,value:String(value)}];}):[];
  if(r)for(const p of order.products)for(const spec of p.specifications){const value=specificationForRecord(spec,r);if(value&&!values.some(v=>v.id===`spec:${spec.id}`||v.id===`spec:${spec.id}:override`))values.push({id:`spec:${spec.id}:resolved`,label:`${p.name} / ${spec.name}`,value});}
  const fields=values.filter(v=>v.id.startsWith('field:')),sizes=values.filter(v=>!v.id.startsWith('field:'));
  const label=name||fields.map(v=>`${v.label}: ${v.value}`).join(' · ')||(u.recordId==='order'?'Whole order':r?'Unnamed entries':'Record not in loaded order');
  const details=(name?values:sizes).map(v=>`${v.label}: ${v.value}`).join(' · ');
  const price=rules.find(rule=>rule.id===u.ruleId)?.name||u.description;
  const key=JSON.stringify([u.ruleId,u.rate,u.taxRate,u.unit,cents(u.quantity*u.rate)===u.amount,name||!r?u.recordId:values.map(v=>[v.id,v.value]).sort((a,b)=>a[0].localeCompare(b[0]))]);
  const row=rows.get(key)||{id:key,ruleId:u.ruleId,price,label,details,recordIds:[],quantity:0,unit:u.unit==='student'?'person / package':u.unit||'unit',rate:u.rate,amount:0};
  if(!row.recordIds.includes(u.recordId))row.recordIds.push(u.recordId);row.quantity=cents(row.quantity+u.quantity);row.amount=cents(row.amount+u.amount);rows.set(key,row);
 }
 return [...rows.values()];
}
