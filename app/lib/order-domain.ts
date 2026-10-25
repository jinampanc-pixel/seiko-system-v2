import type { OrderCommerce } from "./order-commerce";
export type QuantityMode = "same_for_all" | "by_group" | "per_person" | "default_with_exceptions" | "order_total";
export type ValueMode = "same_for_all" | "by_group" | "per_person" | "default_with_exceptions";
import { ORDER_STATUSES, type OrderStatus } from "./order-statuses";
export { ORDER_STATUSES, type OrderStatus };

export type OrderField = { id: string; name: string; type: "text" | "number" | "date" | "dropdown"; options: string[]; required: boolean };
export type ArtworkAttachment = { id: string; name: string; mimeType: string; size: number; storageKey: string; addedAt: string };
export type ManufacturingLink = { manufacturerBusinessId: string; sourceBusinessId: string; sourceOrderId: string; sourceProductId: string };
export type RuleCondition = { fieldId: string; match: string };
export type RulePredicate = { conditions?: RuleCondition[]; conditionMode?: "all" | "any" };
export type SpecificationPolicy = { id: string; name: string; role: "colour" | "pattern" | "attribute" | "asset"; mode: ValueMode; defaultValue: string; groupFieldId?: string; groupRules: Array<RulePredicate & { match: string; value: string }>; required: boolean; attachments: ArtworkAttachment[] };
export type ProductPolicy = { id: string; name: string; sizeHeader: string; quantityMode: QuantityMode; defaultQuantity: number; orderTotal: number; quantityGroupFieldId?: string; quantityGroupRules: Array<RulePredicate & { match: string; quantity: number }>; specifications: SpecificationPolicy[]; manufacturingLink?: ManufacturingLink };
/** Shared body measurements may apply to several products; legacy product measurements remain independent. */
export type MeasurementPolicy = { id: string; name: string; type: "number" | "text"; appliesTo: string[]; shared?: boolean; requiredMode: "Optional" | "When present" | "Always"; requiredWhen?: RulePredicate };
export type OrderRecord = { recordId: string; personId: string; values: Record<string, string | number>; held?: boolean };
export type OrderDetails = { orderNo: string; orderDate: string; deliveryDate: string; clientName: string; clientType: string; contactPerson: string; attnRequired: boolean; contactNumber: string; shipTo: string; billTo: string; remarks: string };
export type OrderRevision = { revision: number; at: string; reason: string; recordCount: number };
export type SeikoOrder = { googleSheet?: { id:string; url:string; peopleSheetId?:number }; commerce?: OrderCommerce; orderId: string; status: OrderStatus; archived: boolean; details: OrderDetails; fields: OrderField[]; products: ProductPolicy[]; measurements: MeasurementPolicy[]; records: OrderRecord[]; revisions: OrderRevision[]; updatedAt: string; workspace?: { columnOrder?: string[]; hiddenColumns?: string[]; columnWidths?: Record<string, number>; columnAlignments?: Record<string, "left" | "center" | "right"> } };

// Preset definitions must be safe during a Workers module cold start.
// Order creation assigns fresh IDs when it copies these templates.
function presetField(name: string): OrderField { return { id: `preset:${name}`, name, type: "text", options: [], required: false }; }
export const CLIENT_TYPE_PRESETS: Record<string, OrderField[]> = {
  "School / Institution": [presetField("Name"), presetField("Class / Section"), presetField("Roll number")],
  "Corporate / Industrial": [presetField("Employee name"), presetField("Employee code"), presetField("Department"), presetField("Designation")],
  "Healthcare Facility": [presetField("Staff name"), presetField("Employee code"), presetField("Department"), presetField("Designation")],
  "Retail / Individual": [presetField("Customer name"), presetField("Reference number")],
  "Dealer / Reseller": [presetField("Account / person"), presetField("Location")],
  Custom: [presetField("Person / record name"), presetField("Group / department"), presetField("Reference / ID")],
};

