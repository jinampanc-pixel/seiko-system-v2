import { packingQuantities } from "./packing-label-model";
import { orderRuleErrors, predicateState, specificationForRecord, recordRuleIssues, measurementRequired, type RulePredicate, workspaceColumns, type OrderRecord, type SeikoOrder } from "./order-domain";

export type PriceRule = RulePredicate & { id:string; name:string; mode:"package"|"product"|"fixed"; rate:number; taxRate:number; hsnSac:string; fieldId:string; match:string; contents:{productId:string;quantity:number;alternatives?:string[]}[] };
/** A garment can belong to only one component of a package. */
export function selectPriceProduct(rule:PriceRule, productId:string, selected:boolean):PriceRule["contents"] {
 const primary=rule.contents.find(x=>x.productId===productId);
 const alternative=rule.contents.find(x=>x.alternatives?.includes(productId));
 if(selected&&(primary||alternative))return rule.contents;
 if(selected)return [...(rule.mode==="product"?[]:rule.contents),{productId,quantity:1}];
 return rule.contents.filter(x=>x.productId!==productId).map(x=>({...x,alternatives:x.alternatives?.filter(id=>id!==productId)}));
}

export type PersonCommercial = { state:"active"|"awaiting"|"hold"|"cancelled"; reason:string; overrideReason?:string; readySize?:string; batch?:string; rateOverrides?:Record<string,number> };
export type DeliveryEntry = { id:string; date:string; historical?:boolean; dateUnknown?:boolean; recordId:string; productId:string; quantity:number; kind:"delivery"|"return"|"replacement"; issueId?:string; batchId?:string; batchLineId?:string; batchEventId?:string; sourceDeliveryId?:string; reference:string; at:string };
export type ServiceIssue = { id:string; recordId:string; productId:string; deliveryId?:string; type:"fitting"|"missing"|"wrong_item"|"new_person"|"removal"|"return"|"defect"|"other"; description:string; owner:string; promisedDate:string; status:"open"|"in_progress"|"resolved"; chargeable:boolean; extraCharge:number; taxRate?:number; hsnSac?:string; history:{at:string;status:string;note:string}[] };
export type OrderCommerce = { rules:PriceRule[]; people:Record<string,PersonCommercial>; deliveries:DeliveryEntry[]; issues:ServiceIssue[]; fulfilment?:OrderFulfilment };
export type PriceUnit = { unit?:string; personName?:string; key:string; ruleId:string; recordId:string; description:string; quantity:number; rate:number; amount:number; taxRate:number; hsnSac:string };
export type PricingSnapshot = { orderUpdatedAt:string; basis:"eligible"|"delivered"; units:PriceUnit[]; baseline?:boolean };
export const emptyCommerce = ():OrderCommerce => ({rules:[],people:{},deliveries:[],issues:[]});
export const commerceOf = (order:SeikoOrder):OrderCommerce => ({...emptyCommerce(),...order.commerce});
export function redactCommercialPrices(order:SeikoOrder):SeikoOrder{
 if(!order.commerce)return order;const c=commerceOf(order);
 return {...order,commerce:{...c,rules:c.rules.map(r=>({...r,rate:0,taxRate:0,hsnSac:""})),people:Object.fromEntries(Object.entries(c.people).map(([id,p])=>{const visible={...p};delete visible.rateOverrides;return [id,visible];})),issues:c.issues.map(i=>({...i,extraCharge:0,taxRate:0,hsnSac:""}))}};
}
export const cents = (n:number) => Math.round((n+Number.EPSILON)*100)/100;
const present = (v:unknown) => v!==undefined&&v!==null&&String(v).trim()!==""&&String(v).trim()!=="0";
export function personName(order:SeikoOrder, recordId:string) { const r=order.records.find(r=>r.recordId===recordId);const f=order.fields.find(f=>/name/i.test(f.name));return r?String(r.values[`field:${f?.id}`]||r.personId||r.recordId):recordId==="order"?"Whole order":"Removed person"; }
const assignedCache=new WeakMap<SeikoOrder,ReturnType<typeof packingQuantities>>();
export function assignedQuantities(order:SeikoOrder){let q=assignedCache.get(order);if(!q){q=packingQuantities(order);assignedCache.set(order,q);}return q;}
export function assignedQuantity(order:SeikoOrder,record:OrderRecord,productId:string,q=assignedQuantities(order)){const p=order.products.find(p=>p.id===productId);return p?.quantityMode==="order_total"&&record.recordId==="order"?p.orderTotal:q.get(record.recordId)?.[productId]||0;}
const eligibilityColumns=new WeakMap<SeikoOrder,ReturnType<typeof workspaceColumns>>();
function inactiveRecordReason(order:SeikoOrder,record:OrderRecord):string {
 const person=commerceOf(order).people[record.recordId];
 if(order.status==="Cancelled")return "Order cancelled";
 if(person&&person.state!=="active")return person.state+": "+person.reason;
 if(record.held)return "On hold";
 if(order.fields.some(f=>/status|cancel/i.test(f.name)&&/^(cancelled|canceled|removed)$/i.test(String(record.values[`field:${f.id}`]||"").trim())))return "Cancelled in person details";
 return "";
}
export function recordEligibility(order:SeikoOrder,record:OrderRecord,productIds=order.products.map(p=>p.id),quantities=assignedQuantities(order)) {
  const person=commerceOf(order).people[record.recordId],inactive=inactiveRecordReason(order,record);
  if(inactive)return {eligible:false,reason:inactive};
  let cols=eligibilityColumns.get(order);if(!cols){cols=workspaceColumns(order);eligibilityColumns.set(order,cols);}
  const ruleIssues=recordRuleIssues(order,record);if(ruleIssues.length)return {eligible:false,reason:ruleIssues.join("; ")};
  const assigned=productIds.filter(id=>assignedQuantity(order,record,id,quantities)>0);
  if(!assigned.length)return {eligible:false,reason:"No assigned garments / awaiting measurements"};
  if(person?.overrideReason?.trim())return {eligible:true,reason:"Override: "+person.overrideReason};
  if(person?.readySize?.trim())return {eligible:true,reason:"Standard size: "+person.readySize};
  for(const id of assigned){
    // Recorded supply proves this product was fulfilled; never invent its old measurements.
    if(deliveredQuantity(order,record.recordId,id)>=assignedQuantity(order,record,id,quantities))continue;
    const product=order.products.find(p=>p.id===id);if(!product) return {eligible:false,reason:"Package product was removed"};
    const measurements=order.measurements.filter(m=>m.appliesTo.includes(id)&&(!m.requiredWhen?.conditions?.length||measurementRequired(m,record)));
    const required=measurements.filter(m=>measurementRequired(m,record));
    const has=(m:typeof measurements[number])=>present(record.values[m.shared?`measurement:${m.id}:shared`:`measurement:${m.id}:product:${id}`]);
    const size=product.specifications.some(s=>/size/i.test(s.name)&&present(specificationForRecord(s,record)));
    if(!size&&(!measurements.length&&!order.measurements.some(m=>m.appliesTo.includes(id)&&m.requiredWhen?.conditions?.length)||measurements.length>0&&!measurements.some(has)||required.some(m=>!has(m))))return {eligible:false,reason:`Awaiting measurements or standard size: ${product.name}`};
    if(product.specifications.some(s=>s.role!=="asset"&&s.required&&!present(specificationForRecord(s,record))))return {eligible:false,reason:`Incomplete product details: ${product.name}`};
    if(cols.some(c=>c.groupId===`product:${id}`&&c.required&&c.id.startsWith("spec:")&&!present(record.values[c.id])))return {eligible:false,reason:`Incomplete product details: ${product.name}`};
  }
  return {eligible:true,reason:"Ready"};
}
export function deliveredQuantity(order:SeikoOrder,recordId:string,productId:string) { return cents(commerceOf(order).deliveries.filter(d=>d.recordId===recordId&&d.productId===productId&&d.kind!=="replacement").reduce((n,d)=>n+(d.kind==="return"?-d.quantity:d.quantity),0)); }
export function fulfilmentSummary(order:SeikoOrder){
 const c=commerceOf(order),quantities=packingQuantities(order);let ordered=0,pending=0,completePeople=0,partialPeople=0;
 for(const r of order.records.filter(r=>c.people[r.recordId]?.state!=="cancelled")){
  let expected=0,given=0;
  for(const p of order.products.filter(p=>p.quantityMode!=="order_total")){const q=assignedQuantity(order,r,p.id,quantities);const d=deliveredQuantity(order,r.recordId,p.id);ordered+=q;pending+=Math.max(0,q-d);expected+=q;given+=Math.min(q,d);}
  if(expected&&given>=expected)completePeople++;else if(given)partialPeople++;
 }
 for(const p of order.products.filter(p=>p.quantityMode==="order_total")){ordered+=p.orderTotal;pending+=Math.max(0,p.orderTotal-deliveredQuantity(order,"order",p.id));}
 const delivered=c.deliveries.reduce((n,d)=>n+(d.kind==="delivery"?d.quantity:d.kind==="return"?-d.quantity:0),0),replacements=c.deliveries.filter(d=>d.kind==="replacement").reduce((n,d)=>n+d.quantity,0);
 return {ordered,delivered,pending,completePeople,partialPeople,replacements};
}
export function pricingQuote(order:SeikoOrder,basis:"eligible"|"delivered"="eligible") {
  const c=commerceOf(order),quantities=packingQuantities(order),units:PriceUnit[]=[],excluded:{recordId:string;ruleId:string;reason:string}[]=[];
  for(const rule of c.rules){
    const bulk=rule.mode==="product"&&order.products.find(p=>p.id===rule.contents[0]?.productId)?.quantityMode==="order_total";
    const records=rule.mode==="fixed"||bulk?[{recordId:"order",personId:"",values:{}} as OrderRecord]:order.records;
    for(const record of records){
      const condition=predicateState(rule,record,rule.fieldId);if(condition!=="match"){if(condition==="pending")excluded.push({recordId:record.recordId,ruleId:rule.id,reason:"Pricing conditions pending"});continue;}
      const resolve=(r:PriceRule)=>r.contents.filter(x=>x.quantity>0).map(x=>({...x,productId:[x.productId,...(x.alternatives||[])].find(id=>assignedQuantity(order,record,id,quantities)>0)||x.productId}));
      const contents=resolve(rule);
      const state=rule.mode==="fixed"||bulk?{eligible:order.status!=="Cancelled",reason:"Order cancelled"}:recordEligibility(order,record,contents.map(x=>x.productId),quantities);
      if(!state.eligible){excluded.push({recordId:record.recordId,ruleId:rule.id,reason:state.reason});continue;}
      const matching=c.rules.filter(r=>r.mode!=="fixed"&&predicateState(r,record,r.fieldId)==="match");
      const signature=(r:PriceRule)=>r.contents.map(x=>`${[x.productId,...(x.alternatives||[])].sort().join("/")}:${x.quantity}`).sort().join("|");
      if(rule.mode!=="fixed"&&matching.filter(r=>r.mode===rule.mode&&signature(r)===signature(rule)).length>1){excluded.push({recordId:record.recordId,ruleId:rule.id,reason:"Overlapping price rules. Make their groups distinct."});continue;}
      const packageQuantity=(id:string)=>matching.filter(r=>r.mode==="package").reduce((n,r)=>n+resolve(r).filter(x=>x.productId===id).reduce((a,x)=>a+x.quantity,0),0);
      let quantity=1;
      if(rule.mode==="product") {const p=order.products.find(p=>p.id===contents[0]?.productId);quantity=p?Math.max(0,assignedQuantity(order,record,p.id,quantities)-packageQuantity(p.id)):0;}
      if(rule.mode==="package"&&contents.some(x=>{const p=order.products.find(p=>p.id===x.productId);return !p||assignedQuantity(order,record,p.id,quantities)<packageQuantity(x.productId);})){excluded.push({recordId:record.recordId,ruleId:rule.id,reason:"Incomplete package quantity"});continue;}
      if(basis==="delivered"){
        if(rule.mode==="product")quantity=Math.min(quantity,Math.max(0,deliveredQuantity(order,record.recordId,contents[0]?.productId)-packageQuantity(contents[0]?.productId)));
        else if(rule.mode==="package"&&contents.some(x=>deliveredQuantity(order,record.recordId,x.productId)<x.quantity))quantity=0;
        else if(rule.mode==="fixed"&&order.status!=="Completed")quantity=0;
      }
      if(quantity<=0){excluded.push({recordId:record.recordId,ruleId:rule.id,reason:basis==="delivered"?"Delivery pending":"No items ordered"});continue;}
      const rate=c.people[record.recordId]?.rateOverrides?.[rule.id]??rule.rate;
      units.push({key:`${rule.id}:${record.recordId}:tax${rule.taxRate||0}`,ruleId:rule.id,recordId:record.recordId,unit:rule.mode==="package"?"student":rule.mode==="fixed"?"order":"pc",personName:personName(order,record.recordId),description:rule.name+(rule.mode==="package"?" ("+rule.contents.map(x=>`${x.quantity} ${[x.productId,...(x.alternatives||[])].map(id=>order.products.find(p=>p.id===id)?.name||"item").join("/")}`).join(" + ")+")":""),quantity,rate,amount:cents(quantity*rate),taxRate:rule.taxRate||0,hsnSac:rule.hsnSac||""});
    }
  }
  for(const issue of c.issues.filter(i=>i.chargeable&&i.extraCharge>0&&i.status==="resolved"))units.push({key:`issue:${issue.id}:tax${issue.taxRate||0}`,ruleId:`issue:${issue.id}`,recordId:issue.recordId,personName:personName(order,issue.recordId),description:`Extra work: ${issue.description}`,quantity:1,rate:issue.extraCharge,amount:issue.extraCharge,taxRate:issue.taxRate||0,hsnSac:issue.hsnSac||""});
  return {units,excluded,total:cents(units.reduce((n,u)=>n+u.amount,0)),billablePeople:new Set(units.filter(u=>u.recordId!=="order").map(u=>u.recordId)).size};
}
export function pricingLines(units:PriceUnit[]) {
  const groups=new Map<string,{id:string;description:string;quantity:number;unit:string;unitRate:number;taxRate:number;hsnSac:string}>();
  for(const u of units){const key=`${u.ruleId}:${u.rate}:${u.taxRate}`;const old=groups.get(key);if(old)old.quantity+=u.quantity;else groups.set(key,{id:key,description:u.description,quantity:u.quantity,unit:u.unit||"unit",unitRate:u.rate,taxRate:u.taxRate,hsnSac:u.hsnSac});}
  return [...groups.values()];
}
/** The same invoice rows are used by billing reconciliation and its inline brief. */
export function pricingInvoiceLines(units:PriceUnit[]) {
 const normal=units.filter(u=>u.quantity>0&&cents(u.quantity*u.rate)===u.amount);
 return [...pricingLines(normal),...units.filter(u=>!normal.includes(u)).map((u,i)=>({id:`change-${i}`,description:u.description,quantity:1,unit:"adjustment",unitRate:u.amount,taxRate:u.taxRate,hsnSac:u.hsnSac}))];
}
export function pricingDelta(desired:PriceUnit[],booked:PriceUnit[]) {
  const map=new Map<string,PriceUnit>();for(const u of desired)map.set(u.key,{...u});for(const u of booked){const current=map.get(u.key)||{...u,quantity:0,amount:0};map.set(u.key,{...current,quantity:cents(current.quantity-u.quantity),amount:cents(current.amount-u.amount)});}
  return [...map.values()].filter(u=>Math.abs(u.amount)>=.01||u.quantity!==0);
}
export function validateCommerce(order:SeikoOrder, previous?:SeikoOrder):string {
  const ruleProblem=orderRuleErrors(order);if(ruleProblem.length)return ruleProblem.join(" ");
  if(!order.commerce)return previous?.commerce?"Commercial history cannot be removed.":"";
  const c=order.commerce;
  if(!Array.isArray(c.rules)||!Array.isArray(c.deliveries)||!Array.isArray(c.issues)||!c.people||typeof c.people!=="object")return "Invalid order commercial details.";
  if(c.rules.length>100||c.deliveries.length>10000||c.issues.length>3000)return "Commercial record limit reached.";
  if(new Set(c.rules.map(r=>r.id)).size!==c.rules.length||c.rules.some(r=>!r.id||!r.name?.trim()||!["package","product","fixed"].includes(r.mode)||!Number.isFinite(r.rate)||r.rate<0||r.rate>1e9||cents(r.rate)!==r.rate||!Number.isFinite(r.taxRate)||r.taxRate<0||r.taxRate>100||!Array.isArray(r.contents)||(r.mode!=="fixed"&&!r.contents.length)||new Set(r.contents.flatMap(x=>[x.productId,...(x.alternatives||[])])).size!==r.contents.flatMap(x=>[x.productId,...(x.alternatives||[])]).length||r.mode==="product"&&r.contents.length!==1||r.contents.some(x=>![x.productId,...(x.alternatives||[])].every(id=>order.products.some(p=>p.id===id))||!Number.isInteger(x.quantity)||x.quantity<=0)||(!r.conditions?.length&&r.fieldId&&(!order.fields.some(f=>f.id===r.fieldId)||!r.match?.trim()))))return "Complete every price rule, product, group and rate.";
  for(const [id,p] of Object.entries(c.people)){if(!order.records.some(r=>r.recordId===id)||!["active","awaiting","hold","cancelled"].includes(p.state)||p.state!=="active"&&!p.reason?.trim()||p.overrideReason!==undefined&&!p.overrideReason.trim()||Object.values(p.rateOverrides||{}).some(n=>!Number.isFinite(n)||n<0||n>1e9||cents(n)!==n))return "Use valid person states, prices and reasons.";}
  const fulfilmentProblem=validateFulfilment(order,previous);if(fulfilmentProblem)return fulfilmentProblem;
  const old=previous?.commerce;
  if(old&&[...old.deliveries,...old.issues].some(x=>x.recordId!=="order"&&!order.records.some(r=>r.recordId===x.recordId)))return "Preserve people with delivery or query history. Cancel them in People & eligibility instead of deleting their row.";
  if(old&&JSON.stringify(c.deliveries.slice(0,old.deliveries.length))!==JSON.stringify(old.deliveries))return "Delivery history is permanent. Add a return or correction entry instead.";
  const net=new Map<string,number>();
  for(const [deliveryIndex,d] of c.deliveries.entries()){const key=`${d.recordId}:${d.productId}`,p=order.products.find(p=>p.id===d.productId),record=order.records.find(r=>r.recordId===d.recordId)||(d.recordId==="order"&&p?.quantityMode==="order_total"?{recordId:"order",personId:"",values:{}}:undefined);if(!d.id||!record||!p||!Number.isInteger(d.quantity)||d.quantity<=0||!["delivery","return","replacement"].includes(d.kind)||!(d.historical===true&&d.dateUnknown===true&&d.date===""||!d.dateUnknown&&/^\d{4}-\d{2}-\d{2}$/.test(d.date))||d.historical!==undefined&&typeof d.historical!=="boolean"||d.dateUnknown!==undefined&&typeof d.dateUnknown!=="boolean"||d.historical===true&&d.kind!=="delivery"||!d.reference?.trim())return "Complete delivery person, product, date (or historical date unknown), quantity and reference.";if(d.kind==="delivery"&&Boolean(previous)&&deliveryIndex>=(old?.deliveries.length||0)&&(record.recordId==="order"?order.status==="Cancelled":Boolean(d.historical?inactiveRecordReason(order,record):!recordEligibility({...order,commerce:{...c,deliveries:c.deliveries.slice(0,deliveryIndex)}},record,[p.id]).eligible)))return "Only eligible active people can receive new delivery. Record returns or linked replacements separately.";if(d.kind==="replacement"){if(!c.issues.some(i=>i.id===d.issueId&&i.recordId===d.recordId&&i.productId===d.productId))return "Link replacement supply to its issue.";continue;}const qty=(net.get(key)||0)+(d.kind==="return"?-d.quantity:d.quantity);if(qty<0||d.kind==="delivery"&&deliveryIndex>=(old?.deliveries.length||0)&&qty>assignedQuantity(order,record,p.id))return "Delivery exceeds the ordered quantity or return exceeds deliveries. Use a linked replacement for extra supply.";net.set(key,qty);}
  if(new Set(c.deliveries.map(d=>d.id)).size!==c.deliveries.length)return "Duplicate delivery entry.";
  for(const i of c.issues){if(!i.id||!(order.records.some(r=>r.recordId===i.recordId)||i.recordId==="order"&&order.products.some(p=>p.quantityMode==="order_total"))||i.productId&&!order.products.some(p=>p.id===i.productId)||!["fitting","missing","wrong_item","new_person","removal","return","defect","other"].includes(i.type)||!i.description?.trim()||!i.owner?.trim()||!["open","in_progress","resolved"].includes(i.status)||!Number.isFinite(i.extraCharge)||i.extraCharge<0||cents(i.extraCharge)!==i.extraCharge||i.taxRate!==undefined&&(!Number.isFinite(i.taxRate)||i.taxRate<0||i.taxRate>100)||!Array.isArray(i.history)||!i.history.length||i.history.at(-1)?.status!==i.status)return "Complete issue description, person, owner, status and charge.";const before=old?.issues.find(x=>x.id===i.id);if(before&&(before.recordId!==i.recordId||before.productId!==i.productId||before.deliveryId&&before.deliveryId!==i.deliveryId))return "Keep the case linked to its original person, product and handover.";if(before&&JSON.stringify(i.history.slice(0,before.history.length))!==JSON.stringify(before.history))return "Issue history cannot be rewritten.";if(before&&JSON.stringify(i)!==JSON.stringify(before)&&i.history.length<=before.history.length)return "Record a reason for the issue update.";}
  if(old?.issues.some(i=>!c.issues.some(n=>n.id===i.id)))return "Issues cannot be removed; resolve them with a note.";
  return "";
}


