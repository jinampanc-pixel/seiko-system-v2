"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";
import { groupRuleMatches, quantityForRecord, type SeikoOrder } from "./lib/order-domain";

type SavedLabelTask = {
  orderId?: string;
  selectedRows?: string[];
};

let productHoverCloseTimer = 0;
let productHoverTarget: HTMLElement | null = null;

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
function cancelProductHoverClose(){if(productHoverCloseTimer){window.clearTimeout(productHoverCloseTimer);productHoverCloseTimer=0;}}
function removeProductHover(){cancelProductHoverClose();productHoverTarget=null;document.querySelector(".orderProductHoverCard")?.remove();}
function scheduleProductHoverClose(){cancelProductHoverClose();productHoverCloseTimer=window.setTimeout(()=>{productHoverCloseTimer=0;removeProductHover();},120);}
function showProductHover(target: HTMLElement, order: SeikoOrder){
  removeProductHover();productHoverTarget=target;
  const card=document.createElement("div");card.className="orderProductHoverCard";card.setAttribute("role","dialog");card.setAttribute("aria-label",`${order.details.orderNo} product summary`);
  const title=document.createElement("b");title.textContent=`${order.details.orderNo} products`;const body=document.createElement("div");orderProductSummary(order).forEach(line=>{const row=document.createElement("span");row.textContent=line;body.appendChild(row);});card.append(title,body);
  card.addEventListener("pointerenter",cancelProductHoverClose);card.addEventListener("pointerleave",scheduleProductHoverClose);card.addEventListener("focusin",cancelProductHoverClose);card.addEventListener("focusout",scheduleProductHoverClose);
  document.body.appendChild(card);const box=target.getBoundingClientRect(),measured=card.getBoundingClientRect();card.style.left=`${Math.max(8,Math.min(window.innerWidth-measured.width-8,box.left))}px`;card.style.top=`${Math.max(8,Math.min(window.innerHeight-measured.height-8,box.bottom+6))}px`;
}

function enhanceOrderCenter(page: HTMLElement) {
  if (productHoverTarget && !productHoverTarget.isConnected) removeProductHover();
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
      if (productHoverTarget && meta.contains(productHoverTarget)) removeProductHover();
      meta.dataset.signature = metaSignature;
      meta.replaceChildren();
      appendMetaItem(meta, "Client type", order.details.clientType || "—");
      appendMetaItem(meta, "Records", String(order.records.length));
      const productMeta = appendMetaItem(meta, "Products", String(order.products.filter(product => product.name.trim()).length));
      productMeta.classList.add("orderProductMeta"); productMeta.tabIndex = 0;
      productMeta.addEventListener("pointerenter",()=>{cancelProductHoverClose();showProductHover(productMeta,order);});
      productMeta.addEventListener("pointerleave",scheduleProductHoverClose);
      productMeta.addEventListener("focus",()=>{cancelProductHoverClose();showProductHover(productMeta,order);});
      productMeta.addEventListener("blur",scheduleProductHoverClose);
      appendMetaItem(meta, "Delivery", dueLabel(order));
    }

    if (row.dataset.rowOpenReady !== "true") {
      row.dataset.rowOpenReady = "true";
      const shouldOpen = (target: EventTarget | null) => !(target instanceof Element && target.closest("button,input,select,label,details,summary,a,.orderProductMeta,.orderProductHoverCard"));
      row.addEventListener("click", event => { if (shouldOpen(event.target)) { removeProductHover(); open.click(); } });
      row.addEventListener("keydown", event => {
        if ((event.key === "Enter" || event.key === " ") && event.target === row) {
          event.preventDefault();
          removeProductHover();
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
        removeProductHover();
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
  /* A hover card is body-mounted. Remove it explicitly when the source Order Center unmounts so it can never leak into Workspace. */
  removeProductHover();
  page.querySelector<HTMLElement>(".workspaceStatusControl")?.classList.add("workspaceHeaderSecondaryAction");
  page.querySelector<HTMLElement>(".workspaceQuickSave")?.classList.add("workspaceHeaderSecondaryAction");
  page.querySelector(".workspaceMenuOperational")?.remove();
}

function enhanceSettings() {
  // Settings is React-owned. Do not inject overlapping modules into the dialog.
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
    const outside = (event: Event) => { const target=event.target as Element|null; if(!target?.closest?.(".orderProductMeta,.orderProductHoverCard")) removeProductHover(); };
    const escape = (event: KeyboardEvent) => { if(event.key==="Escape") removeProductHover(); };
    const close = () => removeProductHover();
    document.addEventListener("change", schedule, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("storage", schedule);
    window.addEventListener("seiko:orders-cache-updated", schedule as EventListener);
    return () => {
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("storage", schedule);
      window.removeEventListener("seiko:orders-cache-updated", schedule as EventListener);
      removeProductHover();
      controller.stop();
    };
  }, []);
  return null;
}
