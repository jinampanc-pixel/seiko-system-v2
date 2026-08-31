"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";
import type { SeikoOrder } from "./lib/order-domain";

type OrderFilters = {
  status: string;
  clientType: string;
  product: string;
  delivery: "all" | "due7" | "overdue" | "none";
};

const filterState: OrderFilters = { status: "", clientType: "", product: "", delivery: "all" };

function currentBusiness() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function ordersForBusiness(): SeikoOrder[] {
  try {
    return JSON.parse(localStorage.getItem(`jinam:${currentBusiness()}:orders-v1`) || "[]") as SeikoOrder[];
  } catch {
    return [];
  }
}

function orderNumberFromRow(row: HTMLElement) {
  return row.querySelector<HTMLElement>(":scope > div:first-child > b")?.textContent?.trim() || "";
}

function option(select: HTMLSelectElement, value: string, label: string) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  select.appendChild(node);
}

function buildSelect(label: string, className: string, values: Array<[string, string]>, onChange: (value: string) => void) {
  const wrap = document.createElement("label");
  wrap.className = `orderAdvancedFilter ${className}`;
  const span = document.createElement("span");
  span.textContent = label;
  const select = document.createElement("select");
  values.forEach(([value, text]) => option(select, value, text));
  select.addEventListener("change", () => onChange(select.value));
  wrap.append(span, select);
  return wrap;
}