export function field(name: string, required = false): OrderField { return { id: crypto.randomUUID(), name, type: "text", options: [], required }; }
export function blankProduct(): ProductPolicy { return { id: crypto.randomUUID(), name: "", sizeHeader: "Size", quantityMode: "same_for_all", defaultQuantity: 1, orderTotal: 0, quantityGroupRules: [], specifications: [] }; }
export function blankSpecification(role: SpecificationPolicy["role"] = "attribute"): SpecificationPolicy { return { id: crypto.randomUUID(), name: role === "colour" ? "Colour" : role === "asset" ? "Logo / Artwork" : "", role, mode: "same_for_all", defaultValue: "", groupRules: [], required: true, attachments: [] }; }
export function blankMeasurement(): MeasurementPolicy { return { id: crypto.randomUUID(), name: "", type: "number", appliesTo: [], requiredMode: "Optional" }; }
export function orderStoreKey(businessId: string) { return `jinam:${businessId}:orders-v1`; }
export function productionLinkStoreKey(manufacturerBusinessId: string) { return `jinam:${manufacturerBusinessId}:production-links-v1`; }

export type WorkspaceColumn = { id: string; label: string; required: boolean; groupId: string; groupLabel: string };

/**
 * Preserve explicitly shared measurements and mirror their entered value for downstream consumers.
 * Older orders could link one non-shared measurement definition to several products. Split those
 * definitions deterministically and move any already-entered workspace values to the
 * new product-specific keys. This is safe to run repeatedly.
 */
export function normalizeProductMeasurements(order: SeikoOrder): SeikoOrder {
  const migrations: Array<{ oldKey: string; newKey: string }> = [];
  const measurements: MeasurementPolicy[] = [];

  for (const measurement of order.measurements || []) {
    const productIds = [...new Set((measurement.appliesTo || []).filter(id => order.products.some(product => product.id === id)))];
    if (measurement.shared || productIds.length <= 1) {
      measurements.push({ ...measurement, appliesTo: productIds });
      continue;
    }

    for (const productId of productIds) {
      const splitId = `${measurement.id}__${productId}`;
      measurements.push({ ...measurement, id: splitId, appliesTo: [productId] });
      migrations.push({
        oldKey: `measurement:${measurement.id}:product:${productId}`,
        newKey: `measurement:${splitId}:product:${productId}`,
      });
    }
  }

  if (!migrations.length && !measurements.some(item=>item.shared)) return { ...order, measurements };

  const records = order.records.map(record => {
    let values = record.values;
    for (const migration of migrations) {
      if (!(migration.oldKey in values) || migration.newKey in values) continue;
      if (values === record.values) values = { ...record.values };
      values[migration.newKey] = values[migration.oldKey];
      delete values[migration.oldKey];
    }
    values=sharedMeasurementValues({...order,measurements},values);
    return values === record.values ? record : { ...record, values };
  });

  return { ...order, measurements, records };
}

/** Keep canonical shared values and per-product compatibility keys in sync without discarding conflicts. */
export function sharedMeasurementValues(order: Pick<SeikoOrder,"measurements">, source: OrderRecord["values"]): OrderRecord["values"] {
  let values=source;
  const set=(key:string,value:string|number)=>{if(values[key]===value)return;if(values===source)values={...source};values[key]=value;};
  for(const measurement of order.measurements.filter(item=>item.shared&&item.appliesTo.length)){
    const key=`measurement:${measurement.id}:shared`, aliases=measurement.appliesTo.map(id=>`measurement:${measurement.id}:product:${id}`);
    if(!(key in values)){
      const entered=[...new Set(aliases.map(id=>values[id]).filter(v=>v!==undefined&&String(v).trim()!=="").map(String))];
      if(entered.length===1)set(key,entered[0]);
    }
    if(key in values)for(const alias of aliases)set(alias,values[key]);
  }
  return values;
}

