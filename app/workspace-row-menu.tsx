"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function closeMenus(except?: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>(".workspaceRowMenu.open").forEach(menu => {
    if (except && menu === except) return;
    menu.classList.remove("open");
    menu.querySelector<HTMLButtonElement>(".workspaceRowMenuTrigger")?.setAttribute("aria-expanded", "false");
  });
}

function enhanceRow(row: HTMLTableRowElement) {
  const actions = row.querySelector<HTMLElement>(".rowActions");
  if (!actions || actions.dataset.rowMenuReady === "true") return;
  const hold = actions.querySelector<HTMLButtonElement>(".holdRecord");
  const remove = Array.from(actions.querySelectorAll<HTMLButtonElement>("button")).find(button => button !== hold);
  if (!hold || !remove) return;

  actions.dataset.rowMenuReady = "true";
  actions.classList.add("workspaceNativeRowActions");
  hold.classList.add("workspaceNativeRowAction");
  remove.classList.add("workspaceNativeRowAction");

  const menu = document.createElement("div");
  menu.className = "workspaceRowMenu";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "workspaceRowMenuTrigger";
  trigger.setAttribute("aria-label", "Row actions");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = "<span></span><span></span><span></span>";

  const popup = document.createElement("div");
  popup.className = "workspaceRowMenuPopup";
  popup.setAttribute("role", "menu");

  const holdAction = document.createElement("button");
  holdAction.type = "button";
  holdAction.setAttribute("role", "menuitem");
  holdAction.className = "workspaceRowMenuHold";
  const syncHoldLabel = () => {
    const nativeLabel = hold.getAttribute("aria-label") || hold.title || "Put on hold";
    holdAction.textContent = /^Resume/i.test(nativeLabel) ? "Resume row" : "Put on hold";
  };
  syncHoldLabel();
  holdAction.addEventListener("click", () => {
    closeMenus();
    hold.click();
    queueMicrotask(syncHoldLabel);
  });

  const deleteAction = document.createElement("button");
  deleteAction.type = "button";
  deleteAction.setAttribute("role", "menuitem");
  deleteAction.className = "workspaceRowMenuDelete";
  deleteAction.textContent = "Delete row";
  deleteAction.addEventListener("click", () => {
    closeMenus();
    remove.click();
  });

  popup.append(holdAction, deleteAction);
  menu.append(trigger, popup);
  actions.appendChild(menu);

  trigger.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const opening = !menu.classList.contains("open");
    closeMenus(menu);
    menu.classList.toggle("open", opening);
    trigger.setAttribute("aria-expanded", String(opening));
    if (opening) syncHoldLabel();
  });
}

function enhance() {
  document.querySelectorAll<HTMLTableRowElement>(".workspacePage .workspaceTable tbody tr").forEach(enhanceRow);
}

export function WorkspaceRowMenu() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, { observer: { childList: true, subtree: true } });
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".workspaceRowMenu")) closeMenus();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keydown, true);
    return () => {
      controller.stop();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keydown, true);
    };
  }, []);
  return null;
}
