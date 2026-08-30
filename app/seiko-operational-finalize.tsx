"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function labelName(label: HTMLLabelElement) {
  return label.querySelector<HTMLElement>(":scope > span")?.textContent?.trim().replace(/\s*\*$/, "") || "";
}

function toast(message: string, undo?: () => void) {
  document.querySelector(".seikoOperationalToast")?.remove();
  const node = document.createElement("div");
  node.className = "seikoOperationalToast";
  node.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  node.appendChild(text);
  if (undo) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Undo";
    button.addEventListener("click", () => { undo(); node.remove(); });
    node.appendChild(button);
  }
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 5000);
}

function confirmAction(title: string, message: string, action: string, danger = false) {
  return new Promise<boolean>(resolve => {
    document.querySelector(".seikoConfirmLayer")?.remove();
    const layer = document.createElement("div");
    layer.className = "seikoConfirmLayer";
    layer.innerHTML = `<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="seiko-confirm-title"><h3 id="seiko-confirm-title"></h3><p></p><div><button type="button" class="secondary cancel">Cancel</button><button type="button" class="primary confirm"></button></div></section>`;
    layer.querySelector("h3")!.textContent = title;
    layer.querySelector("p")!.textContent = message;
    const confirm = layer.querySelector<HTMLButtonElement>(".confirm")!;
    confirm.textContent = action;
    if (danger) confirm.classList.add("dangerAction");
    const finish = (value: boolean) => { layer.remove(); resolve(value); };
    layer.querySelector<HTMLButtonElement>(".cancel")!.addEventListener("click", () => finish(false));
    confirm.addEventListener("click", () => finish(true));
    layer.addEventListener("click", event => { if (event.target === layer) finish(false); });
    layer.addEventListener("keydown", event => { if (event.key === "Escape") finish(false); });
    document.body.appendChild(layer);
    window.setTimeout(() => confirm.focus(), 0);
  });
}

function enhanceOrderSetup() {
  const setup = document.querySelector<HTMLElement>(".orderSetup");
  if (!setup) return;

  setup.querySelectorAll<HTMLLabelElement>(".clientDetails .setupGrid label").forEach(label => {
    const name = labelName(label);
    label.classList.toggle("seikoDeliveryAddress", name === "Delivery address");
    label.classList.toggle("seikoBillingAddress", name === "Billing address");
    label.classList.toggle("seikoClientName", name === "Client name");
    label.classList.toggle("seikoClientType", name === "Client type");
    label.classList.toggle("seikoDeliveryDate", name === "Delivery date");
    label.classList.toggle("seikoAttn", name === "Contact person / Attn");
    label.classList.toggle("seikoPhone", name === "Phone number");
  });

  setup.querySelectorAll<HTMLInputElement>(".personDetails .policyRow > input:first-child").forEach(input => {
    input.placeholder = "Person / record field, e.g. Employee name, Class, Patient ID";
    input.setAttribute("aria-description", "Use the terminology that belongs to this order. School, company, hospital and other institution fields are all supported.");
  });

  setup.querySelectorAll<HTMLElement>(".productPolicy").forEach(card => {
    const quantitySelect = card.querySelector<HTMLSelectElement>(".productPolicyTop label > select");
    const quantityInputs = Array.from(card.querySelectorAll<HTMLInputElement>(".productPolicyTop input"));
    const defaultInput = quantityInputs.at(-1);
    const defaultLabel = defaultInput?.closest("label")?.querySelector<HTMLElement>(":scope > span");
    const help = card.querySelector<HTMLElement>(":scope > .ruleHelp");
    if (quantitySelect?.value === "by_group" && defaultInput) {
      if (defaultInput.disabled) defaultInput.disabled = false;
      defaultInput.classList.remove("modeBlockedInput");
      defaultInput.min = "0";
      if (defaultLabel) defaultLabel.textContent = "Default qty";
      if (help) help.textContent = "Set the normal quantity once. Add only the groups that differ; one exception can contain several values such as 1, 2, 3. Quantity 0 means that group does not receive this product.";
      const rules = card.querySelector<HTMLElement>(".quantityGroupRules");
      const summary = rules?.querySelector<HTMLElement>(":scope > summary");
      if (summary) summary.textContent = "Quantity exceptions by group";
      rules?.querySelectorAll<HTMLInputElement>(":scope > div input:first-child").forEach(input => { input.placeholder = "Group values, e.g. 1, 2, 3"; });
      rules?.querySelectorAll<HTMLInputElement>('input[aria-label="Group quantity"]').forEach(input => { input.min = "0"; input.placeholder = "Qty"; });
    }
    if (quantitySelect?.value === "per_person" && defaultLabel) defaultLabel.textContent = "Entered in workspace";
  });
}