export function workspaceColumns(order: SeikoOrder): WorkspaceColumn[] {
  const normalized = normalizeProductMeasurements(order);
  const columns: WorkspaceColumn[] = normalized.fields.map(item => ({ id: `field:${item.id}`, label: item.name, required: item.required, groupId: "record", groupLabel: "Person / record" }));
  for(const measurement of normalized.measurements.filter(item=>item.shared&&item.appliesTo.length&&item.name.trim()))columns.push({id:`measurement:${measurement.id}:shared`,label:measurement.name,required:measurement.requiredMode!=="Optional",groupId:"shared-measurements",groupLabel:"Shared measurements"});
  for (const product of normalized.products) {
    if (!product.name.trim()) continue;
    const group = { groupId: `product:${product.id}`, groupLabel: product.name };
    if (product.quantityMode === "per_person") columns.push({ id: `product:${product.id}:qty`, label: "Quantity", required: true, ...group });
    if (product.quantityMode === "default_with_exceptions") columns.push({ id: `product:${product.id}:qty_override`, label: "Quantity override", required: false, ...group });
    for (const spec of product.specifications) {
      if (spec.mode === "per_person") columns.push({ id: `spec:${spec.id}`, label: spec.name, required: spec.required, ...group });
      if (spec.mode === "default_with_exceptions") columns.push({ id: `spec:${spec.id}:override`, label: `${spec.name} override`, required: false, ...group });
    }
    for (const measurement of normalized.measurements.filter(item => !item.shared && item.appliesTo.includes(product.id) && item.name.trim())) {
      columns.push({
        id: `measurement:${measurement.id}:product:${product.id}`,
        label: measurement.name,
        required: measurement.requiredMode === "Always" || measurement.requiredMode === "When present",
        ...group,
      });
    }
  }
  const savedOrder = order.workspace?.columnOrder || [];
  if (!savedOrder.length) return columns;
  const rank = new Map(savedOrder.map((id, index) => [id, index]));
  return [...columns].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

/**
 * A group rule can target one value, several comma/semicolon/new-line values,
 * or a compact whole-number range such as 1-7.
 */
export function groupRuleValues(match: string): string[] {
  return match.split(/[;,\n]/).flatMap(raw => {
    const value = raw.trim();
    if (!value) return [];
    const range = value.match(/^(-?\d+)\s*[-–]\s*(-?\d+)$/);
    if (!range) return [value];
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Math.abs(end - start) > 500) return [value];
    const direction = start <= end ? 1 : -1;
    return Array.from({ length: Math.abs(end - start) + 1 }, (_, index) => String(start + index * direction));
  });
}

export function groupRuleMatches(match: string, sourceValue: string): boolean {
  const needle = sourceValue.trim().toLocaleLowerCase();
  return groupRuleValues(match).some(value => value.toLocaleLowerCase() === needle);
}

