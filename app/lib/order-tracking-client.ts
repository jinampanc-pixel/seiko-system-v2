"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { OrderWorkflow, WorkflowCommand } from "./order-workflow";
type View={workflow:OrderWorkflow;version:number;loaded:boolean;error:string};
const empty:View={workflow:{notes:[],actions:[]},version:0,loaded:false,error:""};
const cache=new Map<string,View>(),listeners=new Map<string,Set<()=>void>>(),pending=new Map<string,{key:string;actor:string;businessId:string;orderId:string}>();
let timer:ReturnType<typeof setTimeout>|undefined,revision=0;const watchers=new Set<()=>void>();
const keyFor=(actor:string,businessId:string,orderId:string)=>JSON.stringify([actor,businessId,orderId]);
function put(key:string,value:View){if((cache.get(key)?.version||0)>value.version)return;cache.set(key,value);revision++;for(const callback of watchers)callback();for(const callback of listeners.get(key)||[])callback();}
export async function trackingRequest(body:Record<string,unknown>,actor:string){const response=await fetch("/api/erp/order-workflow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,requestedBy:actor}),cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.message||"Tracking could not be saved.");return result;}
function queue(actor:string,businessId:string,orderId:string){
 const key=keyFor(actor,businessId,orderId);pending.set(key,{key,actor,businessId,orderId});if(timer)return;
 timer=setTimeout(()=>{timer=undefined;const rows=[...pending.values()];pending.clear();const groups=new Map<string,typeof rows>();for(const row of rows){const group=JSON.stringify([row.actor,row.businessId]);groups.set(group,[...(groups.get(group)||[]),row]);}
 for(const group of groups.values())for(let index=0;index<group.length;index+=25){const chunk=group.slice(index,index+25),first=chunk[0];void trackingRequest({operation:"list",businessId:first.businessId,orderIds:chunk.map(r=>r.orderId)},first.actor).then(result=>{for(const row of chunk){const record=result.records.find((r:{orderId:string})=>r.orderId===row.orderId);put(row.key,record?{workflow:record.workflow,version:record.version,loaded:true,error:""}:{...empty,loaded:true,error:"Order unavailable."});}}).catch(cause=>{for(const row of chunk)put(row.key,{...(cache.get(row.key)||empty),loaded:true,error:(cause as Error).message});});}
 },0);
}
export function useOrderTracking(actor:string,businessId:string,orderId:string){
 const key=keyFor(actor,businessId,orderId);
 const view=useSyncExternalStore(callback=>{const group=listeners.get(key)||new Set();group.add(callback);listeners.set(key,group);return()=>{group.delete(callback);if(!group.size)listeners.delete(key);};},()=>cache.get(key)||empty,()=>empty);
 useEffect(()=>{queue(actor,businessId,orderId);const refresh=()=>{if(document.visibilityState!=="hidden")queue(actor,businessId,orderId);};window.addEventListener("focus",refresh);const interval=setInterval(refresh,30000);return()=>{window.removeEventListener("focus",refresh);clearInterval(interval);};},[actor,businessId,orderId]);
 return {...view,reload:()=>queue(actor,businessId,orderId),async update(command:WorkflowCommand){const result=await trackingRequest({operation:"update",businessId,orderId,command},actor);put(key,{workflow:result.record.workflow,version:result.record.version,loaded:true,error:""});return result.record.workflow as OrderWorkflow;}};
}

export function useOrderTrackingStatuses(actor:string,businessId:string,orderIds:string[]){
 const ids=JSON.stringify(orderIds),version=useSyncExternalStore(callback=>{watchers.add(callback);return()=>{watchers.delete(callback);};},()=>revision,()=>0);
 useEffect(()=>{const refresh=()=>{for(const id of JSON.parse(ids))queue(actor,businessId,id);};refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[actor,businessId,ids]);
 // The revision is the subscription token for the external cache read below.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 return useMemo(()=>new Map<string,string>((JSON.parse(ids) as string[]).map(id=>[id,cache.get(keyFor(actor,businessId,id))?.workflow.trackingStatus||''])),[actor,businessId,ids,version]);
}
