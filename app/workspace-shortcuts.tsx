"use client";

import { useEffect } from "react";

function currentWorkspace() {
  return document.querySelector<HTMLElement>(".workspacePage");
}

function setEditorValue(editor: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = editor instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(editor, value);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}

function gridEditor(page: HTMLElement) {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) {
    if (active.closest(".workspaceTable")) return active;
  }
  return page.querySelector<HTMLInputElement | HTMLSelectElement>(".workspaceTable td.gridSelected input, .workspaceTable td.gridSelected select");
}

function clickMenuAction(page: HTMLElement, label: string) {
  const find = () => Array.from(page.querySelectorAll<HTMLButtonElement>(".orderActionMenu button"))
    .find(button => button.textContent?.trim() === label);
  const existing = find();
  if (existing) { existing.click(); return; }
  const trigger = page.querySelector<HTMLButtonElement>(".orderActionMenuButton");
  trigger?.click();
  window.setTimeout(() => find()?.click(), 30);
}

function realPager(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLElement>(":scope > .workspacePager"))
    .find(pager => !pager.classList.contains("workspacePagerTop"));
}

function walkPager(page: HTMLElement, label: "Previous" | "Next", done: () => void, step = 0) {
  const pager = realPager(page);
  const button = pager && Array.from(pager.querySelectorAll<HTMLButtonElement>("button"))
    .find(item => item.textContent?.trim() === label);
  if (!button || button.disabled || step > 500) { window.setTimeout(done, 45); return; }
  button.click();
  window.setTimeout(() => walkPager(page, label, done, step + 1), 35);
}

function focusBoundary(page: HTMLElement, which: "first" | "last") {
  const focus = () => {
    const editors = Array.from(page.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".workspaceTable [data-grid-row][data-grid-column]"));
    const target = which === "first" ? editors[0] : editors.at(-1);
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
    target?.scrollIntoView({ block: "center", inline: "nearest" });
  };
  walkPager(page, which === "first" ? "Previous" : "Next", focus);
}

async function cutSelectedCells(page: HTMLElement) {
  const selected = Array.from(page.querySelectorAll<HTMLTableCellElement>(".workspaceTable td.gridSelected"));
  if (!selected.length) return false;
  const rows: HTMLTableRowElement[] = [];
  selected.forEach(cell => { const row = cell.closest("tr"); if (row && !rows.includes(row)) rows.push(row); });
  const text = rows.map(row => Array.from(row.querySelectorAll<HTMLTableCellElement>("td.gridSelected"))
    .map(cell => cell.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")?.value ?? cell.textContent?.trim() ?? "")
    .join("\t")).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    selected.forEach(cell => { const editor = cell.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (editor) setEditorValue(editor, ""); });
    return true;
  } catch { return false; }
}

function ensureShortcutGuide(page: HTMLElement) {
  const help = page.querySelector<HTMLElement>(".workspaceTableHelp");
  const tools = page.querySelector<HTMLElement>(":scope > .workspaceTools");
  if (!tools) return;
  if (help) help.hidden = true;
  let details = page.querySelector<HTMLDetailsElement>(".workspaceShortcutGuide");
  if (!details) {
    details = document.createElement("details");
    details.className = "workspaceShortcutGuide";
    const summary = document.createElement("summary");
    summary.textContent = "Keyboard shortcuts";
    const panel = document.createElement("div");
    panel.className = "workspaceShortcutGuidePanel";
    panel.innerHTML = [
      ["Ctrl/Cmd + S", "Save"],
      ["Ctrl/Cmd + Shift + S", "Save & close"],
      ["Ctrl/Cmd + P", "Open Labels"],
      ["Ctrl/Cmd + F", "Search rows"],
      ["Ctrl/Cmd + C / V / X", "Copy / paste / cut cells"],
      ["Ctrl/Cmd + Z / Y", "Undo / redo"],
      ["Ctrl/Cmd + ;", "Insert current date"],
      ["Ctrl/Cmd + Shift + ;", "Insert current time"],
      ["Ctrl/Cmd + Home / End", "First / last used cell"],
      ["F2", "Edit selected cell"],
      ["Delete / Backspace", "Clear selected cells"],
      ["Esc", "Close menus / leave cell"]
    ].map(([shortcut, action]) => `<span><kbd>${shortcut}</kbd><b>${action}</b></span>`).join("");
    details.append(summary, panel);
  }
  if (details.nextElementSibling !== tools) page.insertBefore(details, tools);
}

