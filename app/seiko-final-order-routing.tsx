"use client";

import { useEffect } from "react";
import type { SeikoOrder } from "./lib/order-domain";

const SETUP_ORIGIN_KEY = "jinam:seiko:order-setup-origin";

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

function orderRow(orderNo: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".ordersPage .orderRow"))
    .find(row => row.querySelector<HTMLElement>(":scope > div:first-child > b")?.textContent?.trim() === orderNo) || null;
}

function clickOrdersModule() {
  const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const orders = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .moduleMenu .nav"))
      .find(button => button.querySelector("small")?.textContent?.trim() === "Orders");
    orders?.click();
  }, 0);
}

function waitFor<T extends Element>(find: () => T | null, action: (node: T) => void, attempts = 100) {
  const node = find();
  if (node) { action(node); return; }
  if (attempts > 0) window.setTimeout(() => waitFor(find, action, attempts - 1), 35);
}

function openWorkspace(orderNo: string) {
  clickOrdersModule();
  waitFor(() => orderRow(orderNo), row => row.querySelector<HTMLButtonElement>(".openOrderButton")?.click());
}

function openSetup(orderNo: string) {
  clickOrdersModule();
  waitFor(() => orderRow(orderNo), row => {
    const invoke = () => {
      const menu = row.querySelector<HTMLDetailsElement>(".orderCenterActionMenu,.seikoRowActionMenu");
      const edit = Array.from(row.querySelectorAll<HTMLButtonElement>(".seikoRowActionPanel button,button"))
        .find(button => button.textContent?.trim() === "Edit setup");
      if (edit) {
        sessionStorage.setItem(SETUP_ORIGIN_KEY, "center");
        if (menu) menu.open = true;
        edit.click();
        return;
      }
      const open = row.querySelector<HTMLButtonElement>(".openOrderButton");
      if (!open) return;
      open.click();
      waitFor(
        () => Array.from(document.querySelectorAll<HTMLButtonElement>(".workspacePage .orderActionMenu button"))
          .find(button => button.textContent?.trim() === "Edit setup") || null,
        button => {
          sessionStorage.setItem(SETUP_ORIGIN_KEY, "center");
          button.click();
        },
      );
    };
    window.setTimeout(invoke, 0);
  });
}

function openLabels(orderNo: string) {
  const order = readOrders().find(item => item.details.orderNo === orderNo);
  if (order?.orderId) {
    window.location.assign(`/labels/create?business=${encodeURIComponent(currentBusiness())}&order=${encodeURIComponent(order.orderId)}`);
    return;
  }
  clickOrdersModule();
  waitFor(() => orderRow(orderNo), row => {
    const menu = row.querySelector<HTMLDetailsElement>(".orderCenterActionMenu,.seikoRowActionMenu");
    if (menu) menu.open = true;
    waitFor(
      () => Array.from(row.querySelectorAll<HTMLButtonElement>(".seikoRowActionPanel button,button"))
        .find(button => ["Create labels", "Labels"].includes(button.textContent?.trim() || "")) || null,
      button => button.click(),
    );
  });
}

export function SeikoFinalOrderRouting() {
  useEffect(() => {
    const capture = (event: MouseEvent) => {
      const destination = (event.target as Element | null)?.closest<HTMLButtonElement>(".finalOrderChooserLayer [data-action]");
      if (!destination) return;
      const layer = destination.closest<HTMLElement>(".finalOrderChooserLayer");
      const orderNo = layer?.querySelector<HTMLElement>(".finalOrderChooser .eyebrow")?.textContent?.trim() || "";
      const action = destination.dataset.action;
      if (!orderNo || !["setup", "workspace", "labels"].includes(action || "")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      layer?.remove();
      if (action === "setup") openSetup(orderNo);
      else if (action === "workspace") openWorkspace(orderNo);
      else openLabels(orderNo);
    };
    document.addEventListener("click", capture, true);
    return () => document.removeEventListener("click", capture, true);
  }, []);
  return null;
}
