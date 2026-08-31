"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";
import type { SeikoOrder } from "./lib/order-domain";

type OrderFilters = {
  status: string;
  clientType: string;
  product: string;
  records: "all" | "with" | "without";
  delivery: "all" | "due7" | "overdue" | "none";
};

const filterState: OrderFilters = { status: "", clientType: "", product: "", records: "all", delivery: "all" };

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
      (filterState.records === "all" || (filterState.records === "with" ? order.records.length > 0 : order.records.length === 0)) &&
      (filterState.delivery === "all" || dueState(order) === filterState.delivery);
    row.hidden = !matches;
  });

  const count = page.querySelector<HTMLElement>(".orderAdvancedFilterCount");
  if (count) {
    const shown = page.querySelectorAll(".orderList .orderRow:not([hidden])").length;
    count.textContent = `${shown} shown`;
  }
}

function ensureOrderFilters(page: HTMLElement) {
  if (page.querySelector(".orderAdvancedFilters")) {
    applyOrderFilters(page);
    return;
  }
  const tools = page.querySelector<HTMLElement>(".orderTools");
  if (!tools) return;
  const orders = ordersForBusiness().filter(order => !order.archived);
  const clientTypes = [...new Set(orders.map(order => order.details.clientType).filter(Boolean))].sort();
  const products = [...new Set(orders.flatMap(order => order.products.map(product => product.name.trim()).filter(Boolean)))].sort();

  const bar = document.createElement("section");
  bar.className = "orderAdvancedFilters";
  const head = document.createElement("div");
  head.className = "orderAdvancedFilterHead";
  head.innerHTML = '<div><b>Filters</b><span class="orderAdvancedFilterCount"></span></div>';
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "textButton";
  clear.textContent = "Clear filters";
  head.appendChild(clear);
  const grid = document.createElement("div");
  grid.className = "orderAdvancedFilterGrid";

  const status = buildSelect("Status", "status", [["", "All statuses"], ["Draft", "Draft"], ["Active", "Active"], ["On Hold", "On Hold"], ["Completed", "Completed"], ["Cancelled", "Cancelled"]], value => { filterState.status = value; applyOrderFilters(page); });
  const type = buildSelect("Client type", "clientType", [["", "All client types"], ...clientTypes.map(value => [value, value] as [string, string])], value => { filterState.clientType = value; applyOrderFilters(page); });
  const product = buildSelect("Product", "product", [["", "All products"], ...products.map(value => [value, value] as [string, string])], value => { filterState.product = value; applyOrderFilters(page); });
  const records = buildSelect("Records", "records", [["all", "Any record count"], ["with", "Has person / records"], ["without", "No person / records"]], value => { filterState.records = value as OrderFilters["records"]; applyOrderFilters(page); });
  const delivery = buildSelect("Delivery", "delivery", [["all", "Any delivery date"], ["due7", "Due in next 7 days"], ["overdue", "Overdue"], ["none", "No delivery date"]], value => { filterState.delivery = value as OrderFilters["delivery"]; applyOrderFilters(page); });
  grid.append(status, type, product, records, delivery);
  bar.append(head, grid);
  tools.insertAdjacentElement("afterend", bar);

  clear.addEventListener("click", () => {
    filterState.status = "";
    filterState.clientType = "";
    filterState.product = "";
    filterState.records = "all";
    filterState.delivery = "all";
    bar.querySelectorAll<HTMLSelectElement>("select").forEach(select => select.selectedIndex = 0);
    applyOrderFilters(page);
  });
  applyOrderFilters(page);
}

function closeOtherMenus(except?: HTMLDetailsElement) {
  document.querySelectorAll<HTMLDetailsElement>(".seikoRowActionMenu[open]").forEach(menu => {
    if (menu !== except) menu.open = false;
  });
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

    const openAction = document.createElement("button");
    openAction.type = "button";
    openAction.textContent = "Open order";
    openAction.addEventListener("click", () => { menu.open = false; open.click(); });

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

    panel.append(openAction, labelsAction, archiveAction);
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
    // Keep the current library intact if its stored value is unreadable.
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

function ensureChipRemove(page: HTMLElement) {
  page.querySelectorAll<HTMLButtonElement>(".labelInfoSelectedStrip .labelInfoChip").forEach(chip => {
    if (chip.querySelector(".labelInfoChipRemove")) return;
    const label = chip.textContent?.trim() || "";
    chip.dataset.fieldLabel = label;
    const remove = document.createElement("span");
    remove.className = "labelInfoChipRemove";
    remove.setAttribute("aria-hidden", "true");
    remove.textContent = "×";
    chip.appendChild(remove);
  });
}

function deselectChip(chip: HTMLButtonElement) {
  const page = chip.closest<HTMLElement>(".labelDesignerPage");
  const label = chip.dataset.fieldLabel || chip.childNodes[0]?.textContent?.trim() || "";
  if (!page || !label) return;
  const choice = Array.from(page.querySelectorAll<HTMLElement>(".fieldChecklist .fieldChoice")).find(item => item.querySelector("label span")?.textContent?.trim() === label);
  const checkbox = choice?.querySelector<HTMLInputElement>('label input[type="checkbox"]');
  if (checkbox?.checked) checkbox.click();
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".ordersPage").forEach(page => {
    ensureOrderFilters(page);
    ensureOrderMenus(page);
  });
  document.querySelectorAll<HTMLElement>(".labelLauncherPage").forEach(page => ensureLabelCenterMenus(page));
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => ensureChipRemove(page));
}

export function SeikoListCenterEnhancements() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance);
    const capture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const remove = target?.closest<HTMLElement>(".labelInfoChipRemove");
      if (!remove) return;
      const chip = remove.closest<HTMLButtonElement>(".labelInfoChip");
      if (!chip) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      deselectChip(chip);
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".seikoRowActionMenu")) closeOtherMenus();
    };
    document.addEventListener("click", capture, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("click", capture, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
    };
  }, []);
  return null;
}
