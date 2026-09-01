"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";
import { groupRuleMatches, quantityForRecord, type SeikoOrder } from "./lib/order-domain";

type SavedLabelTask = {
  orderId?: string;
  selectedRows?: string[];
};

function currentBusiness() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function readOrders(): SeikoOrder[] {
  try {
    return JSON.parse(localStorage.getItem(`jinam:${currentBusiness()}:orders-v1`) || "[]") as SeikoOrder[];
  } catch {
    return [];
  }
}

function readSavedLabelTasks(): SavedLabelTask[] {
  try {
    return JSON.parse(localStorage.getItem(`jinam:${currentBusiness()}:labels:tasks-v1`) || "[]") as SavedLabelTask[];
  } catch {
    return [];
  }
}

function setNativeSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
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
    const action = Array.from(page.querySelectorAll<HTMLButtonElement>(".orderActionMenu button"))
      .find(button => button.textContent?.trim() === label);
    action?.click();
  }, 0);
}

function dueLabel(order: SeikoOrder) {
  const date = order.details.deliveryDate;
  if (!date) return "Not set";
  const due = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const display = due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (days < 0) return `${display} · ${Math.abs(days)}d overdue`;
  if (days === 0) return `${display} · today`;
  if (days <= 7) return `${display} · ${days}d`;
  return display;
}

function appendMetaItem(host: HTMLElement, label: string, value: string) {
  const item = document.createElement("span");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("b");
  strong.textContent = value;
  item.append(small, strong);
  host.appendChild(item);
  return item;
}

function enhanceHome() {
  document.querySelectorAll<HTMLElement>(".overview .moduleGrid .moduleCard").forEach(card => { if (card.querySelector("h3")?.textContent?.trim() === "Orders") card.hidden = true; });
}

function resolvedSpecification(order: SeikoOrder, product: SeikoOrder["products"][number], spec: SeikoOrder["products"][number]["specifications"][number]) {
  const values = new Set<string>();
  order.records.forEach((record, index) => {
    if (record.held || quantityForRecord(product, record, index === 0) <= 0) return;
    let value = spec.defaultValue || "";
    if (spec.mode === "per_person") value = String(record.values[`spec:${spec.id}`] || "");
    if (spec.mode === "default_with_exceptions") value = String(record.values[`spec:${spec.id}:override`] ?? spec.defaultValue ?? "");
    if (spec.mode === "by_group") { const source=spec.groupFieldId ? String(record.values[`field:${spec.groupFieldId}`] || "") : ""; value=(spec.groupRules||[]).find(rule=>groupRuleMatches(rule.match,source))?.value || spec.defaultValue || ""; }
    if (value.trim()) values.add(value.trim());
  });
  return [...values].join(", ");
}
function orderProductSummary(order: SeikoOrder) {
  return order.products.filter(product=>product.name.trim()).map(product=>{
    const total=order.records.reduce((sum,record,index)=>sum+(record.held?0:quantityForRecord(product,record,index===0)),0);
    const specs=product.specifications.filter(spec=>spec.role==="colour"||spec.role==="pattern"||/colou?r|pattern/i.test(spec.name)).map(spec=>{const value=resolvedSpecification(order,product,spec);return value?`${spec.name}: ${value}`:"";}).filter(Boolean);
    return `${product.name} · Qty ${total}${specs.length?` · ${specs.join(" · ")}`:""}`;
  });
}
function removeProductHover(){document.querySelector(".orderProductHoverCard")?.remove();}
function showProductHover(target: HTMLElement, order: SeikoOrder){removeProductHover();const card=document.createElement("div");card.className="orderProductHoverCard";const title=document.createElement("b");title.textContent=`${order.details.orderNo} products`;const body=document.createElement("div");orderProductSummary(order).forEach(line=>{const row=document.createElement("span");row.textContent=line;body.appendChild(row);});card.append(title,body);document.body.appendChild(card);const box=target.getBoundingClientRect(),measured=card.getBoundingClientRect();card.style.left=`${Math.max(8,Math.min(window.innerWidth-measured.width-8,box.left))}px`;card.style.top=`${Math.max(8,Math.min(window.innerHeight-measured.height-8,box.bottom+6))}px`;}

