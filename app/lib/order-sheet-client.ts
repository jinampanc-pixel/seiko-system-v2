import { normalizeProductMeasurements, type SeikoOrder } from "./order-domain";
import { acceptSharedOrder, requestOrders, type OrderEnvelope } from "./order-commands";
function canonical(value:unknown):unknown {return Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;}
function sourceData(order:SeikoOrder){const o=normalizeProductMeasurements(order);return JSON.stringify(canonical({fields:o.fields,products:o.products,measurements:o.measurements,records:o.records.map(r=>({...r,held:Boolean(r.held)})),people:Object.fromEntries(Object.entries(o.commerce?.people||{}).map(([id,p])=>[id,{state:p.state,readySize:p.readySize||""}]))}));}
/** Stops an already-built output if its sheet source changed. The user rebuilds
 * from the accepted fresh cache; stale selections are never silently printed. */
export async function ensureOrderSheetFreshForOutput(order:SeikoOrder){
 if(!order.googleSheet)return;
 const response=await fetch("/api/erp/order-sheets",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({operation:"sync",orderId:order.orderId})}),result=await response.json();
 if(!response.ok||!result.ok)throw Error(result.message||"Google Sheet could not be verified. Printing is stopped until a successful sync.");
 const latest=await requestOrders<{orders:OrderEnvelope[]}>({operation:"list",businessId:"seiko",orderIds:[order.orderId]});if(!latest.ok)throw Error(latest.message);const envelope=latest.data.orders[0];if(!envelope)throw Error("The source order is unavailable.");acceptSharedOrder("seiko",envelope);
 if(sourceData(order)!==sourceData(envelope.order))throw Error("The Google Sheet changed. Fresh records have been loaded. Reopen or rebuild this report/label selection before printing.");
}

/** Retry only a busy lease; never replay other errors or change the edit identity. */
export async function requestOrderSheet(body:Record<string,unknown>){
 for(let attempt=0;attempt<6;attempt++){
  let response:Response,result;
  try{response=await fetch("/api/erp/order-sheets",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});result=await response.json();}
  catch{throw Error("The sheet did not confirm this request in time. Your entry is retained. Retry save to check and finish the same entry safely.");}
  if(result.code==="SHEET_BUSY"&&attempt<5){await new Promise(resolve=>setTimeout(resolve,Math.min(1000*2**attempt,5000)));continue;}
  if(!response.ok||!result.ok)throw Error(result.message||"Google Sheets is unavailable. Your entry is retained.");
  return result;
 }
 throw Error("The sheet is still busy. Your entry is retained; retry save shortly.");
}
