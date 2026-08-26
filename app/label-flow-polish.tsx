"use client";

import { useEffect } from "react";

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

function makePurposeGroup(title: string, action: "create" | "print", menu: HTMLElement, createButtons: Map<LabelPurpose, HTMLButtonElement>, printButton: HTMLButtonElement) {
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
        createButtons.get(purpose)?.click();
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

    const createButtons = new Map<LabelPurpose, HTMLButtonElement>();
    purposeButtons.forEach(button => {
      const text = button.textContent?.trim().toLowerCase();
      if (text === "production" || text === "packing" || text === "inventory") createButtons.set(text, button);
    });
    if (createButtons.size < 3) return;

    const dividers = Array.from(menu.querySelectorAll<HTMLElement>(".orderMenuDivider"));
    const firstDivider = dividers[0];
    const secondDivider = dividers[1];
    if (!firstDivider || !secondDivider) return;

    const createGroup = makePurposeGroup("Create labels", "create", menu, createButtons, printButton);
    const printGroup = makePurposeGroup("Print labels", "print", menu, createButtons, printButton);

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
    if (!createPanel) return;
    const createHeading = createPanel.querySelector<HTMLElement>(".labelOrderPickerHead h3");
    const createNote = createPanel.querySelector<HTMLElement>(".labelOrderPickerHead small");
    if (createHeading) createHeading.textContent = "Create labels";
    if (createNote) createNote.textContent = "Choose the source and purpose, then continue to label design.";

    const purposeSelect = createPanel.querySelector<HTMLSelectElement>('select[aria-label="Label use"]');
    if (purposeSelect) ensurePurposeOption(purposeSelect, "inventory", "Inventory");
    createPanel.querySelectorAll<HTMLButtonElement>(".orderLabelActions button").forEach(button => {
      if (button.textContent?.includes("Create label batch")) button.textContent = "Create labels";
    });

    if (!page.querySelector(".labelCreateToggle")) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "primary labelCreateToggle";
      toggle.textContent = "+ Create labels";
      createPanel.classList.add("labelCreatePanelCollapsed");
      toggle.addEventListener("click", () => {
        const collapsed = createPanel.classList.toggle("labelCreatePanelCollapsed");
        toggle.textContent = collapsed ? "+ Create labels" : "Close label creation";
        if (!collapsed) createPanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      library?.insertAdjacentElement("afterend", toggle);
    }

    const storedPurpose = sessionStorage.getItem(PRINT_PURPOSE_KEY) as LabelPurpose | null;
    if (storedPurpose && libraryFilter && page.dataset.printPurposeApplied !== storedPurpose) {
      ensurePurposeOption(libraryFilter, storedPurpose, labelPurposeName(storedPurpose));
      setReactSelectValue(libraryFilter, storedPurpose);
      if (purposeSelect) {
        ensurePurposeOption(purposeSelect, storedPurpose, labelPurposeName(storedPurpose));
        setReactSelectValue(purposeSelect, storedPurpose);
      }
      page.dataset.printPurposeApplied = storedPurpose;
      sessionStorage.removeItem(PRINT_PURPOSE_KEY);
      const filterNote = document.createElement("div");
      filterNote.className = "labelPurposeFilterNote";
      filterNote.textContent = `Showing ${labelPurposeName(storedPurpose).toLowerCase()} labels for this order.`;
      library?.querySelector(".labelBatchModuleHead")?.insertAdjacentElement("afterend", filterNote);
    }

    if (purposeSelect?.value === "inventory") {
      let note = createPanel.querySelector<HTMLElement>(".inventoryLabelSourceNote");
      if (!note) {
        note = document.createElement("div");
        note.className = "inventoryLabelSourceNote";
        createPanel.querySelector(".labelOrderPickerHead")?.insertAdjacentElement("afterend", note);
      }
      note.innerHTML = "<b>Inventory labels</b><span>Order-linked stock is internally manufactured. Ready-made purchased stock enters through Inventory, then uses the same stock, label, sales and traceability system.</span>";
    } else {
      createPanel.querySelector(".inventoryLabelSourceNote")?.remove();
    }
  });
}

export function LabelFlowPolish() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      frame = 0;
      enhanceOrderMenu();
      enhanceLabelLauncher();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(enhance);
    };
    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
