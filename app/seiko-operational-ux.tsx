"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";
import type { SeikoOrder } from "./lib/order-domain";

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

function openSeikoModule(label: string) {
  const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const target = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .moduleMenu .nav"))
      .find(button => button.querySelector("small")?.textContent?.trim() === label);
    target?.click();
  }, 0);
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
  if (!date) return "No delivery date";
  const due = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const display = due.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (days < 0) return `${display} · ${Math.abs(days)}d overdue`;
  if (days === 0) return `${display} · due today`;
  if (days <= 7) return `${display} · ${days}d`;
  return display;
}

function enhanceHome() {
  const dashboard = document.querySelector<HTMLElement>(".seikoOperationalDashboard");
  if (!dashboard) return;

  dashboard.querySelectorAll<HTMLElement>(".seikoMetricCard").forEach(card => {
    const label = card.querySelector("small")?.textContent?.trim() || "";
    card.classList.toggle("homeMetricRedundant", /PERSON \/ RECORD ENTRIES/i.test(label));
  });

  document.querySelectorAll<HTMLElement>(".overview .moduleGrid .moduleCard").forEach(card => {
    const title = card.querySelector("h3")?.textContent?.trim() || "";
    card.classList.toggle("homeQuickAccessDuplicate", title === "Orders");
  });

  const activity = dashboard.querySelector<HTMLElement>(".seikoDashboardActivity");
  if (!activity) return;
  activity.classList.add("operationalHomeOrders");
  const head = activity.querySelector<HTMLElement>(".seikoDashboardActivityHead > div:first-child");
  const heading = head?.querySelector("b");
  const copy = head?.querySelector("p");
  if (heading) heading.textContent = "Active work";
  if (copy) copy.textContent = "Open orders with delivery, products, record count and status in one place.";

  const activityHead = activity.querySelector<HTMLElement>(".seikoDashboardActivityHead");
  if (activityHead && !activityHead.querySelector(".homeOrderCenterButton")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary homeOrderCenterButton";
    button.textContent = "Order Center →";
    button.addEventListener("click", () => openSeikoModule("Orders"));
    activityHead.appendChild(button);
  }

  const orders = readOrders();
  const byNumber = new Map(orders.map(order => [order.details.orderNo, order]));
  activity.querySelectorAll<HTMLElement>(".seikoDashboardActivityRow").forEach(row => {
    const orderNo = row.querySelector("strong")?.textContent?.trim() || "";
    const order = byNumber.get(orderNo);
    if (!order) return;
    row.classList.add("homeOrderOperationalRow");
    let meta = row.querySelector<HTMLElement>(".homeOrderOperationalMeta");
    if (!meta) {
      meta = document.createElement("span");
      meta.className = "homeOrderOperationalMeta";
      row.appendChild(meta);
    }
    meta.replaceChildren();
    const parts = [
      ["Records", String(order.records.length)],
      ["Products", String(order.products.filter(product => product.name.trim()).length)],
      ["Delivery", dueLabel(order)],
      ["Status", order.status],
    ];
    parts.forEach(([label, value]) => {
      const item = document.createElement("span");
      const small = document.createElement("small");
      small.textContent = label;
      const strong = document.createElement("b");
      strong.textContent = value;
      item.append(small, strong);
      meta!.appendChild(item);
    });
  });
}

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
    row.classList.add("orderRowClickable");
    row.tabIndex = 0;
    row.setAttribute("aria-label", `Open order ${order.details.orderNo} for ${order.details.clientName || "client"}`);

    const detail = row.querySelector<HTMLElement>(":scope > div:first-child");
    let badge = detail?.querySelector<HTMLElement>(".orderCenterStatusBadge");
    if (detail && !badge) {
      badge = document.createElement("span");
      badge.className = "orderCenterStatusBadge";
      detail.appendChild(badge);
    }
    if (badge) badge.textContent = order.status;

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
  const statusWrap = page.querySelector<HTMLElement>(".workspaceStatusControl");
  const nativeStatus = statusWrap?.querySelector<HTMLSelectElement>("select");
  const nativeSave = page.querySelector<HTMLButtonElement>(".workspaceQuickSave");
  const menu = page.querySelector<HTMLElement>(".orderActionMenu");
  if (!statusWrap || !nativeStatus || !nativeSave) return;
  statusWrap.classList.add("workspaceHeaderSecondaryAction");
  nativeSave.classList.add("workspaceHeaderSecondaryAction");

  const trigger = page.querySelector<HTMLButtonElement>(".orderActionMenuButton");
  if (trigger) trigger.title = `Order actions · ${nativeStatus.value}`;
  if (!menu) return;

  let operational = menu.querySelector<HTMLElement>(".workspaceMenuOperational");
  if (!operational) {
    operational = document.createElement("section");
    operational.className = "workspaceMenuOperational";
    const status = document.createElement("label");
    status.innerHTML = "<span>Status</span>";
    const select = nativeStatus.cloneNode(true) as HTMLSelectElement;
    select.removeAttribute("class");
    select.addEventListener("change", () => setNativeSelect(nativeStatus, select.value));
    status.appendChild(select);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "workspaceMenuSaveNow";
    save.textContent = "Save now";
    save.addEventListener("click", () => nativeSave.click());
    operational.append(status, save);
    menu.prepend(operational);
  }
  const menuStatus = operational.querySelector<HTMLSelectElement>("select");
  if (menuStatus) menuStatus.value = nativeStatus.value;
}

function activateSettingsModule(panel: HTMLElement, module: "appearance" | "users") {
  panel.dataset.settingsModule = module;
  panel.querySelectorAll<HTMLButtonElement>(".settingsModuleNav button").forEach(button => {
    const active = button.dataset.module === module;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  panel.querySelectorAll<HTMLElement>(".settingsAppearanceModule").forEach(item => { item.hidden = module !== "appearance"; });
  const users = panel.querySelector<HTMLElement>(".settingsUsersModule");
  if (users) users.hidden = module !== "users";
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