export function ruleConditions(rule:RulePredicate & {match?:string}, legacyFieldId?:string):RuleCondition[]{
 return rule.conditions?.length?rule.conditions:legacyFieldId?[{fieldId:legacyFieldId,match:rule.match||""}]:[];
}
export function conditionValue(record:OrderRecord,fieldId:string){return String(record.values[fieldId.includes(":")?fieldId:"field:"+fieldId]??"").trim();}
export function predicateState(rule:RulePredicate & {match?:string},record:OrderRecord,legacyFieldId?:string):"match"|"no_match"|"pending"{
 const conditions=ruleConditions(rule,legacyFieldId);if(!conditions.length)return "match";
 const states=conditions.map(c=>!c.fieldId||!c.match.trim()||!conditionValue(record,c.fieldId)?"pending":groupRuleMatches(c.match,conditionValue(record,c.fieldId))?"match":"no_match");
 return rule.conditionMode==="any"?(states.includes("match")?"match":states.includes("pending")?"pending":"no_match"):(states.includes("no_match")?"no_match":states.includes("pending")?"pending":"match");
}
export function resolveRuleValue<T,R extends RulePredicate & {match:string}>(rules:R[],record:OrderRecord,legacyFieldId:string|undefined,value:(r:R)=>T,fallback:T):{value:T;state:"ready"|"pending"|"conflict"}{
 const states=rules.map(rule=>({rule,state:predicateState(rule,record,legacyFieldId)})),matched=states.filter(r=>r.state==="match");
 const results=[...new Set(matched.map(r=>JSON.stringify(value(r.rule))))];
 if(results.length>1)return {value:fallback,state:"conflict"};
 if(states.some(r=>r.state==="pending"))return {value:fallback,state:"pending"};
 return {value:matched.length?value(matched[0].rule):fallback,state:"ready"};
}
const nonblank=(v:unknown)=>v!==undefined&&v!==null&&String(v).trim()!=="";
export function specificationForRecord(spec:SpecificationPolicy,record:OrderRecord):string{
 const override=record.values['spec:'+spec.id+':override'];if(nonblank(override))return String(override);
 if(spec.role==="asset")return (spec.attachments||[]).map(a=>a.name).join(", ");
 if(spec.mode==="per_person")return String(record.values['spec:'+spec.id]??"");
 if(spec.mode==="by_group"){const result=resolveRuleValue(spec.groupRules,record,spec.groupFieldId,r=>r.value,spec.defaultValue||"");return result.state==="ready"?result.value:"";}
 return spec.defaultValue||"";
}
export function quantityForRecord(product: ProductPolicy, record: OrderRecord, firstRecord = false): number {
 if(product.quantityMode==="order_total")return firstRecord?Math.max(0,Number(product.orderTotal)||0):0;
 for(const key of ['product:'+product.id+':assigned_qty','product:'+product.id+':qty_override','product:'+product.id+':qty']){const v=record.values[key];if(nonblank(v)&&Number.isFinite(Number(v))&&Number(v)>=0)return Number(v);}
 if(product.quantityMode==="by_group"){const result=resolveRuleValue(product.quantityGroupRules||[],record,product.quantityGroupFieldId,r=>Number(r.quantity),Math.max(0,Number(product.defaultQuantity)||0));return result.state==="ready"?Math.max(0,result.value):0;}
 return Math.max(0, Number(product.defaultQuantity) || 0);
}
export function measurementRequired(measurement:MeasurementPolicy,record:OrderRecord){return measurement.requiredMode!=="Optional"&&(!measurement.requiredWhen?.conditions?.length||predicateState(measurement.requiredWhen,record)==="match");}
export function recordRuleIssues(order:SeikoOrder,record:OrderRecord):string[]{
 const issues:string[]=[];
 for(const p of order.products){
  const explicit=['product:'+p.id+':qty_override','product:'+p.id+':assigned_qty','product:'+p.id+':qty'].some(k=>nonblank(record.values[k]));
  if(p.quantityMode==="by_group"&&!explicit){const r=resolveRuleValue(p.quantityGroupRules||[],record,p.quantityGroupFieldId,x=>Number(x.quantity),p.defaultQuantity);if(r.state!=="ready")issues.push(p.name+" quantity: "+r.state);}
  if(quantityForRecord(p,record)<=0)continue;
  for(const spec of p.specifications.filter(s=>s.mode==="by_group"&&!nonblank(record.values['spec:'+s.id+':override']))){const r=resolveRuleValue(spec.groupRules,record,spec.groupFieldId,x=>x.value,spec.defaultValue);if(r.state!=="ready")issues.push(p.name+" / "+spec.name+": "+r.state);}
  for(const m of order.measurements.filter(m=>m.appliesTo.includes(p.id)&&m.requiredMode!=="Optional"&&m.requiredWhen?.conditions?.length))if(predicateState(m.requiredWhen!,record)==="pending")issues.push(m.name+" requirement: pending");
 }
 return [...new Set(issues)];
}
/** Compare possible matches before any people have been entered. */
export function predicatesOverlap(a:RulePredicate & {match?:string},af:string|undefined,b:RulePredicate & {match?:string},bf:string|undefined){
 const terms=(r:RulePredicate & {match?:string},f?:string)=>{const c=ruleConditions(r,f);return r.conditionMode==="any"?c.map(x=>[x]):[c];};
 return terms(a,af).some(at=>terms(b,bf).some(bt=>{const domains=new Map<string,Set<string>>();for(const c of [...at,...bt]){if(!c.fieldId||!c.match.trim())return false;const key=c.fieldId.replace(/^field:/,""),v=new Set(groupRuleValues(c.match).map(x=>x.toLocaleLowerCase()));const prior=domains.get(key);const next=prior?new Set([...prior].filter(x=>v.has(x))):v;if(!next.size)return false;domains.set(key,next);}return true;}));
}
export function predicateErrors(order:SeikoOrder,rule:RulePredicate):string[]{
 if(rule.conditionMode&&!['all','any'].includes(rule.conditionMode))return ['Choose all or any conditions.'];
 if(rule.conditions===undefined)return [];
 if(!Array.isArray(rule.conditions)||!rule.conditions.length||rule.conditions.length>8)return ['Use between one and eight conditions.'];
 return rule.conditions.some(c=>!c||typeof c.fieldId!=="string"||!ruleSourceFields(order).some(f=>f.id===c.fieldId||'field:'+f.id===c.fieldId)||typeof c.match!=="string"||!groupRuleValues(c.match).length)?['Complete each condition using an existing person detail.']:[];
}
export function orderRuleErrors(order:SeikoOrder):string[]{
 const errors:string[]=[];
 for(const p of order.products||[]){const sets=[{name:p.name+' quantity',rules:p.quantityMode==='by_group'?p.quantityGroupRules:[],field:p.quantityGroupFieldId,value:(r:RulePredicate & {match:string;quantity?:number;value?:string})=>r.quantity},...p.specifications.filter(s=>s.mode==='by_group').map(s=>({name:p.name+' / '+s.name,rules:s.groupRules,field:s.groupFieldId,value:(r:RulePredicate & {match:string;quantity?:number;value?:string})=>r.value}))];for(const set of sets){for(const r of set.rules)errors.push(...predicateErrors(order,r).map(e=>set.name+': '+e));for(let i=0;i<set.rules.length;i++)for(let j=i+1;j<set.rules.length;j++)if((set.rules[i].conditions?.length||set.rules[j].conditions?.length)&&set.value(set.rules[i])!==set.value(set.rules[j])&&predicatesOverlap(set.rules[i],set.field,set.rules[j],set.field))errors.push(set.name+': conflicting rules '+(i+1)+' and '+(j+1)+'. Make their conditions distinct.');}}
 const prices=order.commerce?.rules||[];for(const r of prices)errors.push(...predicateErrors(order,r).map(e=>r.name+': '+e));for(let i=0;i<prices.length;i++)for(let j=i+1;j<prices.length;j++){const a=prices[i],b=prices[j];if(!(a.conditions?.length||b.conditions?.length)||a.mode!==b.mode||a.mode==='fixed')continue;const ids=(r:typeof a)=>r.contents.flatMap(x=>[x.productId,...(x.alternatives||[])]);if(ids(a).some(id=>ids(b).includes(id))&&predicatesOverlap(a,a.fieldId,b,b.fieldId))errors.push('Overlapping pricing conditions: '+a.name+' and '+b.name+'. Make their groups distinct.');}
 for(const m of order.measurements||[])if(m.requiredWhen)errors.push(...predicateErrors(order,m.requiredWhen).map(e=>m.name+': '+e));
 return [...new Set(errors)];
}

