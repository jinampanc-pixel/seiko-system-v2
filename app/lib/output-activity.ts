import { documentActor } from './document-outbox';
export type OutputContext={businessId:string;kind:"order"|"production"|"billing"|"receipt"|"labels";id:string;title?:string};
export type OutputListAction="keep-record"|"queue-print"|"confirm-printed"|"remove-from-list";
export type OutputAction=OutputListAction|"pdf-prepared"|"download-requested"|"print-requested"|"document-opened"|"share-requested";
export async function recordOutput(context:OutputContext,action:OutputAction,content?:string){
 const digest=content?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,"0")).join(""):undefined;
 if(['confirm-printed','queue-print','keep-record','remove-from-list'].includes(action))return saveOutputStatus(context,action,digest);
 const entry={...context,action,digest,eventId:crypto.randomUUID(),requestedBy:documentActor()};
 writePending([...readPending(),entry]);void flushOutputActivity();
}
type Pending=OutputContext&{action:OutputAction;digest?:string;eventId:string;requestedBy:string};
const pendingKey='jinam:pending-output-activity-v1';let volatile:Pending[]|null=null,running=false;
function readPending():Pending[]{try{const rows=volatile||JSON.parse(localStorage.getItem(pendingKey)||'[]');return Array.isArray(rows)?rows:[];}catch{return volatile||[];}}
function writePending(rows:Pending[]){try{localStorage.setItem(pendingKey,JSON.stringify(rows));volatile=null;}catch{volatile=rows;}window.dispatchEvent(new Event('jinam:output-list-updated'));}
export function pendingOutputCount(context?:OutputContext){return readPending().filter(row=>!context||row.businessId===context.businessId&&row.id===context.id&&row.kind===context.kind).length;}
export async function flushOutputActivity(){if(running||!navigator.onLine)return;running=true;const attempted=new Set<string>();try{for(;;){
 const row=readPending().find(item=>!attempted.has(item.eventId)&&(!item.requestedBy||item.requestedBy===documentActor()));if(!row)break;attempted.add(row.eventId);
 try{const response=await fetch('/api/erp/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row),signal:AbortSignal.timeout(8000)});const data=await response.json();if(response.ok&&data.ok)writePending(readPending().filter(item=>item.eventId!==row.eventId));}catch{/* Printing continues; the stable event ID retries later. */}
 }}finally{running=false;}}
export async function saveOutputStatus(context:OutputContext,action:OutputAction,digest?:string){
 const response=await fetch("/api/erp/activity",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...context,action,digest,eventId:crypto.randomUUID()})});
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||"Activity could not be recorded. Retry before printing or exporting.");
 window.dispatchEvent(new Event("jinam:output-list-updated"));
}
