"use client";

import { useEffect } from "react";

function sourceMode() {
  return document.querySelector<HTMLElement>(".labelCreateApp")?.dataset.labelSource || "";
}

function buttonByText(root: ParentNode, text: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === text);
}

function dispatchSelect(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function tidyTopActions(page: HTMLElement) {
  const back = Array.from(page.querySelectorAll<HTMLButtonElement>(".labelTopbar button.secondary"))
    .find(item => item.textContent?.includes("Back to order") || item.textContent?.includes("Back to setup"));
  if (back) back.textContent = "← Back to setup";

  const print = Array.from(page.querySelectorAll<HTMLButtonElement>(".labelTopbar button.primary"))
    .find(item => item.textContent?.includes("Print"));
  if (print) {
    const count = print.textContent?.match(/(\d+)\s*$/)?.[1] || "";
    print.textContent = count ? `Print · ${count}` : "Print";
    print.title = "Print the selected labels. Your browser print dialog can also save them as PDF.";
  }

  const saveBar = page.querySelector<HTMLElement>(".labelSaveBar");
  if (!saveBar) return;
  Array.from(saveBar.querySelectorAll<HTMLButtonElement>("button")).forEach(button => {
    const text = button.textContent?.trim() || "";
    if (text.startsWith("Save batch")) button.textContent = "Save label set";
    if (text.startsWith("Update batch")) button.textContent = "Update label set";
    if (text.startsWith("Batches")) button.childNodes[0].textContent = "Saved sets ";
    if (text.startsWith("Layouts")) button.childNodes[0].textContent = "Saved layouts ";
  });
  if (!saveBar.nextElementSibling?.classList.contains("labelSaveMeaning")) {
    const note = document.createElement("p");
    note.className = "labelSaveMeaning";
    note.innerHTML = "<b>Layout</b> = reusable design, information and size. <b>Label set</b> = this order's selected records saved for reprint.";
    saveBar.insertAdjacentElement("afterend", note);
  }

  page.querySelectorAll<HTMLElement>(".compactLibrary").forEach(library => {
    const eyebrow = library.querySelector<HTMLElement>(".eyebrow");
    const heading = library.querySelector<HTMLElement>("h3");
    const empty = library.querySelector<HTMLElement>(".emptyLibrary");
    if (eyebrow?.textContent?.includes("BATCH")) eyebrow.textContent = "SAVED LABEL SETS";
    if (heading?.textContent?.includes("batches")) heading.textContent = "Saved label sets for this order";
    if (empty?.textContent?.includes("batches")) empty.textContent = "No saved label sets yet. Select the labels you need, then choose Save label set.";
  });
  page.querySelectorAll<HTMLElement>(".labelSaveNotice").forEach(notice => {
    notice.textContent = notice.textContent?.replace(/Batch/gi, "Label set") || "";
  });
}

function forceInteractiveCanvas(page: HTMLElement) {
  if (page.dataset.manualCanvasReady === "true") return;
  const toggle = Array.from(page.querySelectorAll<HTMLButtonElement>(".simpleDesignerHead button.secondary"))
    .find(button => /Advanced layout|Use simple setup/i.test(button.textContent || ""));
  if (!toggle) return;
  page.dataset.manualCanvasReady = "true";
  if (/Advanced layout/i.test(toggle.textContent || "")) toggle.click();
  toggle.hidden = true;
}

function groupForLabel(label: string) {
  if (label.startsWith("Person detail ·")) return "Person details";
  if (label.includes(" · ")) return `Product details · ${label.split(" · ")[0]}`;
  return "Core information";
}

function organizeInformation(page: HTMLElement) {
  const section = page.querySelector<HTMLElement>(".simpleDesigner");
  const checklist = section?.querySelector<HTMLElement>(".fieldChecklist");
  if (!section || !checklist) return;

  if (section.dataset.compactReady !== "true") {
    section.dataset.compactReady = "true";
    section.classList.add("labelInfoCollapsed");
    const heading = section.querySelector<HTMLElement>(".simpleDesignerHead h3");
    const note = section.querySelector<HTMLElement>(".simpleDesignerHead small");
    if (heading) heading.textContent = "Label information";
    if (note) note.textContent = "Choose only the details that need to appear on this label.";

    const chosenCount = () => checklist.querySelectorAll<HTMLInputElement>(':scope > .fieldChoice input[type="checkbox"]:checked').length;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary labelInfoToggle";
    toggle.textContent = `Choose information · ${chosenCount()} selected`;
    toggle.addEventListener("click", () => {
      const collapsed = section.classList.toggle("labelInfoCollapsed");
      toggle.textContent = collapsed ? `Choose information · ${chosenCount()} selected` : "Done";
    });
    section.querySelector(".simpleDesignerHead")?.appendChild(toggle);

    const tools = document.createElement("div");
    tools.className = "labelInfoTools";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Find information…";
    search.setAttribute("aria-label", "Find label information");
    tools.appendChild(search);
    checklist.insertAdjacentElement("beforebegin", tools);
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      checklist.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => {
        const text = choice.querySelector("label span")?.textContent?.toLowerCase() || "";
        choice.hidden = !!query && !text.includes(query);
      });
      refreshFieldHeadings(checklist);
    });
    section.addEventListener("change", () => {
      if (section.classList.contains("labelInfoCollapsed")) toggle.textContent = `Choose information · ${chosenCount()} selected`;
    });
  }

  checklist.querySelectorAll(".fieldGroupHeading").forEach(node => node.remove());
  let lastGroup = "";
  checklist.querySelectorAll<HTMLElement>(":scope > .fieldChoice").forEach(choice => {
    const label = choice.querySelector("label span")?.textContent?.trim() || "Other";
    const group = groupForLabel(label);
    choice.dataset.infoGroup = group;
    if (group !== lastGroup) {
      const heading = document.createElement("div");
      heading.className = "fieldGroupHeading";
      heading.dataset.infoGroup = group;
      heading.textContent = group;
      checklist.insertBefore(heading, choice);
      lastGroup = group;
    }
    if (choice.classList.contains("chosen") && !choice.querySelector(".fieldChoiceOptionsToggle")) {
      const options = document.createElement("button");
      options.type = "button";
      options.className = "fieldChoiceOptionsToggle";
      options.textContent = "Options";
      options.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        choice.classList.toggle("fieldChoiceExpanded");
      });
      choice.appendChild(options);
    }
  });
  refreshFieldHeadings(checklist);
}

