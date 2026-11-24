"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import "./action-menu.css";
export function ActionMenu({label,children,menuRef}:{label:string;children:ReactNode;menuRef?:RefObject<HTMLDetailsElement|null>}){
 const owned=useRef<HTMLDetailsElement>(null),ref=menuRef||owned;
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{if(ref.current?.open&&!ref.current.contains(event.target as Node))ref.current.open=false;};
  const escape=(event:KeyboardEvent)=>{if(!event.defaultPrevented&&event.key==='Escape'&&ref.current?.open){event.preventDefault();event.stopPropagation();ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);};
 },[ref]);
 return <details ref={ref} name="output-actions" className="documentMore"><summary>{label}</summary><div onClickCapture={event=>{if((event.target as Element).closest("button,a")&&ref.current)ref.current.open=false;}}>{children}</div></details>;
}