function organizeColumnMenu(page: HTMLElement) {
  const menu = page.querySelector<HTMLElement>(".columnMenu");
  if (!menu) return;
  const labels = Array.from(menu.querySelectorAll<HTMLLabelElement>(":scope > label"));
  if (!labels.length) return;
  const groupHeaders = Array.from(page.querySelectorAll<HTMLTableCellElement>(".workspaceTable thead tr:first-child th.productGroup"));
  if (!groupHeaders.length) return;
  const groups = groupHeaders.map(header => ({ name: header.textContent?.trim() || "Columns", span: Math.max(0, header.colSpan || 0) }));
  const signature = `${labels.length}|${groups.map(group => `${group.name}:${group.span}`).join("|")}`;
  if (menu.dataset.groupSignature === signature && menu.querySelector(".columnMenuGroupHeading")) return;
  menu.querySelectorAll(".columnMenuGroupHeading").forEach(node => node.remove());
  labels.forEach(label => { label.classList.remove("columnMenuGroupedItem", "columnMenuGroupFirstItem"); delete label.dataset.columnGroup; });
  let cursor = 0;
  groups.forEach((group, groupIndex) => {
    const count = group.span + (groupIndex === 0 && group.name.toLowerCase().includes("person") ? 1 : 0);
    if (count <= 0 || cursor >= labels.length) return;
    const heading = document.createElement("div");
    heading.className = "columnMenuGroupHeading";
    heading.textContent = group.name;
    menu.insertBefore(heading, labels[cursor]);
    const end = Math.min(labels.length, cursor + count);
    for (let index = cursor; index < end; index++) {
      labels[index].classList.add("columnMenuGroupedItem");
      labels[index].dataset.columnGroup = group.name;
      if (index === cursor) labels[index].classList.add("columnMenuGroupFirstItem");
    }
    cursor = end;
  });
  if (cursor < labels.length) {
    const heading = document.createElement("div");
    heading.className = "columnMenuGroupHeading";
    heading.textContent = "Other";
    menu.insertBefore(heading, labels[cursor]);
    for (let index = cursor; index < labels.length; index++) labels[index].classList.add("columnMenuGroupedItem");
  }
  menu.dataset.groupSignature = signature;
}

export function WorkspaceShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const page = currentWorkspace();
      if (!page) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === "s") {
        event.preventDefault();
        if (event.shiftKey) clickMenuAction(page, "Save & close");
        else page.querySelector<HTMLButtonElement>(".workspaceQuickSave")?.click();
        return;
      }
      if (modifier && key === "p") {
        event.preventDefault();
        page.querySelector<HTMLButtonElement>(".workspaceLabelsButton")?.click();
        return;
      }
      if (modifier && key === "f") {
        event.preventDefault();
        const search = page.querySelector<HTMLInputElement>('input[aria-label="Search rows"]');
        search?.focus(); search?.select(); return;
      }
      if (modifier && key === "z") {
        event.preventDefault();
        clickMenuAction(page, event.shiftKey ? "Redo last change" : "Undo last change");
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        clickMenuAction(page, "Redo last change");
        return;
      }
      if (modifier && key === "x") {
        const selected = page.querySelector(".workspaceTable td.gridSelected");
        if (!selected) return;
        event.preventDefault();
        void cutSelectedCells(page);
        return;
      }
      if (modifier && !event.shiftKey && event.key === ";") {
        const editor = gridEditor(page);
        if (!(editor instanceof HTMLInputElement)) return;
        event.preventDefault();
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        setEditorValue(editor, local); editor.select(); return;
      }
      if (modifier && event.shiftKey && (event.key === ";" || event.key === ":")) {
        const editor = gridEditor(page);
        if (!(editor instanceof HTMLInputElement)) return;
        event.preventDefault();
        const now = new Date();
        setEditorValue(editor, `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`); editor.select(); return;
      }
      if (modifier && !event.shiftKey && event.key === "Home") { event.preventDefault(); focusBoundary(page, "first"); return; }
      if (modifier && !event.shiftKey && event.key === "End") { event.preventDefault(); focusBoundary(page, "last"); return; }
      if (!modifier && event.key === "F2") {
        const editor = gridEditor(page); if (!editor) return; event.preventDefault(); editor.focus(); if (editor instanceof HTMLInputElement) editor.select(); return;
      }
      if (event.key === "Escape") {
        page.querySelector<HTMLButtonElement>('.orderActionMenuButton[aria-expanded="true"]')?.click();
        page.querySelector<HTMLButtonElement>('.columnControl > button[aria-expanded="true"]')?.click();
        gridEditor(page)?.blur();
      }
    };

    const ensure = () => { const page = currentWorkspace(); if (!page) return; ensureShortcutGuide(page); organizeColumnMenu(page); };
    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKeyDown, true);
    return () => { observer.disconnect(); document.removeEventListener("keydown", onKeyDown, true); };
  }, []);
  return null;
}