function enhanceOrderCenter(page: HTMLElement) {
  const orders = readOrders();
  const byNumber = new Map(orders.map(order => [order.details.orderNo, order]));
  const tasks = readSavedLabelTasks();

  page.querySelectorAll<HTMLElement>(".orderList .orderRow").forEach(row => {
    const orderNo = row.querySelector<HTMLElement>(":scope > div:first-child > b")?.textContent?.trim() || "";
    const order = byNumber.get(orderNo);
    const open = row.querySelector<HTMLButtonElement>(".openOrderButton");
    const nativeStatus = row.querySelector<HTMLSelectElement>(".orderListStatus select");
    const statusWrap = row.querySelector<HTMLElement>(".orderListStatus");
    const menu = row.querySelector<HTMLDetailsElement>(".orderCenterActionMenu");
    const panel = menu?.querySelector<HTMLElement>(".seikoRowActionPanel");
    if (!order || !open || !nativeStatus || !panel || !menu) return;

    open.hidden = true;
    statusWrap?.setAttribute("hidden", "");
    statusWrap?.classList.remove("orderCenterInlineStatus");
    row.classList.add("orderRowClickable");
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Open order ${order.details.orderNo} for ${order.details.clientName || "client"}`);

    const detail = row.querySelector<HTMLElement>(":scope > div:first-child");
    const legacyMeta = detail?.querySelector<HTMLElement>(":scope > small");
    if (legacyMeta) legacyMeta.hidden = true;
    detail?.querySelector<HTMLElement>(".orderCenterStatusBadge")?.remove();

    let meta = row.querySelector<HTMLElement>(".orderCenterOperationalMeta");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "orderCenterOperationalMeta";
      detail?.appendChild(meta);
    }
    const metaSignature = [order.details.clientType, order.records.length, order.products.filter(product => product.name.trim()).length, dueLabel(order), order.revisions.length].join("|");
    if (meta.dataset.signature !== metaSignature) {
      meta.dataset.signature = metaSignature;
      meta.replaceChildren();
      appendMetaItem(meta, "Client type", order.details.clientType || "—");
      appendMetaItem(meta, "Records", String(order.records.length));
      const productMeta = appendMetaItem(meta, "Products", String(order.products.filter(product => product.name.trim()).length));
      productMeta.classList.add("orderProductMeta"); productMeta.tabIndex = 0;
      if (productMeta.dataset.productHoverReady !== "true") { productMeta.dataset.productHoverReady="true"; productMeta.addEventListener("pointerenter",()=>showProductHover(productMeta,order)); productMeta.addEventListener("pointerleave",removeProductHover); productMeta.addEventListener("focus",()=>showProductHover(productMeta,order)); productMeta.addEventListener("blur",removeProductHover); }
      appendMetaItem(meta, "Delivery", dueLabel(order));
    }

    if (row.dataset.rowOpenReady !== "true") {
      row.dataset.rowOpenReady = "true";
      const shouldOpen = (target: EventTarget | null) => !(target instanceof Element && target.closest("button,input,select,label,details,summary,a"));
      row.addEventListener("click", event => { if (shouldOpen(event.target)) open.click(); });
      row.addEventListener("keydown", event => {
        if ((event.key === "Enter" || event.key === " ") && event.target === row) {
          event.preventDefault();
          open.click();
        }
      });
    }

    let statusControl = panel.querySelector<HTMLElement>(".orderMenuStatusControl");
    if (!statusControl) {
      statusControl = document.createElement("label");
      statusControl.className = "orderMenuStatusControl";
      const label = document.createElement("span");
      label.textContent = "Status";
      const select = nativeStatus.cloneNode(true) as HTMLSelectElement;
      select.removeAttribute("class");
      select.setAttribute("aria-label", `Status for ${order.details.orderNo}`);
      select.addEventListener("click", event => event.stopPropagation());
      select.addEventListener("change", () => {
        setNativeSelect(nativeStatus, select.value);
        window.setTimeout(() => { menu.open = false; }, 0);
      });
      statusControl.append(label, select);
      panel.prepend(statusControl);
    }
    const menuSelect = statusControl.querySelector<HTMLSelectElement>("select");
    if (menuSelect) menuSelect.value = nativeStatus.value;

    const hasPrintable = tasks.some(task => task.orderId === order.orderId && (task.selectedRows?.length || 0) > 0);
    let print = panel.querySelector<HTMLButtonElement>(".orderMenuPrintLabels");
    if (hasPrintable && !print) {
      print = document.createElement("button");
      print.type = "button";
      print.className = "orderMenuPrintLabels";
      print.textContent = "Print labels";
      print.addEventListener("click", () => {
        menu.open = false;
        open.click();
        waitForWorkspaceAction("Labels");
      });
      const create = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.trim() === "Create labels");
      if (create) create.insertAdjacentElement("afterend", print); else panel.appendChild(print);
    }
    if (!hasPrintable && print) print.remove();
  });
}

function enhanceWorkspace(page: HTMLElement) {
  page.querySelector<HTMLElement>(".workspaceStatusControl")?.classList.add("workspaceHeaderSecondaryAction");
  page.querySelector<HTMLElement>(".workspaceQuickSave")?.classList.add("workspaceHeaderSecondaryAction");
  page.querySelector(".workspaceMenuOperational")?.remove();
}

function enhanceSettings(panel: HTMLElement) {
  panel.querySelector<HTMLElement>(".seikoAccessSettings")?.setAttribute("hidden", "");
  let nav = panel.querySelector<HTMLElement>(".settingsModuleNav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "settingsModuleNav";
    nav.setAttribute("aria-label", "Settings modules");
    const modules: Array<["appearance" | "users", string, string]> = [
      ["appearance", "1", "Appearance"],
      ["users", "2", "Users & access"],
    ];
    modules.forEach(([key, no, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.module = key;
      button.innerHTML = `<small>${no}</small><span>${label}</span>`;
      button.addEventListener("click", () => activateSettingsModule(panel, key));
      nav!.appendChild(button);
    });
    panel.querySelector(".themeHead")?.insertAdjacentElement("afterend", nav);

    const users = document.createElement("section");
    users.className = "settingsUsersModule";
    users.hidden = true;
    users.innerHTML = "<p class=\"eyebrow\">USERS & ACCESS</p><h3>Users, roles and permissions</h3><p>Manage who can enter SEIKO and which operational modules each person can use. This is the second Settings module and remains separate from Appearance.</p>";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "primary";
    open.textContent = "Open users & access";
    open.addEventListener("click", () => {
      panel.querySelector<HTMLButtonElement>(".themeHead > button")?.click();
      window.setTimeout(() => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click(), 0);
    });
    users.appendChild(open);
    panel.querySelector(".themeActions")?.insertAdjacentElement("beforebegin", users);

    Array.from(panel.children).forEach(child => {
      if (!(child instanceof HTMLElement)) return;
      if (child.matches(".themeHead,.settingsModuleNav,.settingsUsersModule,.themeActions,.seikoAccessSettings")) return;
      child.classList.add("settingsAppearanceModule");
    });
  }
  activateSettingsModule(panel, panel.dataset.settingsModule === "users" ? "users" : "appearance");
}

function enhance() {
  enhanceHome();
  document.querySelectorAll<HTMLElement>(".ordersPage").forEach(enhanceOrderCenter);
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(enhanceWorkspace);
  document.querySelectorAll<HTMLElement>(".themePanel").forEach(enhanceSettings);
}

export function SeikoOperationalUx() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, {
      observer: { childList: true, subtree: true, characterData: true },
    });
    const schedule = () => window.setTimeout(controller.schedule, 0);
    document.addEventListener("change", schedule, true);
    window.addEventListener("storage", schedule);
    window.addEventListener("seiko:orders-cache-updated", schedule as EventListener);
    return () => {
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("storage", schedule);
      window.removeEventListener("seiko:orders-cache-updated", schedule as EventListener);
      controller.stop();
    };
  }, []);
  return null;
}
