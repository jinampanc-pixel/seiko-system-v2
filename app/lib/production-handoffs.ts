import { groupRuleMatches, normalizeProductMeasurements, quantityForRecord, type SeikoOrder } from './order-domain';
import { packingQuantities } from './packing-label-model';

export type ProductionDemand = {
  key: string; orderId: string; orderNo: string; client: string; productId: string; product: string;
  variant: string; specifications: string; cuttingSignature: string; quantity: number; sourceQuantity:number; unresolved: boolean; sourceVersion: number; members:{recordId:string;quantity:number}[];
};
export type ProductionAllocation = ProductionDemand & { quantity: number; lay: string; stack: string; issuedMembers?:{recordId:string;quantity:number}[] };
export type ProductionLay = { id: string; pattern: string; fabric: string; width: string; stretch: string; grain: string; direction: string; checks: string; confirmed: boolean };
export type ProductionEvent = { id: string; at: string; actor: string; allocationKey: string; operation: string; quantity: number; rejects: number; extras: number; reason: string };
export type ProductionHandoff = {
  id: string; number: string; name: string; status: 'Draft'|'Released'|'In progress'|'Closed'|'Cancelled';
  purpose: 'normal'|'rework'|'extra'; reason: string; allocations: ProductionAllocation[]; lays: ProductionLay[];
  events: ProductionEvent[]; history: { at: string; actor: string; action: string }[]; createdAt: string;
};
export type ProductionLedger = { handoffs: ProductionHandoff[] };
export type ProductionOrder = { order: SeikoOrder; version: number };
const text = (value: unknown) => String(value ?? '').trim();
export const productionKey = (values: unknown[]) => JSON.stringify(values);
export function productionDemand(orders: ProductionOrder[]): ProductionDemand[] {
  const result = new Map<string, ProductionDemand>();
  for (const { order: raw, version } of orders) {
    if (raw.archived || (raw as SeikoOrder & {deletedAt?:string}).deletedAt) continue;
    const order = normalizeProductMeasurements(raw), quantities = packingQuantities(order);
    const records = order.records.filter(record => !record.held);
    for (const product of order.products.filter(item => item.name.trim())) {
      const measurements = order.measurements.filter(item => item.appliesTo[0] === product.id && item.name.trim());
      const rows = product.quantityMode === 'order_total' ? [{ recordId: 'order-total', personId: '', values: {} as Record<string,string|number> }] : records;
      rows.forEach((record, index) => {
        const blankRecord = !Object.keys(record.values).some(key => /^(measurement:|spec:)/.test(key) && text(record.values[key]));
        const quantity = product.quantityMode === 'order_total' ? product.orderTotal : blankRecord ? quantityForRecord(product, record, index === 0) : quantities.get(record.recordId)?.[product.id] || 0;
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        const values = measurements.map(item => ({ name: item.name, value: text(record.values[`measurement:${item.id}:product:${product.id}`]), required: item.requiredMode !== 'Optional' }));
        let unresolved = !Number.isSafeInteger(quantity) || quantity > 100000 || product.quantityMode !== 'order_total' && measurements.length > 0 && (values.every(item => !item.value) || values.some(item => item.required && !item.value));
        const specs = product.specifications.map(spec => {
          const value = spec.mode === 'per_person' ? text(record.values[`spec:${spec.id}`]) : spec.mode === 'default_with_exceptions' ? text(record.values[`spec:${spec.id}:override`]) || spec.defaultValue : spec.mode === 'by_group' ? spec.groupRules.find(rule => groupRuleMatches(rule.match, text(record.values[`field:${spec.groupFieldId}`])))?.value || spec.defaultValue : spec.defaultValue;
          if (spec.required && !text(value)) unresolved = true;
          return { name: spec.name, role:spec.role, value: text(value) };
        });
        const variant = values.filter(item => item.value).map(item => `${item.name}: ${item.value}`).join(' / ') || (measurements.length ? 'Measurements not entered' : 'No measurements required');
        const cuttingSignature=specs.filter(item=>(item.role==='pattern'||item.role==='attribute')&&item.value).map(item=>`${item.name}: ${item.value}`).sort().join(' / ');
        const specifications = specs.filter(item => item.value).map(item => `${item.name}: ${item.value}`).join(' · ');
        // Product IDs and order IDs keep allocations separate even when cutting descriptions match.
        const key = productionKey([order.orderId, product.id, variant, specifications, unresolved]);
        const previous = result.get(key);
        if (previous) { previous.quantity += quantity; previous.members.push({recordId:record.recordId,quantity}); }
        else result.set(key, { key, orderId: order.orderId, orderNo: order.details.orderNo, client: order.details.clientName, productId: product.id, product: product.name.trim(), variant, specifications, cuttingSignature, quantity, sourceQuantity:quantity, unresolved, sourceVersion: version, members:[{recordId:record.recordId,quantity}] });
      });
    }
  }
  return [...result.values()].map(row=>({...row,sourceQuantity:row.quantity})).sort((a,b) => a.product.localeCompare(b.product) || a.variant.localeCompare(b.variant, undefined, {numeric:true}) || a.orderNo.localeCompare(b.orderNo));
}
function claimedMembers(row:ProductionAllocation) {
  if(row.issuedMembers)return row.issuedMembers;
  let remaining=row.quantity;
  return row.members.map(member=>{const quantity=Math.min(member.quantity,remaining);remaining-=quantity;return {recordId:member.recordId,quantity};});
}
export function issuedQuantity(ledger: ProductionLedger, demand: ProductionDemand|string, exceptId = '') {
  return ledger.handoffs.filter(item => item.id !== exceptId && item.status !== 'Draft' && item.status !== 'Cancelled' && item.purpose === 'normal').reduce((sum,item) => sum + item.allocations.reduce((n,row)=>{
    if(typeof demand==='string')return n+(row.key===demand?row.quantity:0);
    if(row.orderId!==demand.orderId||row.productId!==demand.productId)return n;
    return n+claimedMembers(row).filter(member=>demand.members.some(current=>current.recordId===member.recordId)).reduce((total,member)=>total+member.quantity,0);
  },0),0);
}
export function reserveMembers(handoff:ProductionHandoff, ledger:ProductionLedger, demand:ProductionDemand[]) {
  for(const row of handoff.allocations){
    const current=demand.find(item=>item.key===row.key)!;let remaining=row.quantity;
    row.issuedMembers=current.members.map(member=>{
      const used=issuedQuantity(ledger,{...current,members:[member]},handoff.id);
      const quantity=handoff.purpose==='normal'?Math.min(Math.max(0,member.quantity-used),remaining):remaining;
      remaining-=quantity;return {recordId:member.recordId,quantity};
    }).filter(member=>member.quantity>0);
    if(remaining>0)throw new Error('Some source records have already been issued, even if their size or colour changed.');
  }
}
export function cuttingGroups(allocations: ProductionAllocation[]) {
  const groups = new Map<string,{product:string;variant:string;quantity:number;allocations:ProductionAllocation[]}>();
  for (const row of allocations) {
    const key = productionKey([row.product.toLocaleLowerCase(), row.variant, row.cuttingSignature]);
    const group = groups.get(key) || {product:row.product,variant:row.variant,quantity:0,allocations:[]};
    group.quantity += row.quantity; group.allocations.push(row); groups.set(key,group);
  }
  return [...groups.values()];
}
export function validateRelease(handoff: ProductionHandoff, ledger: ProductionLedger, demand: ProductionDemand[]) {
  if (!handoff.name.trim() || !handoff.allocations.length) throw new Error('Name the handoff and select at least one quantity.');
  if (!['normal','rework','extra'].includes(handoff.purpose)) throw new Error('Choose a valid handoff purpose.');
  if (handoff.purpose !== 'normal' && !handoff.reason.trim()) throw new Error('Explain the authorised extra production or rework.');
  const seen = new Set<string>();
  for (const row of handoff.allocations) {
    if (seen.has(row.key) || !Number.isSafeInteger(row.quantity) || row.quantity <= 0 || row.quantity > 100000) throw new Error('Every allocation must have a unique identity and a positive whole quantity.');
    seen.add(row.key);
    const current = demand.find(item => item.key === row.key);
    if (!current || current.unresolved || current.sourceVersion !== row.sourceVersion) throw new Error('A source order changed or needs details. Refresh demand and review the handoff.');
    if (handoff.purpose === 'normal' && row.quantity + issuedQuantity(ledger,current,handoff.id) > current.quantity) throw new Error('These quantities have already been issued or exceed current order demand.');
    if (row.lay && !handoff.lays.some(lay => lay.id === row.lay)) throw new Error('Choose an existing cutting lay.');
  }
  for (const lay of handoff.lays) {
    if (!handoff.allocations.some(row => row.lay === lay.id)) continue;
    if (!lay.confirmed || [lay.pattern,lay.fabric,lay.width,lay.stretch,lay.grain,lay.direction,lay.checks].some(value => !text(value))) throw new Error('Confirm pattern and fabric compatibility for every planned lay.');
    const rows = handoff.allocations.filter(row => row.lay === lay.id);
    if (rows.some(row => !row.stack.trim())) throw new Error('Name a fabric / colour stack for each allocation in a lay.');
  }
}
export function completedQuantity(handoff: ProductionHandoff, key: string, operation: string) {
  return handoff.events.filter(event => event.allocationKey === key && event.operation.trim().toLocaleLowerCase() === operation.trim().toLocaleLowerCase()).reduce((sum,event) => sum + event.quantity,0);
}