function refreshFieldHeadings(checklist: HTMLElement) {
  checklist.querySelectorAll<HTMLElement>(".fieldGroupHeading").forEach(heading => {
    const group = heading.dataset.infoGroup;
    const visible = Array.from(checklist.querySelectorAll<HTMLElement>(`.fieldChoice[data-info-group="${CSS.escape(group || "")}"]`)).some(choice => !choice.hidden);
    heading.hidden = !visible;
  });
}

function reorderSections(page: HTMLElement) {
  const stack = page.querySelector<HTMLElement>(".labelControlStack");
  const setup = page.querySelector<HTMLElement>(".labelSetup");
  const info = page.querySelector<HTMLElement>(".simpleDesigner");
  const grid = page.querySelector<HTMLElement>(".labelDesignerGrid");
  if (stack && setup && info && setup.nextElementSibling !== info) stack.insertBefore(setup, info);
  if (info && grid && info.nextElementSibling !== grid) info.insertAdjacentElement("afterend", grid);
  grid?.classList.add("labelSelectionPreviewGrid");
  grid?.querySelector<HTMLElement>(".labelCanvasPanel")?.classList.add("labelCanvasPrimary");
}

function addInlineButton(host: HTMLElement, className: string, label: string, onClick: () => void) {
  let button = host.querySelector<HTMLButtonElement>(`.${className}`);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = `labelInlineAction ${className}`;
    host.appendChild(button);
    button.addEventListener("click", event => {
      event.preventDefault();
      onClick();
    });
  }
  button.textContent = label;
  return button;
}