const selectedRows = new Set<string>();
let lastRowIndex = -1;

function workspaceRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
}

function syncBulkBar(page: HTMLElement) {
  const bar = page.querySelector<HTMLElement>(".workspaceBulkBar");
  if (!bar) return;
  const count = bar.querySelector<HTMLElement>(".workspaceBulkCount");
  const remove = bar.querySelector<HTMLButtonElement>(".workspaceBulkDelete");
  const clear = bar.querySelector<HTMLButtonElement>(".workspaceBulkClear");
  if (count) count.textContent = `${selectedRows.size} ${selectedRows.size === 1 ? "row" : "rows"} selected`;
  if (remove) remove.disabled = selectedRows.size === 0;
  if (clear) clear.disabled = selectedRows.size === 0;
}

function enhanceWorkspaceRows(page: HTMLElement) {
  const table = page.querySelector<HTMLTableElement>(".workspaceTable");
  if (!table) return;
  const header = table.querySelector<HTMLTableRowElement>("thead > tr:first-child");
  if (header && !header.querySelector(".workspaceRowSelectHead")) {
    const th = document.createElement("th");
    th.className = "workspaceRowSelectHead";
    th.rowSpan = 2;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", "Select all visible rows");
    checkbox.addEventListener("change", () => {
      const rows = workspaceRows(table);
      rows.forEach(row => {
        const id = row.querySelector<HTMLElement>(".personId")?.textContent?.trim();
        if (!id) return;
        if (checkbox.checked) selectedRows.add(id); else selectedRows.delete(id);
      });
      enhanceWorkspaceRows(page);
      syncBulkBar(page);
    });
    th.appendChild(checkbox);
    header.insertBefore(th, header.firstChild);
  }

  const rows = workspaceRows(table);
  rows.forEach((row, index) => {
    const id = row.querySelector<HTMLElement>(".personId")?.textContent?.trim();
    if (!id) return;
    let cell = row.querySelector<HTMLTableCellElement>(".workspaceRowSelectCell");
    if (!cell) {
      cell = document.createElement("td");
      cell.className = "workspaceRowSelectCell";
      row.insertBefore(cell, row.firstChild);
    }
    let checkbox = cell.querySelector<HTMLInputElement>("input");
    if (!checkbox) {
      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", `Select ${id}`);
      cell.appendChild(checkbox);
      checkbox.addEventListener("click", event => {
        const currentRows = workspaceRows(table);
        const currentIndex = currentRows.indexOf(row);
        const currentId = row.querySelector<HTMLElement>(".personId")?.textContent?.trim();
        if (!currentId) return;
        if ((event as MouseEvent).shiftKey && lastRowIndex >= 0) {
          const start = Math.min(lastRowIndex, currentIndex), end = Math.max(lastRowIndex, currentIndex);
          for (let position = start; position <= end; position++) {
            const rangeId = currentRows[position]?.querySelector<HTMLElement>(".personId")?.textContent?.trim();
            if (rangeId) selectedRows.add(rangeId);
          }
        } else if (checkbox!.checked) selectedRows.add(currentId); else selectedRows.delete(currentId);
        lastRowIndex = currentIndex;
        enhanceWorkspaceRows(page);
        syncBulkBar(page);
      });
    }
    checkbox.checked = selectedRows.has(id);
    row.classList.toggle("workspaceRowSelected", selectedRows.has(id));
  });

  const headCheck = header?.querySelector<HTMLInputElement>(".workspaceRowSelectHead input");
  if (headCheck) {
    const visibleIds = rows.map(row => row.querySelector<HTMLElement>(".personId")?.textContent?.trim()).filter(Boolean) as string[];
    headCheck.checked = visibleIds.length > 0 && visibleIds.every(id => selectedRows.has(id));
    headCheck.indeterminate = visibleIds.some(id => selectedRows.has(id)) && !headCheck.checked;
  }
}

