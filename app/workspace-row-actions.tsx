"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

const selectedRows = new Set<string>();
let currentWorkspace = "";
let lastSelectedIndex = -1;

function workspaceKey(page: HTMLElement) {
  return page.querySelector<HTMLElement>(".workspaceHead h2")?.textContent?.trim() || "workspace";
}

function rows(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLTableRowElement>(".workspaceTable tbody > tr"));
}

function rowId(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>(".personId")?.textContent?.trim() || "";
}

function nativeDelete(row: HTMLTableRowElement) {
  return Array.from(row.querySelectorAll<HTMLButtonElement>(".rowActions > button"))
    .find(button => /^Delete\s/.test(button.getAttribute("aria-label") || ""));
}

function toast(message: string) {
  document.querySelector(".seikoOperationalToast")?.remove();
  const node = document.createElement("div");
  node.className = "seikoOperationalToast";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}

function confirmAction(title: string, message: string, action: string, danger = false) {
  return new Promise<boolean>(resolve => {
    document.querySelector(".seikoConfirmLayer")?.remove();
    const layer = document.createElement("div");
    layer.className = "seikoConfirmLayer";
    layer.tabIndex = -1;
    layer.innerHTML = '<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="seiko-safe-confirm-title"><h3 id="seiko-safe-confirm-title"></h3><p></p><div><button type="button" class="secondary cancel">Cancel</button><button type="button" class="primary confirm"></button></div></section>';
    layer.querySelector("h3")!.textContent = title;
    layer.querySelector("p")!.textContent = message;
    const cancel = layer.querySelector<HTMLButtonElement>(".cancel")!;
    const confirm = layer.querySelector<HTMLButtonElement>(".confirm")!;
    confirm.textContent = action;
    if (danger) confirm.classList.add("dangerAction");
    const finish = (value: boolean) => { layer.remove(); resolve(value); };
    cancel.addEventListener("click", () => finish(false));
    confirm.addEventListener("click", () => finish(true));
    layer.addEventListener("click", event => { if (event.target === layer) finish(false); });
    layer.addEventListener("keydown", event => { if (event.key === "Escape") finish(false); });
    document.body.appendChild(layer);
    queueMicrotask(() => cancel.focus());
  });
}

function sync(page: HTMLElement) {
  const visible = rows(page);
  const visibleIds = new Set(visible.map(rowId).filter(Boolean));
  for (const id of [...selectedRows]) if (!visibleIds.has(id)) selectedRows.delete(id);

  visible.forEach(row => {
    const id = rowId(row);
    const checkbox = row.querySelector<HTMLInputElement>(".recordSelectToggle");
    if (checkbox) checkbox.checked = selectedRows.has(id);
    row.classList.toggle("workspaceRowSelected", selectedRows.has(id));
  });

  const selectAll = page.querySelector<HTMLInputElement>(".workspaceSelectAll");
  const ids = [...visibleIds];
  if (selectAll) {
    selectAll.checked = ids.length > 0 && ids.every(id => selectedRows.has(id));
    selectAll.indeterminate = ids.some(id => selectedRows.has(id)) && !selectAll.checked;
  }

  const bar = page.querySelector<HTMLElement>(".workspaceBulkBar");
  if (bar) {
    bar.hidden = selectedRows.size === 0;
    const count = bar.querySelector<HTMLElement>(".workspaceBulkCount");
    if (count) count.textContent = `${selectedRows.size} ${selectedRows.size === 1 ? "row" : "rows"} selected`;
  }
}

