"use client";
import { useEffect } from "react";
import "./menu-arrangement.css";
type Orders=Record<string,string[]>;
export function useMenuArrangement(){useEffect(()=>{
 const menus=new Map<HTMLElement,{editing:boolean}>();
 const key=()=>`jinam:menu-order:v1:${new URLSearchParams(location.search).get("business")||localStorage.getItem("jinam:selected-business")||"seiko"}`;
 const read=():Orders=>{try{const value=JSON.parse(localStorage.getItem(key())||"{}");return value&&typeof value==="object"?value:{};}catch{return {};}};
 const items=(host:HTMLElement)=>[...host.children].filter((e):e is HTMLElement=>e instanceof HTMLElement&&e.matches(".nav"));
 const id=(e:HTMLElement)=>(e.querySelector("small")?.textContent||"").trim().toLowerCase();
 const apply=(host:HTMLElement,group:string)=>{const raw=read()[group];const saved=Array.isArray(raw)?raw.filter(x=>typeof x==="string"):[];const rows=items(host),ids=rows.map(id);const ordered=[...saved.filter(x=>ids.includes(x)),...ids.filter(x=>!saved.includes(x))];for(const row of rows){row.dataset.menuKey=id(row);const order=String(ordered.indexOf(id(row)));if(row.style.order!==order)row.style.order=order;}};
 const persist=(host:HTMLElement,group:string)=>{const saved=read();saved[group]=items(host).sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(id);try{localStorage.setItem(key(),JSON.stringify(saved));window.dispatchEvent(new Event("jinam:menu-order-changed"));}catch{/* Navigation remains available if device preferences cannot be stored. */}};
 let drag:{host:HTMLElement;row:HTMLElement;group:string;pointer:number;x:number;y:number;moved:boolean;ready:boolean;timer?:number;original:string[]}|null=null;
 let scrollTimer:number|undefined;
 const stop=(cancel=false)=>{clearInterval(scrollTimer);scrollTimer=undefined;if(!drag)return;clearTimeout(drag.timer);drag.row.classList.remove("menuDragging");if(cancel){for(const row of items(drag.host))row.style.order=String(drag.original.indexOf(id(row)));}else if(drag.ready)persist(drag.host,drag.group);drag=null;};
 const sync=()=>{
  document.querySelectorAll<HTMLElement>(".app .topbar .moduleMenu,.globalStandaloneMenu,.menuLayoutPreview").forEach(menu=>{
   if(!menus.has(menu))menus.set(menu,{editing:menu.classList.contains("menuLayoutPreview")});
   const groups:[[HTMLElement,string],[HTMLElement|null,string]]=[[menu,"main"],[menu.querySelector(".moduleMenuSettings"),"lower"]];
   for(const [host,group]of groups){if(!host)continue;apply(host,group);if(!menus.get(menu)?.editing)continue;for(const row of items(host)){
    if(row.querySelector(".menuDragHandle"))continue;
    const handle=document.createElement("span");handle.className="menuDragHandle";handle.textContent="⠿";handle.setAttribute("aria-hidden","true");
    handle.onpointerdown=e=>{if(!menus.get(menu)?.editing)return;e.preventDefault();e.stopPropagation();stop();drag={host,row,group,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false,ready:e.pointerType!=="touch",original:items(host).sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(id)};handle.setPointerCapture(e.pointerId);scrollTimer=window.setInterval(()=>{if(!drag?.ready||!drag.moved)return;const scroller=drag.row.closest(".moduleMenu,.menuLayoutPreview");if(!scroller)return;const r=scroller.getBoundingClientRect();if(drag.y>r.bottom-48)scroller.scrollTop+=12;else if(drag.y<r.top+48)scroller.scrollTop-=12;},50);if(drag.ready)row.classList.add("menuDragging");else drag.timer=window.setTimeout(()=>{if(drag){drag.ready=true;row.classList.add("menuDragging");}},300);};
    row.addEventListener("keydown",e=>{if(!menus.get(menu)?.editing)return;if(!["ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();e.stopPropagation();const rows=items(host).sort((a,b)=>Number(a.style.order)-Number(b.style.order)),at=rows.indexOf(row),next=at+(e.key==="ArrowUp"?-1:1);if(rows[next]){[rows[at],rows[next]]=[rows[next],rows[at]];rows.forEach((r,i)=>r.style.order=String(i));persist(host,group);}});
    row.append(handle);
   }}
  });
  for(const [menu]of menus)if(!menu.isConnected)menus.delete(menu);
 };
 const move=(e:PointerEvent)=>{if(!drag||e.pointerId!==drag.pointer)return;drag.x=e.clientX;drag.y=e.clientY;if(!drag.ready)return;drag.moved=true;e.preventDefault();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>(".nav");if(!target||target===drag.row||target.parentElement!==drag.host)return;const rows=items(drag.host).sort((a,b)=>Number(a.style.order)-Number(b.style.order)),from=rows.indexOf(drag.row),to=rows.indexOf(target);rows.splice(from,1);rows.splice(to,0,drag.row);rows.forEach((r,i)=>r.style.order=String(i));const menu=drag.row.closest(".moduleMenu");if(menu){const bounds=menu.getBoundingClientRect();if(e.clientY>bounds.bottom-60)menu.scrollTop+=16;else if(e.clientY<bounds.top+60)menu.scrollTop-=16;}};
 const click=(e:MouseEvent)=>{if((e.target as Element).closest(".menuDragHandle")||((e.target as Element).closest(".nav")&&(e.target as Element).closest(".menuArrangeEditing"))){e.preventDefault();e.stopImmediatePropagation();}};
 const keyboard=(e:KeyboardEvent)=>{const target=e.target as Element;const menu=target?.closest<HTMLElement>(".moduleMenu")||document.querySelector<HTMLElement>(".moduleMenu");if(!menu||target?.closest('[role="dialog"],dialog')&&!menu.contains(target))return;if(e.key==="Escape"){stop(true);e.preventDefault();e.stopPropagation();document.querySelector<HTMLButtonElement>('.menuToggle[aria-expanded="true"]')?.click();}else if(e.key==="Tab"){const controls=[...menu.querySelectorAll<HTMLElement>("button,select")].filter(el=>!el.matches(":disabled")&&el.getClientRects().length).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);const at=controls.indexOf(document.activeElement as HTMLElement);if(at>=0&&controls.length){e.preventDefault();controls[(at+(e.shiftKey?-1:1)+controls.length)%controls.length].focus();}}};
 const up=()=>stop(),cancel=()=>stop(true);const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();document.addEventListener("pointermove",move,{passive:false});document.addEventListener("pointerup",up);document.addEventListener("pointercancel",cancel);document.addEventListener("click",click,true);document.addEventListener("keydown",keyboard,true);window.addEventListener("jinam:menu-order-changed",sync);
 return()=>{stop(true);observer.disconnect();document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",cancel);document.removeEventListener("click",click,true);document.removeEventListener("keydown",keyboard,true);window.removeEventListener("jinam:menu-order-changed",sync);};
},[]);}