async function deleteSelectedVisibleRows(page: HTMLElement) {
  const table = page.querySelector<HTMLTableElement>(".workspaceTable");
  if (!table || !selectedRows.size) return;
  const targets = workspaceRows(table).map((row, index) => ({ row, index, id: row.querySelector<HTMLElement>(".personId")?.textContent?.trim() || "" })).filter(item => item.id && selectedRows.has(item.id)).sort((a, b) => b.index - a.index);
  if (!targets.length) return;
  const approved = await confirmAction("Delete selected rows?", `${targets.length} selected ${targets.length === 1 ? "row" : "rows"} will be removed from this order. This can be undone immediately with Ctrl+Z.`, `Delete ${targets.length}`, true);
  if (!approved) return;
  for (const target of targets) {
    const row = workspaceRows(table).find(item => item.querySelector<HTMLElement>(".personId")?.textContent?.trim() === target.id);
    row?.querySelector<HTMLButtonElement>('.rowActions button[aria-label^="Delete"]')?.click();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  selectedRows.clear();
  toast(`${targets.length} ${targets.length === 1 ? "row" : "rows"} deleted. Use Ctrl+Z to restore if needed.`);
  syncBulkBar(page);
}

function ensureWorkspaceBulkBar(page: HTMLElement) {
  const anchor = page.querySelector<HTMLElement>(".workspaceTableHelp");
  if (!anchor || page.querySelector(".workspaceBulkBar")) return;
  const bar = document.createElement("div");
  bar.className = "workspaceBulkBar";
  bar.innerHTML = '<b class="workspaceBulkCount">0 rows selected</b><span>Select checkboxes or Shift-click a range.</span><div><button type="button" class="secondary workspaceBulkClear">Clear selection</button><button type="button" class="workspaceBulkDelete">Delete selected</button></div>';
  bar.querySelector<HTMLButtonElement>(".workspaceBulkClear")!.addEventListener("click", () => { selectedRows.clear(); enhanceWorkspaceRows(page); syncBulkBar(page); });
  bar.querySelector<HTMLButtonElement>(".workspaceBulkDelete")!.addEventListener("click", () => void deleteSelectedVisibleRows(page));
  anchor.insertAdjacentElement("beforebegin", bar);
  syncBulkBar(page);
}

function enhanceReadiness(page: HTMLElement) {
  const readiness = page.querySelector<HTMLElement>(".readiness");
  if (!readiness) return;
  readiness.classList.add("workspaceReadinessCompact");
  const details = readiness.querySelector<HTMLDetailsElement>("details");
  const summary = details?.querySelector("summary");
  if (summary) summary.textContent = "Review issues";
  if (!details || readiness.querySelector(".workspaceIssueChips")) return;
  const issues = Array.from(details.querySelectorAll("li")).map(item => item.textContent?.trim() || "").filter(Boolean);
  const groups = new Map<string, number>();
  issues.forEach(issue => {
    const name = issue.includes(":") ? issue.split(":")[0].trim() : issue.replace(/\.$/, "");
    groups.set(name, (groups.get(name) || 0) + 1);
  });
  if (!groups.size) return;
  const chips = document.createElement("div");
  chips.className = "workspaceIssueChips";
  [...groups.entries()].slice(0, 6).forEach(([name, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${name} · ${count}`;
    button.addEventListener("click", () => { details.open = true; details.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    chips.appendChild(button);
  });
  details.insertAdjacentElement("beforebegin", chips);
}

function enhanceWorkspaceAdd(page: HTMLElement) {
  const button = page.querySelector<HTMLButtonElement>(".workspaceAddTools .primary");
  const input = page.querySelector<HTMLInputElement>('.workspaceAddTools input[aria-label="Number of rows to add"]');
  if (!button || !input || button.dataset.bulkConfirmReady) return;
  button.dataset.bulkConfirmReady = "true";
  button.addEventListener("click", async event => {
    if (button.dataset.bulkConfirmBypass === "true") { delete button.dataset.bulkConfirmBypass; return; }
    const count = Math.max(1, Number(input.value) || 1);
    if (count === 1) { window.setTimeout(() => toast("1 row added."), 30); return; }
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const approved = await confirmAction(`Add ${count} rows?`, `This will create ${count} new person / record rows in the order workspace.`, `Add ${count} rows`);
    if (!approved) return;
    button.dataset.bulkConfirmBypass = "true";
    button.click();
    window.setTimeout(() => {
      const undo = () => {
        const cell = page.querySelector<HTMLElement>("[data-grid-row][data-grid-column]");
        cell?.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
      };
      toast(`${count} rows added.`, undo);
    }, 60);
  }, true);
}

function enhanceWorkspaceMenu(page: HTMLElement) {
  const menu = page.querySelector<HTMLElement>(".orderActionMenu");
  if (!menu || menu.dataset.unifiedLabelsReady) return;
  const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>(":scope > button"));
  const print = buttons.find(button => button.textContent?.trim() === "Print labels");
  const createButtons = Array.from(menu.querySelectorAll<HTMLButtonElement>(".orderMenuIndented"));
  const createLabel = menu.querySelector<HTMLElement>(".orderMenuSectionLabel");
  if (!print) return;
  menu.dataset.unifiedLabelsReady = "true";
  print.hidden = true;
  createLabel?.setAttribute("hidden", "true");
  createButtons.forEach(button => { button.hidden = true; });
  const labels = document.createElement("button");
  labels.type = "button";
  labels.className = "orderMenuPrimaryLabels";
  labels.textContent = "Labels";
  labels.title = "Open saved label sets, create new labels and print from one place";
  labels.addEventListener("click", () => print.click());
  const divider = menu.querySelector(".orderMenuDivider");
  divider?.insertAdjacentElement("afterend", labels);

  buttons.filter(button => ["Save", "Save & close"].includes(button.textContent?.trim() || "")).forEach(button => {
    if (button.dataset.saveNoticeReady) return;
    button.dataset.saveNoticeReady = "true";
    button.addEventListener("click", () => window.setTimeout(() => toast(button.textContent?.trim() === "Save & close" ? "Order saved." : "Changes saved."), 30));
  });
}

function enhanceWorkspace() {
  const page = document.querySelector<HTMLElement>(".workspacePage");
  if (!page) return;
  enhanceReadiness(page);
  ensureWorkspaceBulkBar(page);
  enhanceWorkspaceRows(page);
  enhanceWorkspaceAdd(page);
  enhanceWorkspaceMenu(page);
}

function enhanceLabelLauncher() {
  const page = document.querySelector<HTMLElement>(".labelLauncher");
  if (!page) return;
  const eyebrow = page.querySelector<HTMLElement>(".labelLauncherHead .eyebrow");
  const heading = page.querySelector<HTMLElement>(".labelLauncherHead h2");
  if (eyebrow) eyebrow.textContent = "LABELS";
  if (heading) heading.textContent = "Label library & printing";
  const libraryHeading = page.querySelector<HTMLElement>(".labelBatchModuleHead h3");
  if (libraryHeading) libraryHeading.textContent = "Saved label sets";
  const createHeading = page.querySelector<HTMLElement>(".labelOrderPickerHead h3");
  const createNote = page.querySelector<HTMLElement>(".labelOrderPickerHead small");
  if (createHeading) createHeading.textContent = "Create new labels";
  if (createNote) createNote.textContent = "Choose an order and use, then configure what gets one label, filters, layout and numbering.";
  const picker = page.querySelector<HTMLElement>(".labelOrderPicker");
  if (picker) picker.hidden = false;
  page.querySelectorAll<HTMLButtonElement>(".orderLabelActions button").forEach(button => { if (/Create label batch/i.test(button.textContent || "")) button.textContent = "Create labels"; });
  page.querySelectorAll<HTMLElement>(".emptyLibrary").forEach(node => { node.textContent = node.textContent?.replace(/batches/gi, "label sets") || ""; });
  const filter = page.querySelector<HTMLSelectElement>('select[aria-label="Filter label batches"]');
  if (filter) Array.from(filter.options).forEach(option => { if (option.value === "all") option.textContent = "All label sets"; });
  const search = page.querySelector<HTMLInputElement>('input[aria-label="Find a saved label batch"]');
  if (search) search.placeholder = "Find label set, order or client";
}

function enhanceLabelDesigner() {
  const page = document.querySelector<HTMLElement>(".labelDesignerV2");
  if (!page) return;
  page.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
    if (button.textContent?.trim() === "Save label set") button.classList.add("labelSetSave");
  });
}

function enhance() {
  enhanceOrderSetup();
  enhanceWorkspace();
  enhanceLabelLauncher();
  enhanceLabelDesigner();
}

export function SeikoOperationalFinalize() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, { observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden", "class"] } });
    document.addEventListener("change", controller.schedule, true);
    return () => { document.removeEventListener("change", controller.schedule, true); controller.stop(); };
  }, []);
  return null;
}
