"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

let rowAnchor = "", columnAnchor = "";
const selectedRows = new Set<string>(), selectedColumns = new Set<string>();
function ordered<T extends HTMLElement>(selector: string) { return Array.from(document.querySelectorAll<T>(selector)); }
function paint() {
  ordered<HTMLElement>(".workspaceTable tbody tr[data-record-id]").forEach(row => row.classList.toggle("workspaceStructureSelected", selectedRows.has(row.dataset.recordId || "")));
  ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]").forEach(cell => cell.classList.toggle("workspaceStructureSelected", selectedColumns.has(cell.dataset.columnId || "")));
}
function selectRange(ids: string[], from: string, to: string, target: Set<string>) { const a=ids.indexOf(from), b=ids.indexOf(to); if(a<0||b<0)return; target.clear(); for(let i=Math.min(a,b);i<=Math.max(a,b);i++) target.add(ids[i]); }
function configureRows() {
  const rows = ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]");
  rows.forEach(row => {
    const id=row.dataset.recordId||"", handle=row.querySelector<HTMLElement>(".workspaceRowHeader"); if(!id||!handle||handle.dataset.structureReady)return;
    handle.dataset.structureReady="true"; handle.draggable=true; handle.title="Click to select row; Shift selects a range; Ctrl/Cmd adds rows; drag to move selected rows";
    handle.addEventListener("click", event => { const ids=rows.map(item=>item.dataset.recordId||""); if(event.shiftKey&&rowAnchor) selectRange(ids,rowAnchor,id,selectedRows); else if(event.ctrlKey||event.metaKey){selectedRows.has(id)?selectedRows.delete(id):selectedRows.add(id); rowAnchor=id;} else {selectedRows.clear();selectedRows.add(id);rowAnchor=id;} paint(); });
    handle.addEventListener("dragstart", event => { if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();} event.dataTransfer?.setData("text/plain","seiko-rows"); event.dataTransfer!.effectAllowed="move"; });
    handle.addEventListener("dragover", event => { event.preventDefault(); row.classList.add("workspaceStructureDropTarget"); });
    handle.addEventListener("dragleave",()=>row.classList.remove("workspaceStructureDropTarget"));
    handle.addEventListener("drop", event => { event.preventDefault(); row.classList.remove("workspaceStructureDropTarget"); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id}})); });
  });
  const corner=document.querySelector<HTMLElement>(".workspaceRowHeaderCorner"); if(corner&&!corner.dataset.structureReady){corner.dataset.structureReady="true";corner.addEventListener("click",()=>{selectedRows.clear();rows.forEach(row=>selectedRows.add(row.dataset.recordId||""));paint();});}
}
function configureColumns() {
  const cells=ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]");
  cells.forEach(cell=>{const id=cell.dataset.columnId||""; if(!id||cell.dataset.structureReady)return; cell.dataset.structureReady="true";cell.draggable=true;cell.title="Click to select column; Shift selects a range; Ctrl/Cmd adds columns; drag to move selected columns";
    cell.addEventListener("click",event=>{const ids=cells.map(item=>item.dataset.columnId||"");if(event.shiftKey&&columnAnchor)selectRange(ids,columnAnchor,id,selectedColumns);else if(event.ctrlKey||event.metaKey){selectedColumns.has(id)?selectedColumns.delete(id):selectedColumns.add(id);columnAnchor=id;}else{selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;}paint();});
    cell.addEventListener("dragstart",event=>{if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}event.dataTransfer?.setData("text/plain","seiko-columns");event.dataTransfer!.effectAllowed="move";});
    cell.addEventListener("dragover",event=>{event.preventDefault();cell.classList.add("workspaceStructureDropTarget");});cell.addEventListener("dragleave",()=>cell.classList.remove("workspaceStructureDropTarget"));
    cell.addEventListener("drop",event=>{event.preventDefault();cell.classList.remove("workspaceStructureDropTarget");window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id}}));});
  });
}
function enhance(){configureRows();configureColumns();paint();}
export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});return()=>controller.stop();},[]);return null;}