async function deleteSelected(page: HTMLElement) {
  const ids = rows(page).map(rowId).filter(id => selectedRows.has(id));
  if (!ids.length) return;
  const approved = await confirmAction(
    "Delete selected rows?",
    `${ids.length} selected ${ids.length === 1 ? "row" : "rows"} will be removed from this order. Person IDs on the remaining rows will stay unchanged.`,
    `Delete ${ids.length}`,
    true,
  );
  if (!approved) return;

  for (const id of ids) {
    const row = rows(page).find(item => rowId(item) === id);
    const button = row ? nativeDelete(row) : null;
    if (!button) continue;
    button.dataset.safeDeleteBypass = "true";
    button.click();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  selectedRows.clear();
  lastSelectedIndex = -1;
  sync(page);
  toast(`${ids.length} ${ids.length === 1 ? "row" : "rows"} deleted.`);
}

function ensureSelection(page: HTMLElement) {
  const key = workspaceKey(page);
  if (currentWorkspace !== key) {
    selectedRows.clear();
    lastSelectedIndex = -1;
    currentWorkspace = key;
  }

  const table = page.querySelector<HTMLTableElement>(".workspaceTable");
  const actionsHead = table?.querySelector<HTMLTableCellElement>("thead > tr:first-child > th:last-child");
  if (!table || !actionsHead) return;

  if (!actionsHead.querySelector(".workspaceSelectAll")) {
    actionsHead.classList.add("workspaceActionsHead");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "workspaceSelectAll";
    checkbox.setAttribute("aria-label", "Select all visible rows");
    checkbox.addEventListener("change", () => {
      rows(page).forEach(row => {
        const id = rowId(row);
        if (!id) return;
        if (checkbox.checked) selectedRows.add(id); else selectedRows.delete(id);
      });
      sync(page);
    });
    actionsHead.appendChild(checkbox);
  }

  rows(page).forEach(row => {
    const id = rowId(row);
    const actions = row.querySelector<HTMLElement>(".rowActions");
    if (!id || !actions || actions.querySelector(".recordSelectToggle")) return;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "recordSelectToggle";
    checkbox.setAttribute("aria-label", `Select ${id}`);
    checkbox.addEventListener("click", event => {
      const visibleRows = rows(page);
      const currentIndex = visibleRows.indexOf(row);
      if ((event as MouseEvent).shiftKey && lastSelectedIndex >= 0) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        for (let position = start; position <= end; position++) {
          const rangeId = rowId(visibleRows[position]);
          if (rangeId) selectedRows.add(rangeId);
        }
      } else if (checkbox.checked) selectedRows.add(id);
      else selectedRows.delete(id);
      lastSelectedIndex = currentIndex;
      sync(page);
    });
    actions.prepend(checkbox);
  });

  if (!page.querySelector(".workspaceBulkBar")) {
    const bar = document.createElement("div");
    bar.className = "workspaceBulkBar";
    bar.hidden = true;
    bar.innerHTML = '<b class="workspaceBulkCount"></b><span>Shift-click selects a range on this page.</span><div><button type="button" class="secondary workspaceBulkClear">Clear</button><button type="button" class="workspaceBulkDelete">Delete selected</button></div>';
    bar.querySelector<HTMLButtonElement>(".workspaceBulkClear")!.addEventListener("click", () => {
      selectedRows.clear();
      lastSelectedIndex = -1;
      sync(page);
    });
    bar.querySelector<HTMLButtonElement>(".workspaceBulkDelete")!.addEventListener("click", () => void deleteSelected(page));
    page.querySelector(".workspaceTableWrap")?.insertAdjacentElement("beforebegin", bar);
  }

  sync(page);
}

function ensureReadiness(page: HTMLElement) {
  const readiness = page.querySelector<HTMLElement>(".readiness");
  if (!readiness) return;
  readiness.classList.add("workspaceReadinessCompact");
  const summary = readiness.querySelector<HTMLDetailsElement>("details")?.querySelector("summary");
  if (summary) summary.textContent = "Review issues";
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => {
    ensureReadiness(page);
    ensureSelection(page);
  });
}

export function WorkspaceRowActions() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance);

    const capture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const deleteButton = target.closest<HTMLButtonElement>('.workspacePage .rowActions > button[aria-label^="Delete "]');
      if (deleteButton) {
        if (deleteButton.dataset.safeDeleteBypass === "true") {
          delete deleteButton.dataset.safeDeleteBypass;
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const id = deleteButton.getAttribute("aria-label")?.replace(/^Delete\s+/, "") || "this row";
        void confirmAction("Delete this row?", `${id} will be removed. Existing Person IDs on other rows will not change.`, "Delete row", true).then(approved => {
          if (!approved) return;
          deleteButton.dataset.safeDeleteBypass = "true";
          deleteButton.click();
          toast(`${id} deleted.`);
        });
        return;
      }

      const addButton = target.closest<HTMLButtonElement>(".workspacePage .workspaceAddTools .primary");
      if (!addButton || addButton.dataset.safeAddBypass === "true") {
        if (addButton) delete addButton.dataset.safeAddBypass;
        return;
      }
      const page = addButton.closest<HTMLElement>(".workspacePage");
      const input = page?.querySelector<HTMLInputElement>('input[aria-label="Number of rows to add"]');
      const count = Math.max(1, Math.floor(Number(input?.value) || 1));
      if (count <= 1) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void confirmAction(`Add ${count} rows?`, `This will add ${count} new person / record rows to the current order.`, `Add ${count} rows`).then(approved => {
        if (!approved) return;
        addButton.dataset.safeAddBypass = "true";
        addButton.click();
        toast(`${count} rows added.`);
      });
    };

    document.addEventListener("click", capture, true);
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("click", capture, true);
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
      selectedRows.clear();
    };
  }, []);

  return null;
}
