"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { recordOutput } from "./lib/output-activity";
import "./saved-output-record.css";
type Event={action:string;actor:string;at:string;version:number};
export type SavedOutputRecord={id:string;version:number;savedBy:string;savedAt:string;events:Event[]};
export function useSavedOutputRecords(businessId:string,kind:"labels"|"production"|"billing"|"receipt",ids:string[]){
 const [records,setRecords]=useState<Record<string,SavedOutputRecord>>({}),[error,setError]=useState("");
 const signature=JSON.stringify([...new Set(ids)].sort());
 const refresh=useCallback(async()=>{const keys=JSON.parse(signature) as string[];if(!keys.length){setRecords({});return;}try{const entries=await Promise.all(Array.from({length:Math.ceil(keys.length/100)},async(_,i)=>{const r=await fetch('/api/erp/activity?'+new URLSearchParams({businessId,view:'records',kind,ids:JSON.stringify(keys.slice(i*100,i*100+100))}));const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||'Record history is unavailable.');return d.records as SavedOutputRecord[];}));setRecords(Object.fromEntries(entries.flat().map(r=>[r.id,r])));setError("");}catch(e){setError((e as Error).message);}},[businessId,kind,signature]);
 useEffect(()=>{void refresh();const changed=()=>void refresh();window.addEventListener('jinam:output-list-updated',changed);window.addEventListener('jinam:label-storage',changed);return()=>{window.removeEventListener('jinam:output-list-updated',changed);window.removeEventListener('jinam:label-storage',changed);};},[refresh]);
 return {records,error,refresh};
}
const labels:Record<string,string>={'confirm-printed':'Confirmed printed','queue-print':'Marked not printed','print-requested':'Print dialog requested','download-requested':'PDF download requested','pdf-prepared':'PDF prepared','document-opened':'Document opened','share-requested':'Share requested'};
const date=(at:string)=>!at?'Time unavailable':new Date(at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
export function SavedOutputRecordDetails({record,businessId,kind,id}:{record?:SavedOutputRecord;businessId:string;kind:"labels"|"production"|"billing"|"receipt";id:string}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);const pending=useRef(false);
 const latest=record?.events.find(e=>e.action==='confirm-printed'||e.action==='queue-print');
 const printed=latest?.action==='confirm-printed';
 async function mark(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await recordOutput({businessId,kind,id},printed?'queue-print':'confirm-printed');}catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}}
 return <div className="savedOutputRecord">
  <small>{record?.savedBy?<>Saved by {record.savedBy} · {date(record.savedAt)}</>:record?'Saved record · author unavailable':'Shared save pending or record history unavailable'}</small>
  <span className={printed?'savedPrintState printed':'savedPrintState'}>{printed?'Printed':'No print confirmation'}{latest&&<> · {latest.actor} · {date(latest.at)}{record&&latest.version!==record.version?' · earlier saved version':''}</>}</span>
  <details><summary>Print record</summary><div><p>Confirm after the actual print. Opening a print dialog does not confirm printing.</p><button type="button" className="secondary" disabled={busy||!record} onClick={()=>void mark()}>{printed?'Mark as not printed':'Mark as printed'}</button><ol>{record?.events.filter(e=>labels[e.action]).map((e,i)=><li key={i}>{labels[e.action]} · {e.actor} · {date(e.at)} · version {e.version}</li>)}</ol>{!record?.events.length&&<p>No output actions recorded.</p>}{error&&<p role="alert">{error}</p>}</div></details>
 </div>;
}