export function readinessIssues(order: SeikoOrder): string[] {
  const normalized = normalizeProductMeasurements(order);
  const issues = validateOrder(normalized);
  for(const r of normalized.records)issues.push(...recordRuleIssues(normalized,r).map(e=>r.personId+": "+e));
  for(const m of normalized.measurements.filter(item=>item.shared))if(normalized.records.some(r=>!(`measurement:${m.id}:shared` in r.values)&&new Set(m.appliesTo.map(id=>r.values[`measurement:${m.id}:product:${id}`]).filter(v=>v!==undefined&&String(v).trim()!=="").map(String)).size>1))issues.push(`Existing ${m.name} values differ between products. Enter a common value in Shared measurements to resolve them.`);
  if (!normalized.records.length) issues.push("No person / record entries yet. You can still save this order.");
  if (!normalized.products.some(product => product.name.trim())) issues.push("No products defined yet. Add them now or later.");
  for (const product of normalized.products) {
    if (product.quantityMode === "by_group") {
      const rules = product.quantityGroupRules || [];
      if (rules.some(r=>!r.conditions?.length) && !product.quantityGroupFieldId) issues.push(`Choose a grouping field for ${product.name || "this product"} quantity exceptions.`);
      if (rules.some(rule => !rule.conditions?.length && !groupRuleValues(rule.match).length || !Number.isFinite(Number(rule.quantity)) || Number(rule.quantity) < 0)) issues.push(`Complete every group quantity exception for ${product.name || "this product"}.`);
    }
    for (const spec of product.specifications.filter(item => item.mode === "by_group")) {
      if (spec.groupRules.some(r=>!r.conditions?.length) && !spec.groupFieldId) issues.push(`Choose a grouping field for ${product.name} - ${spec.name}.`);
      if (!spec.groupRules.length) issues.push(`Add group rules for ${product.name} - ${spec.name}.`);
      if (spec.groupRules.some(rule => !rule.conditions?.length && !rule.match.trim() || !rule.value.trim())) issues.push(`Complete every group rule for ${product.name} - ${spec.name}.`);
    }
  }
  return [...new Set(issues)];
}

