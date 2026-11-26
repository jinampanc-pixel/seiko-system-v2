"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./label-set-name.css";
export function useLabelSetName(){
 const [name,setName]=useState<string|null>(null);
 const answer=useRef<((name:string|null)=>void)|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const finish=(value:string|null)=>{answer.current?.(value);answer.current=null;setName(null);};
 useEffect(()=>{if(name!==null&&!dialog.current?.open)dialog.current?.showModal();},[name]);
 useEffect(()=>()=>{answer.current?.(null);answer.current=null;},[]);
 const ask=(initial="",existingId="")=>new Promise<string|null>(resolve=>{if(existingId&&sessionStorage.getItem("jinam:labels:direct-print-id")===existingId){sessionStorage.removeItem("jinam:labels:direct-print-id");resolve(initial);return;}answer.current?.(null);answer.current=resolve;setName(initial);});
 const namingDialog=name===null?null:createPortal(<dialog ref={dialog} className="labelSetNameDialog" aria-label="Save Label Set" onKeyDown={event=>{if(event.key==="Escape")event.stopPropagation();}} onCancel={event=>{event.preventDefault();finish(null);}}><form onSubmit={event=>{event.preventDefault();if(name.trim())finish(name.trim());}}><h2>Save Label Set</h2><label>Label Set Name<input required maxLength={160} value={name} onChange={event=>setName(event.target.value)} /></label><div><button type="button" onClick={()=>finish(null)}>Cancel</button><button className="primary" type="submit" disabled={!name.trim()}>Save</button></div></form></dialog>,document.body);
 return {askLabelSetName:ask,namingDialog};
}
