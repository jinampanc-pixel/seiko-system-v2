"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

type LabelPurpose = "production" | "packing" | "inventory";
const PRINT_PURPOSE_KEY = "jinam:labels:print-purpose";

function buttonByText(root: ParentNode, text: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === text);
}

function setReactSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensurePurposeOption(select: HTMLSelectElement, purpose: LabelPurpose, label: string) {
  if (Array.from(select.options).some(option => option.value === purpose)) return;
  const option = document.createElement("option");
  option.value = purpose;
  option.textContent = label;
  select.appendChild(option);
}

function selectedBusiness() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function currentWorkspaceOrderId(menu: HTMLElement) {
  const page = menu.closest<HTMLElement>(".workspacePage");
  const title = page?.querySelector<HTMLElement>(".workspaceHead h2")?.textContent?.trim() || "";
  const orderNo = title.split(" · ")[0]?.trim();
  if (!orderNo) return "";
  try {
    const orders = JSON.parse(localStorage.getItem(`jinam:${selectedBusiness()}:orders-v1`) || "[]") as Array<{ orderId?: string; details?: { orderNo?: string } }>;
    return orders.find(order => order.details?.orderNo === orderNo)?.orderId || "";
  } catch {
    return "";
  }
}

function openCreateTab(purpose?: LabelPurpose, orderId?: string) {
  const params = new URLSearchParams();
  params.set("business", selectedBusiness());
  if (purpose) params.set("purpose", purpose);
  if (orderId) params.set("order", orderId);
  window.open(`/labels/create?${params.toString()}`, "_blank");
}

function makePurposeGroup(title: string, action: "create" | "print", menu: HTMLElement, printButton: HTMLButtonElement) {
  const details = document.createElement("details");
  details.className = `orderLabelPurposeMenu orderLabelPurposeMenu-${action}`;
  const summary = document.createElement("summary");
  summary.textContent = title;
  const choices = document.createElement("div");
  choices.className = "orderLabelPurposeChoices";

  ([
    ["production", "Production"],
    ["packing", "Packing"],
    ["inventory", "Inventory"],
  ] as const).forEach(([purpose, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (action === "create") {
        openCreateTab(purpose, currentWorkspaceOrderId(menu));
      } else {
        sessionStorage.setItem(PRINT_PURPOSE_KEY, purpose);
        printButton.click();
      }
    });
    choices.appendChild(button);
  });

  details.append(summary, choices);
  return details;
}

function enhanceOrderMenu() {
  document.querySelectorAll<HTMLElement>(".workspacePage .orderActionMenu").forEach(menu => {
    if (menu.dataset.labelPurposeMenuReady === "true") return;

    const printButton = buttonByText(menu, "Print labels");
    const editButton = buttonByText(menu, "Edit setup");
    const sectionLabel = Array.from(menu.querySelectorAll<HTMLElement>(".orderMenuSectionLabel")).find(item => item.textContent?.trim() === "Create label");
    const purposeButtons = Array.from(menu.querySelectorAll<HTMLButtonElement>(".orderMenuIndented"));
    if (!printButton || !editButton || !sectionLabel || purposeButtons.length < 3) return;

    const dividers = Array.from(menu.querySelectorAll<HTMLElement>(".orderMenuDivider"));
    const firstDivider = dividers[0];
    const secondDivider = dividers[1];
    if (!firstDivider || !secondDivider) return;

    const createGroup = makePurposeGroup("Create labels", "create", menu, printButton);
    const printGroup = makePurposeGroup("Print labels", "print", menu, printButton);

    sectionLabel.hidden = true;
    printButton.hidden = true;
    purposeButtons.forEach(button => { button.hidden = true; });

    firstDivider.insertAdjacentElement("afterend", editButton);
    editButton.insertAdjacentElement("afterend", createGroup);
    createGroup.insertAdjacentElement("afterend", printGroup);
    printGroup.insertAdjacentElement("afterend", secondDivider);
    menu.dataset.labelPurposeMenuReady = "true";
  });
}

