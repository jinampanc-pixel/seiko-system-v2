"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

const LABEL_CONTEXT_KEY = "jinam:seiko:label-context-order";
const OPEN_ORDER_KEY = "jinam:seiko:open-order";
const SETUP_RETURN_KEY = "jinam:seiko:setup-return-order";
const NAV_INTENT_KEY = "jinam:navigation-intent";

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
    layer.tabIndex = -1;
    layer.innerHTML = '<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="seiko-confirm-title"><h3 id="seiko-confirm-title"></h3><p></p><div><button type="button" class="secondary cancel">Cancel</button><button type="button" class="primary confirm"></button></div></section>';
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

function waitFor(selector: string, action: (node: HTMLElement) => void, attempts = 50) {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) { action(node); return; }
  if (attempts <= 0) return;
  window.setTimeout(() => waitFor(selector, action, attempts - 1), 30);
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
    input.setAttribute("aria-description", "Use terminology appropriate to this order. School, company, hospital and other institution fields are supported.");
  });

  setup.querySelectorAll<HTMLElement>(".productPolicy").forEach(card => {
    const quantitySelect = card.querySelector<HTMLSelectElement>(".productPolicyTop label > select");
    const quantityInputs = Array.from(card.querySelectorAll<HTMLInputElement>(".productPolicyTop input"));
    const defaultInput = quantityInputs.at(-1);
    const defaultLabel = defaultInput?.closest("label")?.querySelector<HTMLElement>(":scope > span");
    const help = card.querySelector<HTMLElement>(":scope > .ruleHelp");
    if (quantitySelect?.value === "by_group" && defaultInput) {
      defaultInput.disabled = false;
      defaultInput.classList.remove("modeBlockedInput");
      defaultInput.min = "0";
      if (defaultLabel) defaultLabel.textContent = "Default qty";
      if (help) help.textContent = "Set the normal quantity once. Add only groups that differ. One exception may contain several values such as 1, 2, 3; quantity 0 means that group does not receive this product.";
      const rules = card.querySelector<HTMLElement>(".quantityGroupRules");
      const summary = rules?.querySelector<HTMLElement>(":scope > summary");
      if (summary) summary.textContent = "Quantity exceptions by group";
      rules?.querySelectorAll<HTMLInputElement>(":scope > div input:first-child").forEach(input => { input.placeholder = "Group values, e.g. 1, 2, 3"; });
      rules?.querySelectorAll<HTMLInputElement>('input[aria-label="Group quantity"]').forEach(input => { input.min = "0"; input.placeholder = "Qty"; });
    }
    if (quantitySelect?.value === "per_person" && defaultLabel) defaultLabel.textContent = "Entered in workspace";
  });

  const cancel = Array.from(setup.querySelectorAll<HTMLButtonElement>(".orderPageHead button")).find(button => /Cancel|Back to/.test(button.textContent || ""));
  if (cancel && !cancel.dataset.contextBackReady) {
    cancel.dataset.contextBackReady = "true";
    const returnOrder = sessionStorage.getItem(SETUP_RETURN_KEY);
    cancel.textContent = returnOrder ? "← Back to order" : "← Back to orders";
    cancel.addEventListener("click", () => {
      const orderNo = sessionStorage.getItem(SETUP_RETURN_KEY);
      if (!orderNo) return;
      sessionStorage.setItem(OPEN_ORDER_KEY, orderNo);
      sessionStorage.removeItem(SETUP_RETURN_KEY);
    });
  }
  const continueButton = Array.from(setup.querySelectorAll<HTMLButtonElement>(".orderPageHead button")).find(button => /Create workspace|Update workspace/.test(button.textContent || ""));
  if (continueButton && !continueButton.dataset.setupReturnReady) {
    continueButton.dataset.setupReturnReady = "true";
    continueButton.addEventListener("click", () => sessionStorage.removeItem(SETUP_RETURN_KEY));
  }
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
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const approved = await confirmAction(`Add ${count} rows?`, `This will create ${count} new person / record rows in this order.`, `Add ${count} rows`);
    if (!approved) return;
    button.dataset.bulkConfirmBypass = "true";
    button.click();
    window.setTimeout(() => {
      const undo = () => document.querySelector<HTMLElement>("[data-grid-row][data-grid-column]")?.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
      toast(`${count} rows added.`, undo);
    }, 60);
  }, true);
}

const selectedRows = new Set<string>();
let lastSelectedIndex = -1;

function workspaceRows(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLTableRowElement>(".workspaceTable tbody > tr"));
}

function rowId(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>(".personId")?.textContent?.trim() || "";
}

