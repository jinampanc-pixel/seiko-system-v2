export type OutputContext={businessId:string;kind:"order"|"production"|"billing"|"receipt"|"labels";id:string;title?:string};
export type OutputListAction="keep-record"|"queue-print"|"confirm-printed"|"remove-from-list";
export type OutputAction=OutputListAction|"pdf-prepared"|"download-requested"|"print-requested"|"document-opened"|"share-requested";
export async function recordOutput(context:OutputContext,action:OutputAction,content?:string){
 const digest=content?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,"0")).join(""):undefined;
 return saveOutputStatus(context,action,digest);
}
export async function saveOutputStatus(context:OutputContext,action:OutputAction,digest?:string){
 const response=await fetch("/api/erp/activity",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...context,action,digest,eventId:crypto.randomUUID()})});
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||"Activity could not be recorded. Retry before printing or exporting.");
 window.dispatchEvent(new Event("jinam:output-list-updated"));
}
