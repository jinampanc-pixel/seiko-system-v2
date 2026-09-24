"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

export function SeikoReviewSentinel(){
  useEffect(()=>{
    const controller=startDomEnhancement(()=>{
      document.querySelectorAll<HTMLElement>(".ordersPage").forEach(page=>{
        const head=page.querySelector<HTMLElement>(".orderCenterHead");
        const moved=page.querySelector<HTMLElement>(".reviewFinalBackRow .finalSessionBack");
        if(!head||!moved||head.querySelector(".finalSessionBack"))return;
        const marker=document.createElement("span");
        marker.className="finalSessionBack reviewBackSentinel";
        marker.hidden=true;
        head.prepend(marker);
      });
    },{observer:{childList:true,subtree:true}});
    return()=>controller.stop();
  },[]);
  return null;
}