function nativeDelete(row: HTMLTableRowElement) {
  return Array.from(row.querySelectorAll<HTMLButtonElement>(".rowActions > button")).find(button => /^Delete /.test(button.getAttribute("aria-label") || ""));
}

function syncRowSelection(page: HTMLElement) {
  const rows = workspaceRows(page);
  rows.forEach(row => {
    const id = rowId(row);
    const checkbox = row.querySelector<HTMLInputElement>(".recordSelectToggle");
    if (checkbox) checkbox.checked = selectedRows.has(id);
    row.classList.toggle("workspaceRowSelected", selectedRows.has(id));
  });
  const selectAll = page.querySelector<HTMLInputElement>(".workspaceSelectAll");
  const visibleIds = rows.map(rowId).filter(Boolean);
  if (selectAll) {
    selectAll.checked = visibleIds.length > 0 && visibleIds.every(id => selectedRows.has(id));
    selectAll.indeterminate = visibleIds.some(id => selectedRows.has(id)) && !selectAll.checked;
  }
  const bar = page.querySelector<HTMLElement>(".workspaceBulkBar");
  if (bar) {
    bar.hidden = selectedRows.size === 0;
    const count = bar.querySelector<HTMLElement>(".workspaceBulkCount");
    if (count) count.textContent = `${selectedRows.size} ${selectedRows.size === 1 ? "row" : "rows"} selected`;
  }
}

async function deleteSelected(page: HTMLElement) {
  const targets = workspaceRows(page).filter(row => selectedRows.has(rowId(row)));
  if (!targets.length) return;
  const approved = await confirmAction("Delete selected rows?", `${targets.length} selected ${targets.length === 1 ? "row" : "rows"} will be removed. Ctrl+Z can restore the last change.`, `Delete ${targets.length}`, true);
  if (!approved) return;
  for (const row of [...targets].reverse()) {
    nativeDelete(row)?.click();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  selectedRows.clear();
  toast(`${targets.length} ${targets.length === 1 ? "row" : "rows"} deleted.`);
  syncRowSelection(page);
}

function enhanceWorkspaceRows(page: HTMLElement) {
  const table = page.querySelector<HTMLTableElement>(".workspaceTable");
  if (!table) return;
  const actionsHead = table.querySelector<HTMLTableCellElement>("thead > tr:first-child > th:last-child");
  if (actionsHead && !actionsHead.querySelector(".workspaceSelectAll")) {
    actionsHead.classList.add("workspaceActionsHead");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "workspaceSelectAll";
    checkbox.setAttribute("aria-label", "Select all visible rows");
    checkbox.addEventListener("change", () => {
      workspaceRows(page).forEach(row => {
        const id = rowId(row);
        if (!id) return;
        if (checkbox.checked) selectedRows.add(id); else selectedRows.delete(id);
      });
      syncRowSelection(page);
    });
    actionsHead.appendChild(checkbox);
  }

  workspaceRows(page).forEach((row, index) => {
    const id = rowId(row);
    const actions = row.querySelector<HTMLElement>(".rowActions");
    if (!id || !actions) return;
    if (!actions.querySelector(".recordSelectToggle")) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "recordSelectToggle";
      checkbox.setAttribute("aria-label", `Select ${id}`);
      checkbox.addEventListener("click", event => {
        const rows = workspaceRows(page);
        const currentIndex = rows.indexOf(row);
        if ((event as MouseEvent).shiftKey && lastSelectedIndex >= 0) {
          const start = Math.min(lastSelectedIndex, currentIndex);
          const end = Math.max(lastSelectedIndex, currentIndex);
          for (let position = start; position <= end; position++) {
            const rangeId = rowId(rows[position]);
            if (rangeId) selectedRows.add(rangeId);
          }
        } else if (checkbox.checked) selectedRows.add(id); else selectedRows.delete(id);
        lastSelectedIndex = currentIndex;
        syncRowSelection(page);
      });
      actions.prepend(checkbox);
    }

    if (!actions.querySelector(".recordActionMenu")) {
      const directButtons = Array.from(actions.querySelectorAll<HTMLButtonElement>(":scope > button"));
      directButtons.forEach(button => button.classList.add("recordNativeAction"));
      const menu = document.createElement("details");
      menu.className = "recordActionMenu";
      const summary = document.createElement("summary");
      summary.textContent = "•••";
      summary.setAttribute("aria-label", `More actions for ${id}`);
      const panel = document.createElement("div");
      directButtons.forEach(button => {
        const proxy = document.createElement("button");
        proxy.type = "button";
        const aria = button.getAttribute("aria-label") || "Action";
        proxy.textContent = aria.replace(new RegExp(`\\s+${id.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`), "");
        if (/^Delete /.test(aria)) proxy.className = "dangerText";
        proxy.addEventListener("click", () => { button.click(); menu.removeAttribute("open"); });
        panel.appendChild(proxy);
      });
      menu.append(summary, panel);
      actions.appendChild(menu);
    }
  });

  let bar = page.querySelector<HTMLElement>(".workspaceBulkBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "workspaceBulkBar";
    bar.hidden = true;
    bar.innerHTML = '<b class="workspaceBulkCount"></b><span>Shift-click selects a range.</span><div><button type="button" class="secondary workspaceBulkClear">Clear</button><button type="button" class="workspaceBulkDelete">Delete selected</button></div>';
    bar.querySelector<HTMLButtonElement>(".workspaceBulkClear")!.addEventListener("click", () => { selectedRows.clear(); syncRowSelection(page); });
    bar.querySelector<HTMLButtonElement>(".workspaceBulkDelete")!.addEventListener("click", () => void deleteSelected(page));
    page.querySelector(".workspaceTableWrap")?.insertAdjacentElement("beforebegin", bar);
  }
  syncRowSelection(page);
}

