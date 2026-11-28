"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import "./action-menu.css";
import { MoreIcon } from "./ui-icons";
export function ActionMenu({label,children,menuRef,iconOnly=false,viewport=false,closeOnAction=true}:{closeOnAction?:boolean;viewport?:boolean;iconOnly?:boolean;label:string;children:ReactNode;menuRef?:RefObject<HTMLDetailsElement|null>}){
 const owned=useRef<HTMLDetailsElement>(null),ref=menuRef||owned;
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(ref.current?.open&&!ref.current.contains(event.target as Node))ref.current.open=false;};
  const escape=(event:KeyboardEvent)=>{if(!event.defaultPrevented&&event.key==='Escape'&&ref.current?.open){event.preventDefault();event.stopPropagation();ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);};
 },[ref]);
 useEffect(()=>{
  if(!viewport)return;
  const root=ref.current,panel=root?.querySelector<HTMLElement>(':scope>div'),trigger=root?.querySelector('summary');
  if(!root||!panel||!trigger)return;
  const place=()=>{
   if(!root.open)return;
   const anchor=trigger.getBoundingClientRect();
   if(anchor.bottom<0||anchor.top>window.innerHeight){root.open=false;return;}
   panel.style.position='fixed';panel.style.boxSizing='border-box';panel.style.maxHeight=Math.max(0,window.innerHeight-24)+'px';panel.style.overflowY='auto';
   const size=panel.getBoundingClientRect();
   const left=Math.max(12,Math.min(anchor.right-size.width,window.innerWidth-size.width-12));
   const top=anchor.bottom+6+size.height<=window.innerHeight-12?anchor.bottom+6:Math.max(12,anchor.top-size.height-6);
   panel.style.left=left+'px';panel.style.right='auto';panel.style.top=top+'px';
  };
  root.addEventListener('toggle',place);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{root.removeEventListener('toggle',place);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[ref,viewport]);
 return <details ref={ref} name="output-actions" className={"documentMore"+(iconOnly?" iconOnlyActionMenu":"")}><summary aria-label={iconOnly?label:undefined}>{iconOnly?<MoreIcon/>:label}</summary><div onClickCapture={event=>{if(closeOnAction&&(event.target as Element).closest("button,a")&&ref.current)ref.current.open=false;}}>{children}</div></details>;
}
