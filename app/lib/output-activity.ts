export type OutputContext={businessId:string;kind:"order"|"production"|"billing"|"receipt"|"labels";id:string;title?:string};
export type OutputAction="pdf-prepared"|"download-requested"|"print-requested"|"document-opened"|"share-requested";
export async function recordOutput(context:OutputContext,action:OutputAction,content?:string){
 const digest=content?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,"0")).join(""):undefined;
 const response=await fetch("/api/erp/activity",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...context,action,digest,eventId:crypto.randomUUID()})});
 const data=await response.json();if(!response.ok||!data.ok)throw Error(data.message||"Activity could not be recorded. Retry before printing or exporting.");
}