function workspaceOrderNo(page: HTMLElement) {
  return page.querySelector<HTMLElement>(".workspaceHead h2")?.textContent?.split("·")[0]?.trim() || "";
}

function workspaceAction(page: HTMLElement, text: string) {
  const toggle = page.querySelector<HTMLButtonElement>(".orderActionMenuButton");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const button = Array.from(page.querySelectorAll<HTMLButtonElement>(".orderActionMenu button")).find(item => item.textContent?.trim() === text);
    button?.click();
  }, 0);
}

function enhanceWorkspaceMenu(page: HTMLElement) {
  const orderNo = workspaceOrderNo(page);
  const headActions = page.querySelector<HTMLElement>(".workspaceHeadActions");
  if (headActions && !headActions.querySelector(".workspaceContextBack")) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary workspaceContextBack";
    back.textContent = "← Back to Orders";
    back.addEventListener("click", () => workspaceAction(page, "Save & close"));
    headActions.prepend(back);
  }

  const menu = page.querySelector<HTMLElement>(".orderActionMenu");
  if (!menu || menu.dataset.unifiedLabelsReady) return;
  const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>(":scope > button"));
  const print = buttons.find(button => button.textContent?.trim() === "Print labels");
  if (!print) return;
  menu.dataset.unifiedLabelsReady = "true";
  print.hidden = true;
  menu.querySelector<HTMLElement>(".orderMenuSectionLabel")?.setAttribute("hidden", "true");
  menu.querySelectorAll<HTMLButtonElement>(".orderMenuIndented").forEach(button => { button.hidden = true; });
  const labels = document.createElement("button");
  labels.type = "button";
  labels.className = "orderMenuPrimaryLabels";
  labels.textContent = "Labels";
  labels.addEventListener("click", () => {
    if (orderNo) sessionStorage.setItem(LABEL_CONTEXT_KEY, orderNo);
    print.click();
  });
  const divider = menu.querySelector(".orderMenuDivider");
  divider?.insertAdjacentElement("afterend", labels);

  const edit = buttons.find(button => button.textContent?.trim() === "Edit setup");
  edit?.addEventListener("click", () => { if (orderNo) sessionStorage.setItem(SETUP_RETURN_KEY, orderNo); });
  buttons.filter(button => ["Save", "Save & close"].includes(button.textContent?.trim() || "")).forEach(button => {
    if (button.dataset.saveNoticeReady) return;
    button.dataset.saveNoticeReady = "true";
    button.addEventListener("click", () => window.setTimeout(() => toast(button.textContent?.trim() === "Save & close" ? "Order saved." : "Changes saved."), 30));
  });
}

function triggerRowAction(row: HTMLElement, action: "open" | "setup" | "labels") {
  const orderNo = row.querySelector("b")?.textContent?.trim() || "";
  const open = row.querySelector<HTMLButtonElement>(".openOrderButton");
  if (!open) return;
  if (action === "open") { open.click(); return; }
  if (action === "setup") sessionStorage.setItem(SETUP_RETURN_KEY, orderNo);
  if (action === "labels") sessionStorage.setItem(LABEL_CONTEXT_KEY, orderNo);
  open.click();
  waitFor(".workspacePage", node => {
    const page = node as HTMLElement;
    enhanceWorkspaceMenu(page);
    workspaceAction(page, action === "setup" ? "Edit setup" : "Labels");
  });
}

