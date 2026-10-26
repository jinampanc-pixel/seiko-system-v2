import { packingQuantities } from "./packing-label-model";
import { orderRuleErrors, predicateState, specificationForRecord, recordRuleIssues, measurementRequired, type RulePredicate, workspaceColumns, type OrderRecord, type SeikoOrder } from "./order-domain";

export type PriceRule = RulePredicate & { id:string; name:string; mode:"package"|"product"|"fixed"; rate:number; taxRate:number; hsnSac:string; fieldId:string; match:string; contents:{productId:string;quantity:number;alternatives?:string[]}[] };
export type PersonCommercial = { state:"active"|"awaiting"|"hold"|"cancelled"; reason:string; overrideReason?:string; readySize?:string; batch?:string; rateOverrides?:Record<string,number> };
export type DeliveryEntry = { id:string; date:string; historical?:boolean; dateUnknown?:boolean; recordId:string; productId:string; quantity:number; kind:"delivery"|"return"|"replacement"; issueId?:string; reference:string; at:string };
export type ServiceIssue = { id:string; recordId:string; productId:string; type:"fitting"|"missing"|"wrong_item"|"new_person"|"removal"|"return"|"defect"|"other"; description:string; owner:string; promisedDate:string; status:"open"|"in_progress"|"resolved"; chargeable:boolean; extraCharge:number; taxRate?:number; hsnSac?:string; history:{at:string;status:string;note:string}[] };
export type OrderCommerce = { rules:PriceRule[]; people:Record<string,PersonCommercial>; deliveries:DeliveryEntry[]; issues:ServiceIssue[] };
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
  const old=previous?.commerce;
  if(old&&[...old.deliveries,...old.issues].some(x=>x.recordId!=="order"&&!order.records.some(r=>r.recordId===x.recordId)))return "Preserve people with delivery or query history. Cancel them in People & eligibility instead of deleting their row.";
  if(old&&JSON.stringify(c.deliveries.slice(0,old.deliveries.length))!==JSON.stringify(old.deliveries))return "Delivery history is permanent. Add a return or correction entry instead.";
  const net=new Map<string,number>();
  for(const [deliveryIndex,d] of c.deliveries.entries()){const key=`${d.recordId}:${d.productId}`,p=order.products.find(p=>p.id===d.productId),record=order.records.find(r=>r.recordId===d.recordId)||(d.recordId==="order"&&p?.quantityMode==="order_total"?{recordId:"order",personId:"",values:{}}:undefined);if(!d.id||!record||!p||!Number.isInteger(d.quantity)||d.quantity<=0||!["delivery","return","replacement"].includes(d.kind)||!(d.historical===true&&d.dateUnknown===true&&d.date===""||!d.dateUnknown&&/^\d{4}-\d{2}-\d{2}$/.test(d.date))||d.historical!==undefined&&typeof d.historical!=="boolean"||d.dateUnknown!==undefined&&typeof d.dateUnknown!=="boolean"||d.historical===true&&d.kind!=="delivery"||!d.reference?.trim())return "Complete delivery person, product, date (or historical date unknown), quantity and reference.";if(d.kind==="delivery"&&Boolean(previous)&&deliveryIndex>=(old?.deliveries.length||0)&&(record.recordId==="order"?order.status==="Cancelled":Boolean(d.historical?inactiveRecordReason(order,record):!recordEligibility({...order,commerce:{...c,deliveries:c.deliveries.slice(0,deliveryIndex)}},record,[p.id]).eligible)))return "Only eligible active people can receive new delivery. Record returns or linked replacements separately.";if(d.kind==="replacement"){if(!c.issues.some(i=>i.id===d.issueId&&i.recordId===d.recordId&&i.productId===d.productId))return "Link replacement supply to its issue.";continue;}const qty=(net.get(key)||0)+(d.kind==="return"?-d.quantity:d.quantity);if(qty<0||d.kind==="delivery"&&deliveryIndex>=(old?.deliveries.length||0)&&qty>assignedQuantity(order,record,p.id))return "Delivery exceeds the ordered quantity or return exceeds deliveries. Use a linked replacement for extra supply.";net.set(key,qty);}
  if(new Set(c.deliveries.map(d=>d.id)).size!==c.deliveries.length)return "Duplicate delivery entry.";
  for(const i of c.issues){if(!i.id||!(order.records.some(r=>r.recordId===i.recordId)||i.recordId==="order"&&order.products.some(p=>p.quantityMode==="order_total"))||i.productId&&!order.products.some(p=>p.id===i.productId)||!["fitting","missing","wrong_item","new_person","removal","return","defect","other"].includes(i.type)||!i.description?.trim()||!i.owner?.trim()||!["open","in_progress","resolved"].includes(i.status)||!Number.isFinite(i.extraCharge)||i.extraCharge<0||cents(i.extraCharge)!==i.extraCharge||i.taxRate!==undefined&&(!Number.isFinite(i.taxRate)||i.taxRate<0||i.taxRate>100)||!Array.isArray(i.history)||!i.history.length||i.history.at(-1)?.status!==i.status)return "Complete issue description, person, owner, status and charge.";const before=old?.issues.find(x=>x.id===i.id);if(before&&JSON.stringify(i.history.slice(0,before.history.length))!==JSON.stringify(before.history))return "Issue history cannot be rewritten.";if(before&&JSON.stringify(i)!==JSON.stringify(before)&&i.history.length<=before.history.length)return "Record a reason for the issue update.";}
  if(old?.issues.some(i=>!c.issues.some(n=>n.id===i.id)))return "Issues cannot be removed; resolve them with a note.";
  return "";
}