export type OrderEvidence={id:string;name:string;mimeType:string;size:number;storageKey:string;sha256:string;addedAt:string};
export type OrderProofLine={id:string;recordId:string;personId:string;person:string;details:string;productId:string;product:string;specifications:string;measurements:string;quantity:number;orderedQuantity:number};
export type OrderConfirmation={id:string;at:string;by?:string;date:string;confirmedBy:string;method:"signed_copy"|"message";note:string;evidence:OrderEvidence[];orderNo:string;clientName:string;lines:OrderProofLine[]};
export type DeliveryEvent={id:string;type:"dispatch"|"handover"|"acknowledge"|"close";date:string;at:string;by?:string;receiver:string;note:string;method?:"signed_copy"|"message";scope?:"batch"|"selected"|"person";quantities:Record<string,number>;evidence:OrderEvidence[]};
export type DeliveryBatch={id:string;reference:string;at:string;by?:string;orderNo:string;clientName:string;lines:OrderProofLine[];priorHandovers?:{lineId:string;movementId:string;quantity:number;date:string;dateUnknown?:boolean}[];events:DeliveryEvent[]};
export type OrderFulfilment={confirmations:OrderConfirmation[];batches:DeliveryBatch[]};
export const fulfilmentOf=(order:SeikoOrder):OrderFulfilment=>order.commerce?.fulfilment||{confirmations:[],batches:[]};
export function orderProofLines(order:SeikoOrder,remaining=false,includeCancelled=false):OrderProofLine[]{
 const q=assignedQuantities(order),columns=workspaceColumns(order),rows:OrderProofLine[]=[];
 const records=[...order.records,...(order.products.some(p=>p.quantityMode==="order_total")?[{recordId:"order",personId:"",values:{}} as OrderRecord]:[])];
 for(const record of records)for(const product of order.products){
  if((product.quantityMode==="order_total")!==(record.recordId==="order"))continue;
  if(!includeCancelled&&(commerceOf(order).people[record.recordId]?.state==="cancelled"||order.status==="Cancelled"))continue;
  const orderedQuantity=assignedQuantity(order,record,product.id,q),quantity=remaining?Math.max(0,orderedQuantity-deliveredQuantity(order,record.recordId,product.id)-reservedDeliveryQuantity(order,record.recordId,product.id)):orderedQuantity;
  if(!quantity&&!includeCancelled||remaining&&record.recordId!=="order"&&!recordEligibility(order,record,[product.id],q).eligible)continue;
  rows.push({id:`${record.recordId}:${product.id}`,recordId:record.recordId,personId:record.personId,person:personName(order,record.recordId),details:order.fields.filter(f=>!/name/i.test(f.name)).map(f=>`${f.name}: ${record.values['field:'+f.id]??'—'}`).join(' · '),productId:product.id,product:product.name,specifications:product.specifications.filter(s=>s.role!=="asset").map(s=>`${s.name}: ${specificationForRecord(s,record)||'—'}`).join(' · '),measurements:columns.filter(c=>c.groupId!=="record"&&c.id.startsWith('measurement:')&&order.measurements.some(m=>c.id.startsWith('measurement:'+m.id+':')&&m.appliesTo.includes(product.id))).map(c=>`${c.label}: ${record.values[c.id]??'—'}`).join(' · '),quantity,orderedQuantity});
 }
 return rows;
}
export function reservedDeliveryQuantity(order:SeikoOrder,recordId:string,productId:string,exceptId="") {return fulfilmentOf(order).batches.filter(b=>b.id!==exceptId&&!b.events.some(e=>e.type==='close')).reduce((n,b)=>n+b.lines.filter(l=>l.recordId===recordId&&l.productId===productId).reduce((sum,l)=>sum+Math.max(0,l.quantity-batchQuantity(b,'handover',l.id)),0),0);}
export const batchQuantity=(batch:DeliveryBatch,type:DeliveryEvent['type'],lineId?:string)=>(type==='handover'?(batch.priorHandovers||[]).filter(h=>!lineId||h.lineId===lineId).reduce((n,h)=>n+h.quantity,0):0)+batch.events.filter(e=>e.type===type).reduce((n,e)=>n+(lineId?e.quantities[lineId]||0:Object.values(e.quantities).reduce((a,b)=>a+b,0)),0);
/** Link saved movements without creating another supply event or inventing receipt evidence. */
export function linkEarlierDelivery(order:SeikoOrder,reference:string):DeliveryBatch{
 const used=new Set(fulfilmentOf(order).batches.flatMap(b=>(b.priorHandovers||[]).map(h=>h.movementId)));
 const movements=commerceOf(order).deliveries.filter(d=>d.reference===reference&&d.kind!=='return'&&!d.batchId&&!used.has(d.id));
 if(!movements.length)throw Error('No unlinked handovers match this reference.');
 const master=orderProofLines(order,false,true),lines:OrderProofLine[]=[],priorHandovers:NonNullable<DeliveryBatch['priorHandovers']>=[];
 for(const d of movements){let l=lines.find(l=>l.recordId===d.recordId&&l.productId===d.productId);if(!l){const m=master.find(m=>m.recordId===d.recordId&&m.productId===d.productId);if(!m)throw Error('Keep the earlier handover’s person and product in the order before linking it.');l={...m,quantity:0};lines.push(l);}l.quantity+=d.quantity;l.orderedQuantity=Math.max(l.orderedQuantity,l.quantity);priorHandovers.push({lineId:l.id,movementId:d.id,quantity:d.quantity,date:d.date,...(d.dateUnknown?{dateUnknown:true}:{})});}
 return {id:crypto.randomUUID(),reference,at:new Date().toISOString(),orderNo:order.details.orderNo,clientName:order.details.clientName,lines,priorHandovers,events:[]};
}
export function confirmationIsCurrent(order:SeikoOrder,confirmation:OrderConfirmation){const current=orderProofLines(order);return order.details.orderNo===confirmation.orderNo&&order.details.clientName===confirmation.clientName&&JSON.stringify(current)===JSON.stringify(confirmation.lines);}
export function appendDeliveryEvent(order:SeikoOrder,batchId:string,event:DeliveryEvent):SeikoOrder{
 const c=commerceOf(order),f=fulfilmentOf(order),batch=f.batches.find(b=>b.id===batchId);if(!batch)throw Error('Choose a delivery.');
 const existing=batch.events.find(e=>e.id===event.id);if(existing){const content=(e:DeliveryEvent)=>JSON.stringify({type:e.type,date:e.date,receiver:e.receiver,note:e.note,method:e.method,scope:e.scope,quantities:e.quantities,evidence:e.evidence});if(content(existing)!==content(event))throw Error('This delivery action is already saved with different details. Start a new action to record a correction.');return order;}

 const movements:DeliveryEntry[]=event.type==='handover'?batch.lines.filter(l=>(event.quantities[l.id]||0)>0).map(l=>({id:`${event.id}-${l.id}`,recordId:l.recordId,productId:l.productId,quantity:event.quantities[l.id],kind:'delivery',date:event.date,at:event.at,reference:batch.reference,batchId,batchLineId:l.id,batchEventId:event.id})):[];
 return {...order,commerce:{...c,deliveries:[...c.deliveries,...movements],fulfilment:{...f,batches:f.batches.map(b=>b.id===batchId?{...b,events:[...b.events,event]}:b)}}};
}
export function appendDeliveryBatch(order:SeikoOrder,batch:DeliveryBatch):SeikoOrder{
 const f=fulfilmentOf(order),existing=f.batches.find(b=>b.id===batch.id);if(existing){const content=(b:DeliveryBatch)=>JSON.stringify({reference:b.reference,lines:b.lines,priorHandovers:b.priorHandovers});if(content(existing)!==content(batch))throw Error('This prepared delivery is already saved with different details.');return order;}return {...order,commerce:{...commerceOf(order),fulfilment:{...f,batches:[...f.batches,batch]}}};
}
export function appendOrderConfirmation(order:SeikoOrder,value:OrderConfirmation):SeikoOrder{
 const f=fulfilmentOf(order),existing=f.confirmations.find(c=>c.id===value.id);if(existing){const content=(c:OrderConfirmation)=>JSON.stringify({date:c.date,confirmedBy:c.confirmedBy,method:c.method,note:c.note,evidence:c.evidence,orderNo:c.orderNo,clientName:c.clientName,lines:c.lines});if(content(existing)!==content(value))throw Error('This confirmation is already saved with different details.');return order;}return {...order,commerce:{...commerceOf(order),fulfilment:{...f,confirmations:[...f.confirmations,value]}}};
}
export function fulfilmentEvidence(order:SeikoOrder){const f=fulfilmentOf(order);return [...f.confirmations.flatMap(c=>c.evidence),...f.batches.flatMap(b=>b.events.flatMap(e=>e.evidence))];}
export function stampFulfilment(order:SeikoOrder,previous:SeikoOrder|undefined,by:string,at:string):SeikoOrder{
 if(!order.commerce?.fulfilment)return order;const old=previous?fulfilmentOf(previous):{confirmations:[],batches:[]},f=fulfilmentOf(order);
 return {...order,commerce:{...order.commerce,fulfilment:{confirmations:f.confirmations.map(c=>old.confirmations.some(x=>x.id===c.id)?c:{...c,by,at}),batches:f.batches.map(b=>{const before=old.batches.find(x=>x.id===b.id);return {...b,...(!before?{by,at}:{}),events:b.events.map(e=>before?.events.some(x=>x.id===e.id)?e:{...e,by,at})};})}}};
}
export function validateFulfilment(order:SeikoOrder,previous?:SeikoOrder):string{
 if(!order.commerce?.fulfilment&&!previous?.commerce?.fulfilment)return "";
 const f=fulfilmentOf(order),old=previous?fulfilmentOf(previous):{confirmations:[],batches:[]};
 const validText=(v:unknown,max=4000)=>typeof v==='string'&&v.length<=max;
 const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const evidence=(items:OrderEvidence[])=>Array.isArray(items)&&items.length<=5&&items.every(e=>e&&validText(e.name,240)&&e.name.trim()&&['application/pdf','image/png','image/jpeg','image/webp'].includes(e.mimeType)&&Number.isInteger(e.size)&&e.size>0&&e.size<=8*1024*1024&&e.storageKey==='evidence:'+e.id&&/^[a-f0-9-]{36}$/.test(e.id)&&/^[a-f0-9]{64}$/.test(e.sha256));
 const proof=(e:{method?:string;note:string;evidence:OrderEvidence[]})=>e.method==='signed_copy'?e.evidence.length>0:e.method==='message'&&Boolean(e.note.trim());
 const line=(l:OrderProofLine)=>l&&validText(l.id,300)&&validText(l.recordId,128)&&validText(l.productId,128)&&validText(l.person,500)&&validText(l.personId,200)&&validText(l.details)&&validText(l.product,240)&&validText(l.specifications)&&validText(l.measurements)&&Number.isInteger(l.quantity)&&l.quantity>0&&Number.isInteger(l.orderedQuantity)&&l.orderedQuantity>=l.quantity;
 if(!Array.isArray(f.confirmations)||!Array.isArray(f.batches)||f.confirmations.length>100||f.batches.length>250)return 'Invalid delivery or confirmation history.';
 if(new Set(f.confirmations.map(x=>x.id)).size!==f.confirmations.length||new Set(f.batches.map(x=>x.id)).size!==f.batches.length)return 'Duplicate delivery or confirmation reference.';
 if(old.confirmations.some((c,i)=>JSON.stringify(c)!==JSON.stringify(f.confirmations[i]))||old.batches.some((b,i)=>f.batches[i]?.id!==b.id))return 'Keep saved confirmations and deliveries in their original history.';
 const master=orderProofLines(order),sameLine=(l:OrderProofLine,m:OrderProofLine)=>JSON.stringify({...l,quantity:m.quantity})===JSON.stringify(m);
 for(const c of f.confirmations){if(!validText(c.id,128)||!c.id||!date(c.date)||!validText(c.confirmedBy,240)||!c.confirmedBy.trim()||!validText(c.note)||!evidence(c.evidence)||!proof(c)||!Array.isArray(c.lines)||!c.lines.length||c.lines.length>10000||c.lines.some(l=>!line(l)))return 'Record who confirmed the order, its date and a signed copy or written confirmation.';if(previous&&!old.confirmations.some(x=>x.id===c.id)&&(c.orderNo!==order.details.orderNo||c.clientName!==order.details.clientName||JSON.stringify(c.lines)!==JSON.stringify(master)))return 'The order changed. Prepare its confirmation from the current order.';}
 const priorIds=f.batches.flatMap(b=>(b.priorHandovers||[]).map(h=>h.movementId));if(new Set(priorIds).size!==priorIds.length)return "An earlier handover can be linked only once.";
 const eventIds=new Set<string>();
 for(const b of f.batches){
  const before=old.batches.find(x=>x.id===b.id);
  if(!validText(b.id,128)||!b.id||!validText(b.reference,240)||!b.reference.trim()||!Array.isArray(b.lines)||!b.lines.length||b.lines.length>10000||b.lines.some(l=>!line(l))||new Set(b.lines.map(l=>l.id)).size!==b.lines.length||!Array.isArray(b.events)||b.events.length>500)return 'Choose valid order items and quantities for this delivery.';
  if(before&&(JSON.stringify({...b,events:[]})!==JSON.stringify({...before,events:[]})||before.events.some((e,i)=>JSON.stringify(e)!==JSON.stringify(b.events[i]))))return 'Saved delivery items and events cannot be rewritten. Record the next action instead.';
  if(b.priorHandovers!==undefined&&(!Array.isArray(b.priorHandovers)||!b.priorHandovers.length||b.priorHandovers.length>10000))return 'Choose existing handover movements to link.';
  if(previous&&!before&&b.priorHandovers){
   let expected:DeliveryBatch;try{expected=linkEarlierDelivery(previous,b.reference);}catch{return 'Earlier handovers changed or were already linked. Refresh this order.';}
   if(b.events.length||JSON.stringify(b.lines)!==JSON.stringify(expected.lines)||JSON.stringify(b.priorHandovers)!==JSON.stringify(expected.priorHandovers)||b.orderNo!==order.details.orderNo||b.clientName!==order.details.clientName)return 'Link the exact earlier handover records from this order.';
  }else if(previous&&!before&&(b.orderNo!==order.details.orderNo||b.clientName!==order.details.clientName||b.events.length||b.lines.some(l=>!master.some(m=>m.id===l.id&&sameLine(l,m))||l.quantity>Math.max(0,l.orderedQuantity-deliveredQuantity(order,l.recordId,l.productId)-reservedDeliveryQuantity(order,l.recordId,l.productId,b.id)))))return 'Prepare delivery quantities from the current pending order items.';
  let dispatched=false,closed=false;const handed:Record<string,number>={},ack:Record<string,number>={};
  for(const h of b.priorHandovers||[]){const source=commerceOf(order).deliveries.find(d=>d.id===h.movementId),l=b.lines.find(l=>l.id===h.lineId);if(!source||!l||source.batchId||source.kind==='return'||source.recordId!==l.recordId||source.productId!==l.productId||source.quantity!==h.quantity||source.date!==h.date||Boolean(source.dateUnknown)!==Boolean(h.dateUnknown))return 'Keep linked earlier movements unchanged.';handed[l.id]=(handed[l.id]||0)+h.quantity;}
  for(const e of b.events){
   if(!validText(e.id,128)||!e.id||eventIds.has(e.id)||!['dispatch','handover','acknowledge','close'].includes(e.type)||!date(e.date)||!validText(e.receiver,240)||!validText(e.note)||!evidence(e.evidence)||!e.quantities||typeof e.quantities!=='object'||Array.isArray(e.quantities)||Object.entries(e.quantities).some(([id,q])=>!b.lines.some(l=>l.id===id)||!Number.isInteger(q)||q<=0))return 'Complete the delivery action, date and valid item quantities.';
   eventIds.add(e.id);const selected=b.lines.filter(l=>e.quantities[l.id]);
   if(e.type!=='close'&&!selected.length)return 'Select at least one delivery item.';
   if(e.type==='dispatch'){if(dispatched||closed||Object.keys(handed).length||selected.length!==b.lines.length||b.lines.some(l=>e.quantities[l.id]!==l.quantity)||!e.note.trim())return 'Dispatch the prepared delivery once with its dispatch reference.';dispatched=true;}
   if(e.type==='handover'){if(closed||!e.receiver.trim())return 'Record the receiver for each handover; a closed delivery cannot supply more items.';for(const l of selected){handed[l.id]=(handed[l.id]||0)+e.quantities[l.id];if(handed[l.id]>l.quantity)return 'Handover exceeds this delivery’s prepared quantity.';if(!order.commerce?.deliveries.some(d=>d.batchId===b.id&&d.batchLineId===l.id&&d.batchEventId===e.id&&d.recordId===l.recordId&&d.productId===l.productId&&d.kind==='delivery'&&d.quantity===e.quantities[l.id]&&d.date===e.date&&d.reference===b.reference))return 'Every handed-over item must use its linked order movement.';}}
   if(e.type==='acknowledge'){if(!e.receiver.trim()||!proof(e)||!['batch','selected','person'].includes(e.scope||''))return 'Record the acknowledging person and attach a signed copy or their written confirmation.';if(e.scope==='batch'&&b.lines.some(l=>(e.quantities[l.id]||0)!==Math.max(0,(handed[l.id]||0)-(ack[l.id]||0))))return 'Whole-delivery acknowledgement must cover all remaining handed-over items. Choose selected items for a partial acknowledgement.';if(e.scope==='person'&&new Set(selected.map(l=>l.recordId)).size!==1)return 'An individual acknowledgement must cover one person only.';for(const l of selected){ack[l.id]=(ack[l.id]||0)+e.quantities[l.id];if(ack[l.id]>(handed[l.id]||0))return 'Acknowledgement exceeds the quantity handed over.';}}
   if(e.type==='close'){if(closed||selected.length||!e.note.trim())return 'Record why the remaining delivery is closed.';closed=true;}
  }
 }
 for(const d of commerceOf(order).deliveries){if(d.batchId){const b=f.batches.find(b=>b.id===d.batchId),e=b?.events.find(e=>e.id===d.batchEventId&&e.type==='handover'),l=b?.lines.find(l=>l.id===d.batchLineId);if(!b||!e||!l||l.recordId!==d.recordId||l.productId!==d.productId||e.quantities[l.id]!==d.quantity||d.kind!=='delivery')return 'Keep delivery movements linked to their saved delivery event.';}if(d.sourceDeliveryId){const source=commerceOf(order).deliveries.find(x=>x.id===d.sourceDeliveryId);if(!source||source.kind==='return'||source.recordId!==d.recordId||source.productId!==d.productId||d.kind==='delivery')return 'Choose the original handover for this return or replacement.';}}
 for(const i of commerceOf(order).issues)if(i.deliveryId){const d=commerceOf(order).deliveries.find(d=>d.id===i.deliveryId&&d.kind!=='return');if(!d||d.recordId!==i.recordId||i.productId&&d.productId!==i.productId)return 'Link the case to a delivery for the same person and product.';}
 return '';
}