function manageSetupDrawers(page: HTMLElement) {
  const setup = page.querySelector<HTMLElement>(".labelSetup");
  if (!setup) return;
  const labels = Array.from(setup.querySelectorAll<HTMLLabelElement>(":scope > label"));
  const identityLabel = labels[0];
  const sizeLabel = labels.find(label => label.querySelector(":scope > span")?.textContent?.trim() === "Label size");

  const personPlan = page.querySelector<HTMLElement>(".personPackageSetup");
  const groupPlan = page.querySelector<HTMLElement>(".packageGrouping");
  const contextPlan = personPlan || groupPlan;
  if (identityLabel) {
    identityLabel.querySelector(".labelContextSettings")?.remove();
    if (contextPlan) {
      const wrap = document.createElement("span");
      wrap.className = "labelInlineActions labelContextSettings";
      identityLabel.appendChild(wrap);
      const name = personPlan ? "Package settings" : "Grouping settings";
      addInlineButton(wrap, "labelContextSettingsButton", name, () => {
        contextPlan.classList.toggle("labelInlineConfiguratorOpen");
      });
      contextPlan.classList.add("labelInlineConfigurator");
      if (setup.nextElementSibling !== contextPlan && contextPlan.classList.contains("labelInlineConfiguratorOpen")) setup.insertAdjacentElement("afterend", contextPlan);
    }
  }

  if (sizeLabel) {
    let actions = sizeLabel.querySelector<HTMLElement>(".labelSizeActions");
    if (!actions) {
      actions = document.createElement("span");
      actions.className = "labelInlineActions labelSizeActions";
      sizeLabel.appendChild(actions);
      addInlineButton(actions, "labelAddSize", "+ New size", () => {
        page.querySelector<HTMLButtonElement>(".canvasSizeButton")?.click();
      });
      addInlineButton(actions, "labelRemoveSize", "Remove", () => {
        page.querySelector<HTMLButtonElement>('.labelSetup .iconButton[aria-label="Remove selected size preset"]')?.click();
      });
    }
    const remove = actions.querySelector<HTMLButtonElement>(".labelRemoveSize");
    if (remove) remove.disabled = !page.querySelector('.labelSetup .iconButton[aria-label="Remove selected size preset"]');
  }

  const sizeForm = page.querySelector<HTMLElement>(".customSize");
  if (sizeForm) {
    sizeForm.classList.add("labelInlineConfigurator", "labelInlineConfiguratorOpen", "labelSizeConfigurator");
    if (setup.nextElementSibling !== sizeForm) setup.insertAdjacentElement("afterend", sizeForm);
  }
}

function hideDuplicateSizeButton(page: HTMLElement) {
  const button = page.querySelector<HTMLButtonElement>(".canvasSizeButton");
  if (button) button.hidden = true;
}

function addCanvasResizeControls(page: HTMLElement) {
  const toolbar = page.querySelector<HTMLElement>(".canvasToolbar");
  if (!toolbar || toolbar.querySelector(".canvasElementResizeControls")) return;
  const controls = document.createElement("div");
  controls.className = "canvasElementResizeControls";
  controls.innerHTML = '<span>Selected element size</span><button type="button" aria-label="Make selected element smaller">−</button><button type="button" aria-label="Make selected element larger">+</button>';
  const [minus, plus] = Array.from(controls.querySelectorAll<HTMLButtonElement>("button"));
  const resize = (larger: boolean) => {
    const selected = page.querySelector<HTMLElement>(".canvasElement.selected");
    if (!selected) return;
    selected.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: larger ? -100 : 100 }));
  };
  minus.addEventListener("click", () => resize(false));
  plus.addEventListener("click", () => resize(true));
  toolbar.appendChild(controls);
}

function tidyRecordLabels(page: HTMLElement) {
  const mode = sourceMode();
  const sidebarHeading = page.querySelector<HTMLElement>(".labelSidebar .panelHead h3");
  const eyebrow = page.querySelector<HTMLElement>(".labelSidebar .panelHead .eyebrow");
  if (eyebrow) eyebrow.textContent = "LABELS TO PRINT";
  page.querySelectorAll<HTMLElement>(".recordList .record").forEach(record => {
    const title = record.querySelector<HTMLElement>("b");
    const meta = record.querySelector<HTMLElement>("small");
    if (!title) return;
    const raw = title.textContent?.trim() || "";
    const parts = raw.split(" — ").map(part => part.trim()).filter(Boolean);
    if (mode === "product" && parts.length >= 2 && parts[0] === parts[1]) title.textContent = parts[0];
    else if (mode === "person" && parts.length >= 2) title.textContent = parts[0];
    else if (mode === "order") title.textContent = parts[0] || "Whole order";
    if (mode === "product" && meta?.textContent?.startsWith("Product total")) meta.textContent = meta.textContent.replace(/^Product total\s*·?\s*/, "");
  });
  if (sidebarHeading && mode === "order") sidebarHeading.dataset.identityMode = "order";
}

function enhancePage(page: HTMLElement) {
  tidyTopActions(page);
  forceInteractiveCanvas(page);
  reorderSections(page);
  organizeInformation(page);
  manageSetupDrawers(page);
  hideDuplicateSizeButton(page);
  addCanvasResizeControls(page);
  tidyRecordLabels(page);
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(enhancePage);
}

export function LabelDesignerPolish() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };
    const wheelFallback = (event: WheelEvent) => {
      if (!event.isTrusted) return;
      const target = event.target as Element | null;
      const canvas = target?.closest?.(".labelCanvas");
      if (!canvas) return;
      const page = canvas.closest<HTMLElement>(".labelDesignerPage");
      const selected = page?.querySelector<HTMLElement>(".canvasElement.selected");
      if (!selected || target?.closest?.(".canvasElement.selected")) return;
      event.preventDefault();
      selected.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: event.deltaY }));
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("wheel", wheelFallback, { capture: true, passive: false });
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("wheel", wheelFallback, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
