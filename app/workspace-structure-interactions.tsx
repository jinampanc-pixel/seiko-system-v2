"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

let rowAnchor = "", columnAnchor = "";
const selectedRows = new Set<string>(), selectedColumns = new Set<string>();
function ordered<T extends HTMLElement>(selector: string) { return Array.from(document.querySelectorAll<T>(selector)); }
function paint() {
  ordered<HTMLElement>(".workspaceTable tbody tr[data-record-id]").forEach(row => row.classList.toggle("workspaceStructureSelected", selectedRows.has(row.dataset.recordId || "")));
  ordered<HTMLElement>(".workspaceTable [data-column-id]").forEach(cell => cell.classList.toggle("workspaceStructureSelectedColumn", selectedColumns.has(cell.dataset.columnId || "")));
}
function selectRange(ids: string[], from: string, to: string, target: Set<string>) { const a=ids.indexOf(from), b=ids.indexOf(to); if(a<0||b<0)return; target.clear(); for(let i=Math.min(a,b);i<=Math.max(a,b);i++) target.add(ids[i]); }
function closeContextMenu(){document.querySelector(".workspaceContextMenu")?.remove();}
function clearDropHints(){document.querySelectorAll(".workspaceDropBefore,.workspaceDropAfter").forEach(node=>node.classList.remove("workspaceDropBefore","workspaceDropAfter"));}
function clearTransientRowSelection(){if(!selectedRows.size)return;selectedRows.clear();rowAnchor="";paint();}
function dropPosition(event:DragEvent,element:HTMLElement,axis:"x"|"y"){const box=element.getBoundingClientRect();return axis==="y"?(event.clientY<box.top+box.height/2?"before":"after"):(event.clientX<box.left+box.width/2?"before":"after");}
function paintDropHint(element:HTMLElement,position:"before"|"after"){clearDropHints();element.classList.add(position==="before"?"workspaceDropBefore":"workspaceDropAfter");}
function contextMenu(x:number,y:number,items:Array<{label:string;command:string;disabled?:boolean}>,dispatch:(command:string)=>void){
  closeContextMenu();
  const menu=document.createElement("div");menu.className="workspaceContextMenu";menu.setAttribute("role","menu");
  items.forEach(item=>{const button=document.createElement("button");button.type="button";button.textContent=item.label;button.disabled=!!item.disabled;button.addEventListener("click",()=>{dispatch(item.command);closeContextMenu();});menu.appendChild(button);});
  document.body.appendChild(menu);const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(6,Math.min(window.innerWidth-box.width-6,x))}px`;menu.style.top=`${Math.max(6,Math.min(window.innerHeight-box.height-6,y))}px`;
}
function configureRows() {
  const rows = ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]");
  rows.forEach(row => {
    const id=row.dataset.recordId||"", handle=row.querySelector<HTMLElement>(".workspaceRowHeader"); if(!id||!handle||handle.dataset.structureReady)return;
    handle.dataset.structureReady="true"; handle.draggable=true; handle.title="Click to select row; Shift selects a range; Ctrl/Cmd adds rows; drag to move; right-click for row actions";
    handle.addEventListener("click", event => { const ids=rows.map(item=>item.dataset.recordId||""); if(event.shiftKey&&rowAnchor) selectRange(ids,rowAnchor,id,selectedRows); else if(event.ctrlKey||event.metaKey){if(selectedRows.has(id)) selectedRows.delete(id); else selectedRows.add(id); rowAnchor=id;} else {selectedRows.clear();selectedRows.add(id);rowAnchor=id;} paint(); });
    handle.addEventListener("contextmenu",event=>{event.preventDefault();if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();}const ids=[...selectedRows];const allHeld=ids.every(recordId=>document.querySelector<HTMLTableRowElement>(`.workspaceTable tbody tr[data-record-id="${CSS.escape(recordId)}"]`)?.classList.contains("recordHeld"));contextMenu(event.clientX,event.clientY,[{label:"Insert row above",command:"insert-above"},{label:"Insert row below",command:"insert-below"},{label:allHeld?"Resume selected rows":"Put selected rows on hold",command:"toggle-hold"},{label:`Delete selected row${ids.length===1?"":"s"}`,command:"delete"}],command=>window.dispatchEvent(new CustomEvent("seiko:workspace-row-command",{detail:{command,ids,targetId:id}})));});
    handle.addEventListener("dragstart", event => { if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();} event.dataTransfer?.setData("text/plain","seiko-rows"); event.dataTransfer!.effectAllowed="move"; });
    handle.addEventListener("dragover", event => { event.preventDefault(); paintDropHint(row,dropPosition(event,row,"y")); });
    handle.addEventListener("dragleave",event=>{if(!row.contains(event.relatedTarget as Node|null))clearDropHints();});
    handle.addEventListener("drop", event => { event.preventDefault(); const position=dropPosition(event,row,"y"); clearDropHints(); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id,position}})); });
  });
  const corner=document.querySelector<HTMLElement>(".workspaceRowHeaderCorner"); if(corner&&!corner.dataset.structureReady){corner.dataset.structureReady="true";corner.addEventListener("click",()=>{selectedRows.clear();rows.forEach(row=>selectedRows.add(row.dataset.recordId||""));paint();});}
}
function configureColumns() {
  const cells=ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]");
  cells.forEach(cell=>{const id=cell.dataset.columnId||""; if(!id||cell.dataset.structureReady)return; cell.dataset.structureReady="true";cell.draggable=true;cell.title="Click to select column; Shift selects a range; Ctrl/Cmd adds columns; drag to move; right-click for column actions";
    cell.addEventListener("click",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle"))return;const ids=cells.map(item=>item.dataset.columnId||"");if(event.shiftKey&&columnAnchor)selectRange(ids,columnAnchor,id,selectedColumns);else if(event.ctrlKey||event.metaKey){if(selectedColumns.has(id))selectedColumns.delete(id);else selectedColumns.add(id);columnAnchor=id;}else{selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;}paint();});
    cell.addEventListener("contextmenu",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle"))return;event.preventDefault();if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}const ids=[...selectedColumns];contextMenu(event.clientX,event.clientY,[{label:`Hide selected column${ids.length===1?"":"s"}`,command:"hide"},{label:"Reset column width",command:"reset-width"},{label:"Align left",command:"align-left"},{label:"Align centre",command:"align-center"},{label:"Align right",command:"align-right"},{label:"Sort A → Z",command:"sort-asc"},{label:"Sort Z → A",command:"sort-desc"}],command=>window.dispatchEvent(new CustomEvent("seiko:workspace-column-command",{detail:{command,ids}})));});
    cell.addEventListener("dragstart",event=>{if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}event.dataTransfer?.setData("text/plain","seiko-columns");event.dataTransfer!.effectAllowed="move";});
    cell.addEventListener("dragover",event=>{event.preventDefault();paintDropHint(cell,dropPosition(event,cell,"x"));});cell.addEventListener("dragleave",event=>{if(!cell.contains(event.relatedTarget as Node|null))clearDropHints();});
    cell.addEventListener("drop",event=>{event.preventDefault();const position=dropPosition(event,cell,"x");clearDropHints();window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id,position}}));});
  });
}
function enhance(){configureRows();configureColumns();paint();}
export function WorkspaceStructureInteractions(){useEffect(()=>{
  const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});
  const clear=()=>clearDropHints();
  const outside=(event:Event)=>{const target=event.target as Element|null;if(!target?.closest?.(".workspaceContextMenu"))closeContextMenu();if(!target?.closest?.(".workspaceRowHeader,.workspaceRowHeaderCorner,.workspaceContextMenu"))clearTransientRowSelection();};
  const closeTransient=()=>closeContextMenu();
  document.addEventListener("dragend",clear,true);
  document.addEventListener("pointerdown",outside,true);
  document.addEventListener("focusin",outside,true);
  document.addEventListener("scroll",closeTransient,true);
  window.addEventListener("resize",closeTransient);
  window.addEventListener("blur",closeTransient);
  return()=>{document.removeEventListener("dragend",clear,true);document.removeEventListener("pointerdown",outside,true);document.removeEventListener("focusin",outside,true);document.removeEventListener("scroll",closeTransient,true);window.removeEventListener("resize",closeTransient);window.removeEventListener("blur",closeTransient);clearDropHints();clearTransientRowSelection();closeContextMenu();controller.stop();};
},[]);return null;}
