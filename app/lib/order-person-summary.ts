import { quantityForRecord, type OrderRecord, type SeikoOrder } from './order-domain';

/** A read-only overview of the same stored measurements used by the entry editor. */
export function personGarmentSummary(order:SeikoOrder,record:OrderRecord){
 return order.products.flatMap(product=>{
  if(product.quantityMode==='order_total')return [];
  const quantity=quantityForRecord(product,record);if(quantity<=0)return [];
  const measurements=order.measurements.filter(measurement=>measurement.appliesTo.includes(product.id)).map(measurement=>{
   const value=String(record.values[measurement.shared?`measurement:${measurement.id}:shared`:`measurement:${measurement.id}:product:${product.id}`]??'').trim();
   return value?`${measurement.name}: ${value}`:'';
  }).filter(Boolean);
  const size=order.commerce?.people[record.recordId]?.readySize;
  return [{id:product.id,product:product.name,quantity,measurements:measurements.join(' · ')||(size?`Size: ${size}`:'')}];
 });
}