export function validateOrder(order: SeikoOrder): string[] {
  const errors: string[] = [];
  if (!order.details.clientName.trim()) errors.push("Client name is required.");
  if (!order.details.contactNumber?.trim()) errors.push("Phone number is required.");
  if (order.details.attnRequired && !order.details.contactPerson.trim()) errors.push("Attn name is required for this order.");
  errors.push(...orderRuleErrors(order));
  return errors;
}

export function saveRevision(order: SeikoOrder, reason: string): SeikoOrder {
  const normalized = normalizeProductMeasurements(order);
  const now = new Date().toISOString();
  return { ...normalized, status: normalized.status === "Draft" && normalized.records.length ? "Active" : normalized.status, updatedAt: now, revisions: [...normalized.revisions, { revision: normalized.revisions.length + 1, at: now, reason, recordCount: normalized.records.length }] };
}

export function usesStructuredRules(order:SeikoOrder){return order.products.some(p=>p.quantityGroupRules?.some(r=>r.conditions?.length)||p.specifications.some(s=>s.groupRules?.some(r=>r.conditions?.length)))||order.measurements.some(m=>m.requiredWhen?.conditions?.length)||Boolean(order.commerce?.rules.some(r=>r.conditions?.length));}

/** Rule inputs are saved values, never other calculated rule results. */
export function ruleSourceFields(order:SeikoOrder):OrderField[]{return [...(order.fields||[]),...(order.products||[]).flatMap(p=>p.specifications.filter(s=>s.mode==="per_person"&&s.role!=="asset").map(s=>({id:"spec:"+s.id,name:p.name+" / "+s.name,type:"text" as const,options:[],required:false}))),...(order.measurements||[]).filter(m=>m.appliesTo.some(id=>order.products.some(p=>p.id===id))).flatMap(m=>(m.shared?[{id:"measurement:"+m.id+":shared",name:(m.appliesTo.length===1?(order.products.find(p=>p.id===m.appliesTo[0])?.name||"Product"):"Shared")+" / "+m.name}]:m.appliesTo.map(id=>({id:"measurement:"+m.id+":product:"+id,name:(order.products.find(p=>p.id===id)?.name||"Product")+" / "+m.name}))).map(f=>({...f,type:m.type,options:[],required:false})))];}
