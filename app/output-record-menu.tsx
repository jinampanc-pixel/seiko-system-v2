"use client";
import { ActionMenu } from "./action-menu";
import { useRef, useState } from "react";
import { recordOutput, type OutputContext, type OutputListAction } from "./lib/output-activity";
export const OUTPUT_LIST_LABELS: Record<OutputListAction,string> = { "keep-record":"Keep for later", "queue-print":"To print", "confirm-printed":"Printed", "remove-from-list":"Remove from list" };
export function OutputRecordMenu({context,content,beforeSave}:{context:OutputContext;content?:string;beforeSave?:()=>Promise<unknown>}) {
 const menu=useRef<HTMLDetailsElement>(null),pending=useRef(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 async function save(action:OutputListAction){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");
  try{await beforeSave?.();await recordOutput(context,action,content);setNotice(action==="confirm-printed"?"Marked as printed by you.":"Marked as not printed.");if(menu.current)menu.current.open=false;}
  catch(e){setError((e as Error).message);}finally{pending.current=false;setBusy(false);}
 }
 return <div className="outputRecordControl"><ActionMenu menuRef={menu} label="Print Record">
  <button type="button" disabled={busy} onClick={()=>void save("queue-print")}>Mark as Not Printed</button>
  <button type="button" disabled={busy} onClick={()=>void save("confirm-printed")}>Mark as Printed</button>
  <small>Mark Printed after the actual print.</small>
 </ActionMenu>{notice&&<span role="status">{notice}</span>}{error&&<span role="alert">{error}</span>}</div>;
}