function labelPurposeName(value: string) {
  return value === "packing" ? "Packing" : value === "inventory" ? "Inventory" : "Production";
}

function enhanceLabelLauncher() {
  document.querySelectorAll<HTMLElement>(".labelLauncher").forEach(page => {
    const head = page.querySelector<HTMLElement>(".labelLauncherHead");
    const eyebrow = head?.querySelector<HTMLElement>(".eyebrow");
    const heading = head?.querySelector<HTMLElement>("h2");
    if (eyebrow) eyebrow.textContent = "LABEL CENTER";
    if (heading) heading.textContent = "Labels & printing";

    const orderCenter = head?.querySelector<HTMLButtonElement>("button.secondary");
    if (head && orderCenter) {
      orderCenter.textContent = "← Back to Orders";
      orderCenter.classList.add("contextBackButton");
      const title = head.firstElementChild as HTMLElement | null;
      if (title && orderCenter.parentElement !== title) title.prepend(orderCenter);
    }
    let headActions = head?.querySelector<HTMLElement>(".labelLauncherHeadActions");
    if (head && !headActions) {
      headActions = document.createElement("div");
      headActions.className = "labelLauncherHeadActions";
      head.appendChild(headActions);
    }
    if (headActions && !headActions.querySelector(".labelCreateNewTab")) {
      const create = document.createElement("button");
      create.type = "button";
      create.className = "primary labelCreateNewTab";
      create.textContent = "+ Create labels";
      create.title = "Open label creation in a new tab";
      create.addEventListener("click", () => openCreateTab());
      headActions.appendChild(create);
    }

    const library = page.querySelector<HTMLElement>(".labelBatchModule");
    const libraryHeading = library?.querySelector<HTMLElement>(".labelBatchModuleHead h3");
    if (libraryHeading) libraryHeading.textContent = "Saved labels";
    const libraryFilter = library?.querySelector<HTMLSelectElement>('select[aria-label="Filter label batches"]');
    if (libraryFilter) {
      ensurePurposeOption(libraryFilter, "inventory", "Inventory");
      const all = Array.from(libraryFilter.options).find(option => option.value === "all");
      if (all) all.textContent = "All labels";
    }
    const librarySearch = library?.querySelector<HTMLInputElement>('input[aria-label="Find a saved label batch"]');
    if (librarySearch) librarySearch.placeholder = "Find saved label, order or client";
    library?.querySelectorAll<HTMLElement>(".emptyLibrary").forEach(empty => {
      const text = empty.textContent?.trim();
      if (text === "No saved batches yet.") empty.textContent = "No saved labels yet.";
      if (text === "No matching batches.") empty.textContent = "No matching saved labels.";
    });

    const createPanel = page.querySelector<HTMLElement>(".labelOrderPicker");
    if (createPanel) createPanel.hidden = true;
    page.querySelector(".labelCreateToggle")?.remove();

    const storedPurpose = sessionStorage.getItem(PRINT_PURPOSE_KEY) as LabelPurpose | null;
    if (storedPurpose && libraryFilter && page.dataset.printPurposeApplied !== storedPurpose) {
      ensurePurposeOption(libraryFilter, storedPurpose, labelPurposeName(storedPurpose));
      setReactSelectValue(libraryFilter, storedPurpose);
      page.dataset.printPurposeApplied = storedPurpose;
      sessionStorage.removeItem(PRINT_PURPOSE_KEY);
      const filterNote = document.createElement("div");
      filterNote.className = "labelPurposeFilterNote";
      filterNote.textContent = `Showing ${labelPurposeName(storedPurpose).toLowerCase()} labels for this order.`;
      library?.querySelector(".labelBatchModuleHead")?.insertAdjacentElement("afterend", filterNote);
    }
  });
}

function enhance() {
  enhanceOrderMenu();
  enhanceLabelLauncher();
}

export function LabelFlowPolish() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance);
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
    };
  }, []);
  return null;
}
