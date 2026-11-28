"use client";
import { MoreIcon, ChevronDownIcon } from "./ui-icons";
import { useRef } from "react";
import { useAccess } from "./access-control";
import type { SeikoOrder } from "./lib/order-domain";
import type { OrderFinancialAction } from "./lib/order-commands";
export function OrderActionsMenu({order,busy=false,onWorkspace,onFinancial,onHandover,onManagement,onProduction,onSetup,onLabels,onArchive,onDelete}:{order:SeikoOrder;busy?:boolean;onWorkspace:()=>void;onFinancial:(action:OrderFinancialAction)=>void;onHandover:()=>void;onManagement?:()=>void;onProduction?:()=>void;onSetup:()=>void;onLabels:()=>void;onArchive:()=>void;onDelete:()=>void}){const {membership,can}=useAccess();const leaveTimer=useRef<number|undefined>(undefined);const cancelLeave=()=>{window.clearTimeout(leaveTimer.current);leaveTimer.current=undefined;};return (<details className="seikoRowActionMenu orderCenterActionMenu" onPointerEnter={cancelLeave} onPointerLeave={event=>{
        if(event.pointerType==="touch")return;
        const menu=event.currentTarget;
        if(event.relatedTarget instanceof Node&&menu.contains(event.relatedTarget))return;
        cancelLeave();leaveTimer.current=window.setTimeout(()=>{if(menu.isConnected&&!menu.matches(":hover"))menu.open=false;},150);
      }} onToggle={event => {
        const menu = event.currentTarget; if(event.target!==menu)return;cancelLeave(); if(!menu.open){menu.querySelectorAll<HTMLDetailsElement>(".orderMenuSection[open]").forEach(section=>{section.open=false;});return;}
        document.querySelectorAll<HTMLDetailsElement>(".seikoRowActionMenu[open]").forEach(other => { if (other !== menu) other.open = false; });
        const anchor = menu.querySelector("summary")!.getBoundingClientRect();
        const panel = menu.querySelector<HTMLElement>(".seikoRowActionPanel")!;
        const width = Math.min(240, window.innerWidth - 16);
        panel.style.width = `${width}px`; panel.style.maxHeight = `${window.innerHeight - 16}px`;
        panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, anchor.right - width))}px`;
        const top = Math.max(8, Math.min(window.innerHeight - panel.getBoundingClientRect().height - 8, anchor.bottom + 5));
        panel.style.top = `${top}px`; panel.style.maxHeight = `${window.innerHeight - top - 8}px`;
      }}><summary aria-label={`Actions for ${order.details.orderNo}`}><MoreIcon/></summary><div className="seikoRowActionPanel" onClickCapture={event => { if ((event.target as Element).closest("button")) event.currentTarget.closest("details.orderCenterActionMenu")!.removeAttribute("open"); }} style={{ position: "fixed", right: "auto", zIndex: 12000, boxSizing: "border-box", maxHeight: "calc(100dvh - 16px)", overflowY: "auto" }}>
        <div className="orderMenuContext"><b>{order.details.orderNo}</b><span>{order.details.clientName}</span></div><button disabled={busy} onClick={() => onWorkspace()}>Open Workspace</button>
        <button onClick={() => onFinancial("payment")}>Record Payment</button>
        <details className="orderMenuSection"><summary>Billing & Documents<ChevronDownIcon/></summary><button onClick={() => onFinancial("payments")}>Payments & Receipts</button>
        <button onClick={() => onFinancial("invoice")}>Create Invoice</button>
        <button onClick={() => onHandover()}>Student Handover List / PDF</button><button onClick={() => onFinancial("challan")}>Create Delivery Challan</button>
        <button onClick={() => onFinancial("quotation")}>Create Quotation</button>
        </details>{Boolean(onManagement)&&<button onClick={()=>onManagement?.()}>Order Management</button>}{Boolean(onProduction)&&<button onClick={()=>onProduction?.()}>Production Handoff</button>}<details className="orderMenuSection"><summary>Setup & Labels<ChevronDownIcon/></summary><button disabled={busy||!can("orders.edit")} onClick={() => onSetup()}>Edit Setup</button>
        <button onClick={() => onLabels()}>Create Labels</button>
        </details><details className="orderMenuSection orderMenuMaintenance"><summary>Manage Order<ChevronDownIcon/></summary><button disabled={busy||!can("orders.edit")} onClick={() => onArchive()}>{order.archived ? "Restore Order" : "Archive Order"}</button>
        {membership?.role === "owner" && <button disabled={busy} className="dangerText" onClick={() => onDelete()}>Delete Order</button>}
      </details></div></details>);}
