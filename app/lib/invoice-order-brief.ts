import { assignedQuantities, deliveredQuantity, pricingQuote, pricingDelta, pricingInvoiceLines, commerceOf, cents } from './order-commerce';
import { specificationForRecord, workspaceColumns, type SeikoOrder, type OrderRecord } from './order-domain';
import { documentTotals, type SeikoCommercialDocument, type SeikoPaymentRecord, type SeikoBillingLine } from './seiko-billing';

const activeInvoice = (d:SeikoCommercialDocument) => d.kind === 'invoice' && d.status !== 'cancelled' && !d.deletedAt;
const clean = (s:string) => s.trim().replace(/\s+/g,' ').toLowerCase();
export function orderBrief(order:SeikoOrder, documents:SeikoCommercialDocument[], payments:SeikoPaymentRecord[], basis:'eligible'|'delivered'='eligible', editingId='', taxMode:'gst'|'non_gst'='non_gst') {
 const invoices=documents.filter(d=>d.orderId===order.orderId&&activeInvoice(d));
 const previous=invoices.filter(d=>d.id!==editingId);
 const quote=pricingQuote(order,basis);
 quote.units=quote.units.map(u=>({...u,taxRate:taxMode==='gst'?u.taxRate:0,key:u.key.replace(/:tax[\d.]+$/,`:tax${taxMode==='gst'?u.taxRate:0}`)}));
 const booked=previous.flatMap(d=>[...(d.pricingSnapshot?.units||[]),...(d.credits||[]).flatMap(c=>c.units)]);
 const delta=pricingDelta(quote.units,booked);
 const lines=pricingInvoiceLines(delta.filter(u=>u.amount>0));
 const groups=briefPriceGroups(order,quote.units);
 const ids=new Set(invoices.map(d=>d.id));
 const received=cents(payments.reduce((n,p)=>n+(p.orderId===order.orderId||ids.has(p.invoiceId)?p.amount:(p.allocations||[]).filter(a=>ids.has(a.invoiceId)).reduce((v,a)=>v+a.amount,0)),0));
 const value=cents(quote.units.reduce((n,u)=>n+u.amount*(1+u.taxRate/100),0));
 return {quote,groups,lines,unmapped:previous.filter(d=>!d.pricingSnapshot),reductions:delta.filter(u=>u.amount<0),invoiced:cents(invoices.reduce((n,d)=>n+documentTotals(d).total,0)),received,value,balance:Math.max(0,cents(value-received))};
}

export function briefPriceGroups(order:SeikoOrder, unitsIn:ReturnType<typeof pricingQuote>['units']){
 return pricingInvoiceLines(unitsIn).map(line=>{
  const units=unitsIn.filter(u=>`${u.ruleId}:${u.rate}:${u.taxRate}`===line.id),rule=commerceOf(order).rules.find(r=>r.id===units[0]?.ruleId);
  const contents=rule?.mode==='package'?rule.contents:[];
  const same=contents.length===2&&contents.every(c=>c.quantity===contents[0].quantity);
  const setsPerPackage=same?contents[0].quantity:1;
  return {line,people:new Set(units.filter(u=>u.recordId!=='order').map(u=>u.recordId)).size,sets:same?line.quantity*setsPerPackage:null,setRate:same?cents(line.unitRate/setsPerPackage):null,pieces:contents.length?line.quantity*contents.reduce((n,c)=>n+c.quantity,0):rule?.mode==='product'?line.quantity:null};
 });
}

export function missingDraftLines(candidates:SeikoBillingLine[], draft:SeikoBillingLine[]) {
 const signature=(l:SeikoBillingLine)=>JSON.stringify([clean(l.description),clean(l.unit),l.unitRate,l.taxRate,clean(l.hsnSac||'')]);
 const quantities=new Map<string,number>();for(const d of draft){const key=signature(d);quantities.set(key,(quantities.get(key)||0)+Math.max(0,d.quantity));}
 return candidates.map(line=>{const key=signature(line),existing=quantities.get(key)||0,covered=Math.min(line.quantity,existing);quantities.set(key,existing-covered);return {...line,quantity:Math.max(0,cents(line.quantity-covered))};});
}
export function appendBriefLines(draft:SeikoBillingLine[], candidates:SeikoBillingLine[], selected:string[], id:()=>string) {
 const missing=missingDraftLines(candidates,draft).filter(l=>selected.includes(l.id)&&l.quantity>0);
 const retained=draft.filter(l=>l.description.trim()||l.unitRate!==0||l.quantity!==1||l.unit!=='pc'||l.taxRate!==0||Boolean(l.hsnSac));
 return [...retained,...missing.map(l=>({...l,id:id()}))];
}
export function briefGroupingOptions(order:SeikoOrder){
 const columns=workspaceColumns(order).filter(c=>c.id.startsWith('field:')||c.id.startsWith('measurement:')).map(c=>({id:c.id,label:c.groupId==='record'?c.label:`${c.groupLabel} / ${c.label}`}));
 return [...columns,...order.products.flatMap(p=>p.specifications.map(s=>({id:`spec:${s.id}:resolved`,label:`${p.name} / ${s.name}`})))];
}
export function briefProductGroups(order:SeikoOrder, fields:string[]=[]){
 const quantities=assignedQuantities(order),groups=new Map<string,{product:string;group:string;people:number;ordered:number;delivered:number;pending:number}>();
 for(const p of order.products){
  const records:OrderRecord[]=p.quantityMode==='order_total'?[{recordId:'order',personId:'',values:{}}]:order.records;
  for(const r of records){const quantity=p.quantityMode==='order_total'?p.orderTotal:quantities.get(r.recordId)?.[p.id]||0;if(!quantity)continue;
   const values=fields.filter(Boolean).map(key=>{const spec=p.specifications.find(s=>key===`spec:${s.id}:resolved`||key===`spec:${s.id}`);return String(spec?specificationForRecord(spec,r):r.values[key]??'—');});
   const group=values.join(' · '),key=JSON.stringify([p.id,values]),row=groups.get(key)||{product:p.name,group,people:0,ordered:0,delivered:0,pending:0};
   const delivered=Math.max(0,Math.min(quantity,deliveredQuantity(order,r.recordId,p.id)));row.people+=r.recordId==='order'?0:1;row.ordered+=quantity;row.delivered+=delivered;row.pending+=quantity-delivered;groups.set(key,row);
  }
 }
 return [...groups.values()];
}

export function invoiceLinesMatch(expected:SeikoBillingLine[], actual:SeikoBillingLine[]):boolean {
 const signature=(lines:SeikoBillingLine[])=>{
  const groups=new Map<string,number>();
  for(const l of lines){const key=JSON.stringify([clean(l.description),clean(l.unit),l.unitRate,l.taxRate,clean(l.hsnSac||'')]);groups.set(key,cents((groups.get(key)||0)+l.quantity));}
  return JSON.stringify([...groups].sort(([a],[b])=>a.localeCompare(b)));
 };
 return signature(expected)===signature(actual);
}