function enhanceOrderCenter() {
  const center = document.querySelector<HTMLElement>(".ordersPage");
  if (!center) return;
  center.querySelectorAll<HTMLElement>(".orderRow").forEach(row => {
    const menu = row.querySelector<HTMLDetailsElement>(".orderMenu");
    if (!menu || menu.querySelector(".stage1OrderActions")) return;
    const group = document.createElement("div");
    group.className = "stage1OrderActions";
    const add = (text: string, action: "open" | "setup" | "labels") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", () => { menu.removeAttribute("open"); triggerRowAction(row, action); });
      group.appendChild(button);
    };
    add("Open order", "open");
    add("Edit setup", "setup");
    add("Labels", "labels");
    menu.querySelector("summary")?.insertAdjacentElement("afterend", group);
  });

  const requested = sessionStorage.getItem(OPEN_ORDER_KEY);
  if (!requested) return;
  const row = Array.from(center.querySelectorAll<HTMLElement>(".orderRow")).find(item => item.querySelector("b")?.textContent?.trim() === requested);
  if (!row) return;
  sessionStorage.removeItem(OPEN_ORDER_KEY);
  row.querySelector<HTMLButtonElement>(".openOrderButton")?.click();
}

function returnToOrder(orderNo: string) {
  sessionStorage.setItem(OPEN_ORDER_KEY, orderNo);
  sessionStorage.removeItem(LABEL_CONTEXT_KEY);
  sessionStorage.setItem(NAV_INTENT_KEY, "orders");
  window.location.assign(`${window.location.pathname}?business=seiko`);
}

function enhanceLabelLauncher() {
  const page = document.querySelector<HTMLElement>(".labelLauncher");
  if (!page) return;
  const head = page.querySelector<HTMLElement>(".labelLauncherHead");
  const picker = page.querySelector<HTMLElement>(".labelOrderPicker");
  if (!head || !picker) return;
  const contextOrder = sessionStorage.getItem(LABEL_CONTEXT_KEY) || "";
  page.classList.toggle("labelLauncherFocused", Boolean(contextOrder));

  let actions = head.querySelector<HTMLElement>(".labelLauncherHeadActions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "labelLauncherHeadActions";
    Array.from(head.querySelectorAll<HTMLButtonElement>(":scope > button")).forEach(button => actions!.appendChild(button));
    head.appendChild(actions);
  }
  if (!actions.querySelector(".labelCreateToggle")) {
    const create = document.createElement("button");
    create.type = "button";
    create.className = "primary labelCreateToggle";
    create.textContent = "+ Create labels";
    create.setAttribute("aria-expanded", contextOrder ? "true" : "false");
    create.addEventListener("click", () => {
      const open = !page.classList.contains("labelCreateOpen");
      page.classList.toggle("labelCreateOpen", open);
      create.setAttribute("aria-expanded", String(open));
      if (open) picker.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    actions.prepend(create);
  }
  if (contextOrder) {
    page.classList.add("labelCreateOpen");
    actions.querySelector<HTMLButtonElement>(".labelCreateToggle")?.setAttribute("aria-expanded", "true");
    if (!actions.querySelector(".labelReturnToOrder")) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "secondary labelReturnToOrder";
      back.textContent = "← Back to order";
      back.addEventListener("click", () => returnToOrder(contextOrder));
      actions.prepend(back);
    }
    page.querySelectorAll<HTMLElement>(".labelOrderResults > article").forEach(article => {
      const orderNo = article.querySelector("b")?.textContent?.split("·")[0]?.trim() || "";
      article.hidden = orderNo !== contextOrder;
    });
    const title = picker.querySelector<HTMLElement>(".labelOrderPickerHead h3");
    if (title) title.textContent = `Create labels for ${contextOrder}`;
  }
}

function enhanceLabelDesigner() {
  const page = document.querySelector<HTMLElement>(".labelDesignerV2");
  if (!page) return;
  page.classList.add("labelWorkspaceRepaired");
  page.querySelector<HTMLButtonElement>(".labelSetSave")?.classList.add("primary");
}

function enhance() {
  enhanceOrderSetup();
  enhanceOrderCenter();
  const workspace = document.querySelector<HTMLElement>(".workspacePage");
  if (workspace) {
    enhanceReadiness(workspace);
    enhanceWorkspaceAdd(workspace);
    enhanceWorkspaceRows(workspace);
    enhanceWorkspaceMenu(workspace);
  }
  enhanceLabelLauncher();
  enhanceLabelDesigner();
}

export function SeikoOperationalFinalize() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, {
      shouldSchedule: mutations => mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length || mutation.type === "attributes"),
    });
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
      selectedRows.clear();
      lastSelectedIndex = -1;
    };
  }, []);
  return null;
}
