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
function confirmDelete(count:number){
  return new Promise<boolean>(resolve=>{
    document.querySelector(".seikoConfirmLayer")?.remove();
    const layer=document.createElement("div");layer.className="seikoConfirmLayer";layer.tabIndex=-1;
    layer.innerHTML='<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="workspace-delete-title"><h3 id="workspace-delete-title">Delete selected rows?</h3><p></p><div><button type="button" class="secondary cancel">Cancel</button><button type="button" class="primary confirm dangerAction"></button></div></section>';
    layer.querySelector("p")!.textContent=`${count} selected ${count===1?"row":"rows"} will be permanently removed from this order. Existing Person IDs on remaining rows will stay unchanged.`;
    const cancel=layer.querySelector<HTMLButtonElement>(".cancel")!,confirm=layer.querySelector<HTMLButtonElement>(".confirm")!;confirm.textContent=`Delete ${count}`;
    let finished=false;const finish=(value:boolean)=>{if(finished)return;finished=true;layer.remove();resolve(value);};
    cancel.addEventListener("click",()=>finish(false));confirm.addEventListener("click",()=>finish(true));layer.addEventListener("click",event=>{if(event.target===layer)finish(false);});layer.addEventListener("keydown",event=>{if(event.key==="Escape")finish(false);});
    document.body.appendChild(layer);queueMicrotask(()=>cancel.focus());
  });
}
async function deleteRows(ids:string[]){
  const unique=[...new Set(ids)].filter(Boolean);if(!unique.length)return;
  if(!await confirmDelete(unique.length))return;
  for(const id of unique){
    const row=document.querySelector<HTMLTableRowElement>(`.workspaceTable tbody tr[data-record-id="${CSS.escape(id)}"]`);
    const button=row ? Array.from(row.querySelectorAll<HTMLButtonElement>(".rowActions > button")).find(item=>/^Delete\s/.test(item.getAttribute("aria-label")||"")) : null;
    button?.click();
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  }
  selectedRows.clear();rowAnchor="";paint();
}
function configureRows() {
  const rows = ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]");
  rows.forEach(row => {
    const id=row.dataset.recordId||"", handle=row.querySelector<HTMLElement>(".workspaceRowHeader"); if(!id||!handle||handle.dataset.structureReady)return;
    handle.dataset.structureReady="true"; handle.draggable=true; handle.title="Click to select row; Shift selects a range; Ctrl/Cmd adds rows; drag to move; right-click for row actions";
    handle.addEventListener("click", event => { const ids=ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]").map(item=>item.dataset.recordId||""); if(event.shiftKey&&rowAnchor) selectRange(ids,rowAnchor,id,selectedRows); else if(event.ctrlKey||event.metaKey){if(selectedRows.has(id)) selectedRows.delete(id); else selectedRows.add(id); rowAnchor=id;} else {selectedRows.clear();selectedRows.add(id);rowAnchor=id;} paint(); });
    handle.addEventListener("contextmenu",event=>{event.preventDefault();if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();}const ids=[...selectedRows];const allHeld=ids.every(recordId=>document.querySelector<HTMLTableRowElement>(`.workspaceTable tbody tr[data-record-id="${CSS.escape(recordId)}"]`)?.classList.contains("recordHeld"));contextMenu(event.clientX,event.clientY,[{label:"Insert row above",command:"insert-above"},{label:"Insert row below",command:"insert-below"},{label:allHeld?"Resume selected rows":"Put selected rows on hold",command:"toggle-hold"},{label:`Delete selected row${ids.length===1?"":"s"}`,command:"delete"}],command=>{if(command==="delete"){void deleteRows(ids);return;}window.dispatchEvent(new CustomEvent("seiko:workspace-row-command",{detail:{command,ids,targetId:id}}));});});
    handle.addEventListener("dragstart", event => { if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();} const ids=[...selectedRows]; event.dataTransfer?.setData("text/plain",ids.join(",")); event.dataTransfer?.setData("application/x-seiko-rows",JSON.stringify(ids)); if(event.dataTransfer)event.dataTransfer.effectAllowed="move"; row.classList.add("workspaceDraggingRow"); });
    const dragover=(event:DragEvent)=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect="move";paintDropHint(row,dropPosition(event,row,"y"));};
    const dragleave=(event:DragEvent)=>{if(!row.contains(event.relatedTarget as Node|null))clearDropHints();};
    const drop=(event:DragEvent)=>{event.preventDefault();event.stopPropagation();const position=dropPosition(event,row,"y");clearDropHints();if(selectedRows.has(id))return;window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id,position}}));};
    /* The whole row is the drop target. Requiring the pointer to land back on the tiny row-number cell made valid-looking drops silently do nothing. */
    row.addEventListener("dragover",dragover);row.addEventListener("dragleave",dragleave);row.addEventListener("drop",drop);
    handle.addEventListener("dragover",dragover);handle.addEventListener("dragleave",dragleave);handle.addEventListener("drop",drop);
    handle.addEventListener("dragend",()=>{row.classList.remove("workspaceDraggingRow");clearDropHints();});
  });
  const corner=document.querySelector<HTMLElement>(".workspaceRowHeaderCorner"); if(corner&&!corner.dataset.structureReady){corner.dataset.structureReady="true";corner.addEventListener("click",()=>{selectedRows.clear();ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]").forEach(row=>selectedRows.add(row.dataset.recordId||""));paint();});}
}
function configureColumns() {
  const cells=ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]");
  cells.forEach(cell=>{const id=cell.dataset.columnId||""; if(!id||cell.dataset.structureReady)return; cell.dataset.structureReady="true";cell.draggable=true;cell.title="Click to select column; Shift selects a range; Ctrl/Cmd adds columns; drag to move; right-click for column actions";
    cell.addEventListener("click",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle"))return;const ids=ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]").map(item=>item.dataset.columnId||"");if(event.shiftKey&&columnAnchor)selectRange(ids,columnAnchor,id,selectedColumns);else if(event.ctrlKey||event.metaKey){if(selectedColumns.has(id))selectedColumns.delete(id);else selectedColumns.add(id);columnAnchor=id;}else{selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;}paint();});
    cell.addEventListener("contextmenu",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle"))return;event.preventDefault();if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}const ids=[...selectedColumns];contextMenu(event.clientX,event.clientY,[{label:`Hide selected column${ids.length===1?"":"s"}`,command:"hide"},{label:"Reset column width",command:"reset-width"},{label:"Align left",command:"align-left"},{label:"Align centre",command:"align-center"},{label:"Align right",command:"align-right"},{label:"Sort A → Z",command:"sort-asc"},{label:"Sort Z → A",command:"sort-desc"}],command=>window.dispatchEvent(new CustomEvent("seiko:workspace-column-command",{detail:{command,ids}})));});
    cell.addEventListener("dragstart",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle")){event.preventDefault();return;}if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}const ids=[...selectedColumns];event.dataTransfer?.setData("text/plain",ids.join(","));event.dataTransfer?.setData("application/x-seiko-columns",JSON.stringify(ids));if(event.dataTransfer)event.dataTransfer.effectAllowed="move";cell.classList.add("workspaceDraggingColumn");});
    cell.addEventListener("dragover",event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect="move";paintDropHint(cell,dropPosition(event,cell,"x"));});cell.addEventListener("dragleave",event=>{if(!cell.contains(event.relatedTarget as Node|null))clearDropHints();});
    cell.addEventListener("drop",event=>{event.preventDefault();event.stopPropagation();const position=dropPosition(event,cell,"x");clearDropHints();if(selectedColumns.has(id))return;window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id,position}}));});
    cell.addEventListener("dragend",()=>{cell.classList.remove("workspaceDraggingColumn");clearDropHints();});
  });
}
function enhance(){configureRows();configureColumns();paint();}
export function WorkspaceStructureInteractions(){useEffect(()=>{
  const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});
  const clear=()=>clearDropHints();
  const outside=(event:Event)=>{const target=event.target as Element|null;if(!target?.closest?.(".workspaceContextMenu,.seikoConfirmLayer"))closeContextMenu();if(!target?.closest?.(".workspaceRowHeader,.workspaceRowHeaderCorner,.workspaceContextMenu,.seikoConfirmLayer"))clearTransientRowSelection();};
  const closeTransient=()=>closeContextMenu();
  document.addEventListener("dragend",clear,true);
  document.addEventListener("pointerdown",outside,true);
  document.addEventListener("focusin",outside,true);
  document.addEventListener("scroll",closeTransient,true);
  window.addEventListener("resize",closeTransient);
  window.addEventListener("blur",closeTransient);
  return()=>{document.removeEventListener("dragend",clear,true);document.removeEventListener("pointerdown",outside,true);document.removeEventListener("focusin",outside,true);document.removeEventListener("scroll",closeTransient,true);window.removeEventListener("resize",closeTransient);window.removeEventListener("blur",closeTransient);clearDropHints();clearTransientRowSelection();closeContextMenu();document.querySelector(".seikoConfirmLayer")?.remove();controller.stop();};
},[]);return null;}
