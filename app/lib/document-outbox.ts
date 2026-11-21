"use client";
export type PendingDocument={id:string;queueId?:string;businessId:string;kind:'production'|'billing'|'receipt';title:string;html:string;body:Record<string,unknown>;actor:string;at:string;problem?:string;retryAfter?:number};
const key='jinam:pending-document-saves-v1';
let memory:PendingDocument[]|null=null,actor='',running=false;
export function setDocumentActor(email:string){actor=email;}
export function documentActor(){return actor;}
export function pendingDocuments():PendingDocument[]{try{const rows=memory||JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(rows)?rows:[];}catch{return memory||[];}}
function store(rows:PendingDocument[]){try{localStorage.setItem(key,JSON.stringify(rows));memory=null;}catch{memory=rows;}window.dispatchEvent(new Event('jinam:pending-documents'));}
export function retainPendingDocument(value:Omit<PendingDocument,'actor'|'at'>){const row={...value,queueId:crypto.randomUUID(),actor,at:new Date().toISOString()};store([...pendingDocuments().filter(r=>r.id!==row.id||r.businessId!==row.businessId||r.kind!==row.kind||r.actor!==actor),row]);return row;}
export function discardPendingDocument(id:string,businessId:string,queueId?:string){store(pendingDocuments().filter(row=>row.id!==id||row.businessId!==businessId||row.actor!==actor||queueId&&row.queueId!==queueId));}
export function documentOutboxIsVolatile(){return memory!==null;}
async function post(path:string,body:Record<string,unknown>,requestedBy=actor){const response=await fetch('/api/erp/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,requestedBy}),signal:AbortSignal.timeout(12000)});return {response,data:await response.json()};}
export async function syncPendingDocuments(){
 if(running||!actor||!navigator.onLine)return;running=true;
 try{for(const row of pendingDocuments().filter(row=>row.actor===actor&&!row.problem&&(!row.retryAfter||row.retryAfter<Date.now()))){
  try{
   if(row.actor!==actor)continue;
   let result;
   if(row.body.reviewPricing){const document=row.body.document as {orderId:string;taxMode:string;issueDate:string};const review=await post('order-billing',{operation:'review',orderId:document.orderId,basis:row.body.basis||'eligible',taxMode:document.taxMode},row.actor);if(row.actor!==actor)continue;result=!review.response.ok||!review.data.ok?review:await post('order-billing',{operation:'apply',orderId:document.orderId,basis:row.body.basis||'eligible',taxMode:document.taxMode,token:review.data.token,reason:'Invoice created from agreed order pricing',date:document.issueDate,document},row.actor);}
   else result=await post(row.kind==='production'?'production':'billing',row.body,row.actor);
   const {response,data}=result;
   if(!response.ok||!data.ok){if(response.status===409||response.status===403||response.status===400){store(pendingDocuments().map(item=>item.queueId===row.queueId&&item.id===row.id&&item.actor===row.actor?{...item,problem:data.message||'Review before retrying.'}:item));}continue;}
   discardPendingDocument(row.id,row.businessId,row.queueId);window.dispatchEvent(new CustomEvent('jinam:document-saved',{detail:{id:row.id,kind:row.kind,businessId:row.businessId}}));
  }catch{/* Keep the exact document and stable ID for the next connected retry. */}
 }}finally{running=false;}
}
export function retryPendingDocument(id:string,businessId:string){store(pendingDocuments().map(row=>row.id===id&&row.businessId===businessId?{...row,actor:row.actor||actor,problem:undefined,retryAfter:0}:row));void syncPendingDocuments();}
export function releasePendingDocument(id:string,businessId:string){store(pendingDocuments().map(row=>row.id===id&&row.businessId===businessId?{...row,retryAfter:0}:row));}
