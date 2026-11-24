"use client";
import { useEffect } from "react";
import "./floating-menus.css";

const selector="details.documentMore,details.billingCreateMenu,details.billingDocumentMenu,details.billingFilters,details.labelHeaderMoreMenu,details.seikoRowActionMenu,details.workspaceCompactTools";
/** Keep action panels in the top layer, inside the viewport and attached to their trigger. */
export function FloatingMenus(){useEffect(()=>{
 const active=new Map<HTMLElement,HTMLElement>();
 const place=(menu:HTMLElement,panel:HTMLElement)=>{
  const anchor=menu.querySelector(":scope > summary,:scope > button")?.getBoundingClientRect();if(!anchor)return;
  const viewport=window.visualViewport, left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
  const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
  panel.style.setProperty("max-width",`${Math.max(120,width-24)}px`,"important");
  panel.style.setProperty("max-height",`${Math.max(100,height-24)}px`,"important");
  const rect=panel.getBoundingClientRect();
  const below=top+height-anchor.bottom-12,above=anchor.top-top-12;
  const y=below>=Math.min(rect.height,240)||below>=above?anchor.bottom+6:anchor.top-rect.height-6;
  panel.style.setProperty("left",`${Math.max(left+12,Math.min(anchor.right-rect.width,left+width-rect.width-12))}px`,"important");
  panel.style.setProperty("top",`${Math.max(top+12,Math.min(y,top+height-rect.height-12))}px`,"important");
 };
 const close=(menu:HTMLElement)=>{if(menu instanceof HTMLDetailsElement)menu.open=false;else menu.querySelector<HTMLButtonElement>(":scope > button")?.click();};
 const open=(menu:HTMLElement)=>menu instanceof HTMLDetailsElement?menu.open:menu.matches(".workspaceRowMenu")?menu.classList.contains("open"):Boolean(menu.querySelector(".orderActionMenu,.columnMenu"));
 const sync=()=>{
  for(const [menu,panel]of active)if(!menu.isConnected||!open(menu)){if(panel.matches(":popover-open"))panel.hidePopover();active.delete(menu);}
  document.querySelectorAll<HTMLDetailsElement>(selector).forEach(menu=>{
   if(!menu.open)return;const panel=menu.querySelector<HTMLElement>(":scope > div");if(!panel)return;
   if(!active.has(menu)){panel.classList.add("floatingMenuPanel");panel.setAttribute("popover","manual");active.set(menu,panel);if(!panel.matches(":popover-open"))panel.showPopover();}
   place(menu,panel);
  });
  document.querySelectorAll<HTMLElement>(".orderActionMenu,.columnMenu,.workspaceRowMenu.open>.workspaceRowMenuPopup").forEach(panel=>{const host=panel.parentElement!;if(!active.has(host)){panel.classList.add("floatingMenuPanel");panel.setAttribute("popover","manual");active.set(host,panel);panel.showPopover();}place(host,panel);});
 };
 const outside=(e:PointerEvent)=>{for(const [menu]of active)if(!menu.contains(e.target as Node))close(menu);sync();};
 const key=(e:KeyboardEvent)=>{if(e.key!=="Escape")return;const menu=[...active.keys()].at(-1);if(menu){e.preventDefault();e.stopPropagation();close(menu);menu.querySelector<HTMLElement>(":scope > summary,:scope > button")?.focus();sync();}};
 const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","open"]});
 document.addEventListener("toggle",sync,true);document.addEventListener("pointerdown",outside,true);window.addEventListener("keydown",key,true);
 window.addEventListener("resize",sync);document.addEventListener("scroll",sync,true);window.visualViewport?.addEventListener("resize",sync);sync();
 return()=>{observer.disconnect();document.removeEventListener("toggle",sync,true);document.removeEventListener("pointerdown",outside,true);window.removeEventListener("keydown",key,true);window.removeEventListener("resize",sync);document.removeEventListener("scroll",sync,true);window.visualViewport?.removeEventListener("resize",sync);for(const panel of active.values())if(panel.matches(":popover-open"))panel.hidePopover();};
},[]);return null;}