function dueState(order: SeikoOrder) {
  if (!order.details.deliveryDate) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${order.details.deliveryDate}T00:00:00`);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "overdue";
  if (days <= 7) return "due7";
  return "later";
}

function activeFilterCount() {
  return [filterState.status, filterState.clientType, filterState.product, filterState.delivery !== "all" ? filterState.delivery : ""].filter(Boolean).length;
}

function matchingProducts(orders: SeikoOrder[]) {
  const scope = filterState.clientType ? orders.filter(order => order.details.clientType === filterState.clientType) : orders;
  return [...new Set(scope.flatMap(order => order.products.map(product => product.name.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function syncProductSelect(page: HTMLElement) {
  const select = page.querySelector<HTMLSelectElement>(".orderAdvancedFilter.product select");
  if (!select) return;
  const orders = ordersForBusiness().filter(order => !order.archived);
  const products = matchingProducts(orders);
  const previous = products.includes(filterState.product) ? filterState.product : "";
  filterState.product = previous;
  select.replaceChildren();
  option(select, "", filterState.clientType ? "All products for this client type" : "All products");
  products.forEach(value => option(select, value, value));
  select.value = previous;
}

function applyOrderFilters(page: HTMLElement) {
  const orders = ordersForBusiness();
  const byNumber = new Map(orders.map(order => [order.details.orderNo, order]));
  page.querySelectorAll<HTMLElement>(".orderList .orderRow").forEach(row => {
    const order = byNumber.get(orderNumberFromRow(row));
    if (!order) return;
    const matches =
      (!filterState.status || order.status === filterState.status) &&
      (!filterState.clientType || order.details.clientType === filterState.clientType) &&
      (!filterState.product || order.products.some(product => product.name === filterState.product)) &&
      (filterState.delivery === "all" || dueState(order) === filterState.delivery);
    row.hidden = !matches;
  });

  const shown = page.querySelectorAll(".orderList .orderRow:not([hidden])").length;
  const count = page.querySelector<HTMLElement>(".orderAdvancedFilterCount");
  if (count) count.textContent = `${shown} shown`;
  const active = page.querySelector<HTMLElement>(".orderFilterActiveCount");
  const total = activeFilterCount();
  if (active) {
    active.textContent = total ? String(total) : "";
    active.hidden = total === 0;
  }
  page.querySelector<HTMLElement>(".orderFilterToggle")?.classList.toggle("active", total > 0);
}

function ensureOrderFilters(page: HTMLElement) {
  if (page.querySelector(".orderAdvancedFilters")) {
    syncProductSelect(page);
    applyOrderFilters(page);
    return;
  }
  const tools = page.querySelector<HTMLElement>(".orderTools");
  if (!tools) return;
  const orders = ordersForBusiness().filter(order => !order.archived);
  const clientTypes = [...new Set(orders.map(order => order.details.clientType).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "orderFilterToggle";
  toggle.setAttribute("aria-label", "Open order filters");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span class="orderFilterGlyph" aria-hidden="true"><i></i><i></i><i></i></span><b>Filters</b><em class="orderFilterActiveCount" hidden></em>';
  tools.appendChild(toggle);

  const bar = document.createElement("section");
  bar.className = "orderAdvancedFilters";
  bar.hidden = true;
  const head = document.createElement("div");
  head.className = "orderAdvancedFilterHead";
  head.innerHTML = '<div><b>Filter orders</b><span class="orderAdvancedFilterCount"></span></div>';
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "textButton";
  clear.textContent = "Clear all";
  head.appendChild(clear);
  const grid = document.createElement("div");
  grid.className = "orderAdvancedFilterGrid";

  const status = buildSelect("Status", "status", [["", "All statuses"], ["Draft", "Draft"], ["Active", "Active"], ["On Hold", "On Hold"], ["Completed", "Completed"], ["Cancelled", "Cancelled"]], value => { filterState.status = value; applyOrderFilters(page); });
  const type = buildSelect("Client type", "clientType", [["", "All client types"], ...clientTypes.map(value => [value, value] as [string, string])], value => {
    filterState.clientType = value;
    syncProductSelect(page);
    applyOrderFilters(page);
  });
  const product = buildSelect("Product", "product", [["", "All products"], ...matchingProducts(orders).map(value => [value, value] as [string, string])], value => { filterState.product = value; applyOrderFilters(page); });
  const delivery = buildSelect("Delivery", "delivery", [["all", "Any delivery date"], ["due7", "Due in next 7 days"], ["overdue", "Overdue"], ["none", "No delivery date"]], value => { filterState.delivery = value as OrderFilters["delivery"]; applyOrderFilters(page); });
  grid.append(status, type, product, delivery);
  bar.append(head, grid);
  tools.insertAdjacentElement("afterend", bar);

  toggle.addEventListener("click", () => {
    const open = bar.hidden;
    bar.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });
  clear.addEventListener("click", () => {
    filterState.status = "";
    filterState.clientType = "";
    filterState.product = "";
    filterState.delivery = "all";
    bar.querySelectorAll<HTMLSelectElement>("select").forEach(select => { select.selectedIndex = 0; });
    syncProductSelect(page);
    applyOrderFilters(page);
  });
  applyOrderFilters(page);
}

function closeOtherMenus(except?: HTMLDetailsElement) {
  document.querySelectorAll<HTMLDetailsElement>(".seikoRowActionMenu[open]").forEach(menu => {
    if (menu !== except) menu.open = false;
  });
}

function waitForWorkspaceAction(label: string, attempts = 60) {
  const page = document.querySelector<HTMLElement>(".workspacePage");
  if (!page) {
    if (attempts > 0) window.setTimeout(() => waitForWorkspaceAction(label, attempts - 1), 40);
    return;
  }
  const toggle = page.querySelector<HTMLButtonElement>(".orderActionMenuButton");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const action = Array.from(page.querySelectorAll<HTMLButtonElement>(".orderActionMenu button")).find(button => button.textContent?.trim() === label);
    action?.click();
  }, 0);
}

function ensureOrderMenus(page: HTMLElement) {
  const orders = ordersForBusiness();
  const byNumber = new Map(orders.map(order => [order.details.orderNo, order]));
  page.querySelectorAll<HTMLElement>(".orderList .orderRow").forEach(row => {
    if (row.querySelector(".seikoRowActionMenu")) return;
    const order = byNumber.get(orderNumberFromRow(row));
    const open = row.querySelector<HTMLButtonElement>(".openOrderButton");
    const archive = row.querySelector<HTMLButtonElement>(".orderArchiveButton");
    if (!order || !open || !archive) return;

    archive.hidden = true;
    const menu = document.createElement("details");
    menu.className = "seikoRowActionMenu orderCenterActionMenu";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", `Actions for ${order.details.orderNo}`);
    summary.textContent = "•••";
    const panel = document.createElement("div");
    panel.className = "seikoRowActionPanel";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit setup";
    edit.addEventListener("click", () => {
      menu.open = false;
      open.click();
      waitForWorkspaceAction("Edit setup");
    });

    const labelsAction = document.createElement("button");
    labelsAction.type = "button";
    labelsAction.textContent = "Create labels";
    labelsAction.addEventListener("click", () => {
      window.location.href = `/labels/create?business=${encodeURIComponent(currentBusiness())}&order=${encodeURIComponent(order.orderId)}`;
    });

    const archiveAction = document.createElement("button");
    archiveAction.type = "button";
    archiveAction.className = order.archived ? "" : "dangerText";
    archiveAction.textContent = order.archived ? "Restore order" : "Archive order";
    archiveAction.addEventListener("click", () => { menu.open = false; archive.click(); });

    panel.append(edit, labelsAction, archiveAction);
    menu.append(summary, panel);
    menu.addEventListener("toggle", () => { if (menu.open) closeOtherMenus(menu); });
    row.appendChild(menu);
  });
}

function removeSavedLabelSet(batchName: string) {
  const key = `jinam:${currentBusiness()}:labels:tasks-v1`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]") as Array<{ name?: string }>;
    localStorage.setItem(key, JSON.stringify(saved.filter(item => item.name !== batchName)));
    window.location.reload();
  } catch {
    // Preserve the current library if its stored value is unreadable.
  }
}

function ensureLabelCenterMenus(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>(".labelBatchModuleList > article").forEach(row => {
    if (row.querySelector(".seikoRowActionMenu")) return;
    const title = row.querySelector<HTMLElement>("b")?.textContent?.trim() || "Saved label set";
    const open = row.querySelector<HTMLButtonElement>(":scope > button");
    if (!open) return;
    const menu = document.createElement("details");
    menu.className = "seikoRowActionMenu labelCenterActionMenu";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", `Actions for ${title}`);
    summary.textContent = "•••";
    const panel = document.createElement("div");
    panel.className = "seikoRowActionPanel";
    const openAction = document.createElement("button");
    openAction.type = "button";
    openAction.textContent = "Open label set";
    openAction.addEventListener("click", () => { menu.open = false; open.click(); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "dangerText";
    remove.textContent = "Remove saved set";
    remove.addEventListener("click", () => {
      if (window.confirm(`Remove saved label set “${title}”? The order itself will not be changed.`)) removeSavedLabelSet(title);
    });
    panel.append(openAction, remove);
    menu.append(summary, panel);
    menu.addEventListener("toggle", () => { if (menu.open) closeOtherMenus(menu); });
    row.appendChild(menu);
  });

  page.querySelectorAll<HTMLElement>(".labelOrderResults > article").forEach(row => {
    if (row.querySelector(".seikoRowActionMenu")) return;
    const create = row.querySelector<HTMLButtonElement>(".orderLabelActions button");
    if (!create) return;
    const title = row.querySelector<HTMLElement>("strong")?.textContent?.trim() || row.querySelector<HTMLElement>("b")?.textContent?.trim() || "Label source";
    const menu = document.createElement("details");
    menu.className = "seikoRowActionMenu labelCenterActionMenu";
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", `Actions for ${title}`);
    summary.textContent = "•••";
    const panel = document.createElement("div");
    panel.className = "seikoRowActionPanel";
    const createAction = document.createElement("button");
    createAction.type = "button";
    createAction.textContent = "Create label set";
    createAction.addEventListener("click", () => { menu.open = false; create.click(); });
    panel.appendChild(createAction);
    menu.append(summary, panel);
    menu.addEventListener("toggle", () => { if (menu.open) closeOtherMenus(menu); });
    row.appendChild(menu);
  });
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".ordersPage").forEach(page => {
    ensureOrderFilters(page);
    ensureOrderMenus(page);
  });
  document.querySelectorAll<HTMLElement>(".labelLauncher").forEach(page => ensureLabelCenterMenus(page));
}

export function SeikoListCenterEnhancements() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance);
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".seikoRowActionMenu")) closeOtherMenus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
    };
  }, []);
  return null;
}
