"use client";

import { useEffect } from "react";

function sourceMode() {
  return document.querySelector<HTMLElement>(".labelCreateApp")?.dataset.labelSource || "";
}

function tidyTopActions(page: HTMLElement) {
  const back = Array.from(page.querySelectorAll<HTMLButtonElement>(".labelTopbar button.secondary"))
    .find(item => item.textContent?.includes("Back to order") || item.textContent?.includes("Back to setup"));
  if (back) back.textContent = "← Back to setup";

  const print = Array.from(page.querySelectorAll<HTMLButtonElement>(".labelTopbar button.primary"))
    .find(item => item.textContent?.includes("Print"));
  if (print) {
    print.textContent = "Print";
    print.title = "Print the selected labels. Your browser print dialog can also save them as PDF.";
  }

  const saveBar = page.querySelector<HTMLElement>(".labelSaveBar");
  let meaning = page.querySelector<HTMLElement>(".labelSaveMeaning");
  if (saveBar && !meaning) {
    meaning = document.createElement("p");
    meaning.className = "labelSaveMeaning";
    meaning.innerHTML = "<b>Layout</b> saves the reusable physical design, size, components and placement. <b>Label set</b> saves this order's selected records for repeat printing.";
    saveBar.insertAdjacentElement("afterend", meaning);
  }
  if (saveBar) {
    Array.from(saveBar.querySelectorAll<HTMLButtonElement>("button")).forEach(button => {
      const text = button.textContent?.trim() || "";
      if (text.startsWith("Save batch")) { button.textContent = "Save label set"; button.classList.remove("textButton"); button.classList.add("primary", "labelSetSave"); }
      if (text.startsWith("Update batch")) { button.textContent = "Update label set"; button.classList.remove("textButton"); button.classList.add("primary", "labelSetSave"); }
      if (text.startsWith("Batches")) button.childNodes[0].textContent = "Saved sets ";
      if (text.startsWith("Layouts")) button.childNodes[0].textContent = "Layout Library ";
    });
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
  toggle.hidden = false;
}

function groupForLabel(label: string) {
  if (label.startsWith("Person detail ·")) return "Person details";
  if (label.includes(" · ")) return `Product details · ${label.split(" · ")[0]}`;
  return "Core information";
}

function refreshFieldHeadings(checklist: HTMLElement) {
  checklist.querySelectorAll<HTMLElement>(".fieldGroupHeading").forEach(heading => {
    const group = heading.dataset.infoGroup;
    const visible = Array.from(checklist.querySelectorAll<HTMLElement>(`.fieldChoice[data-info-group="${CSS.escape(group || "")}"]`)).some(choice => !choice.hidden);
    heading.hidden = !visible;
  });
}

function renameShowFieldControl(choice: HTMLElement) {
  const showName = choice.querySelector<HTMLLabelElement>(".showName");
  if (!showName) return;
  Array.from(showName.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && /Show name/i.test(node.textContent || "")) node.textContent = " Show field name";
  });
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
    if (note) note.textContent = "Choose the details that should appear on this label.";

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

    const selectedStrip = document.createElement("div");
    selectedStrip.className = "labelInfoSelectedStrip";
    section.querySelector(".simpleDesignerHead")?.insertAdjacentElement("afterend", selectedStrip);

    const tools = document.createElement("div");
    tools.className = "labelInfoTools";
    const searchToggle = document.createElement("button");
    searchToggle.type = "button";
    searchToggle.className = "labelInfoSearchToggle";
    searchToggle.setAttribute("aria-label", "Search label information");
    searchToggle.textContent = "⌕";
    const search = document.createElement("input");
    search.type = "search";
    search.hidden = true;
    search.placeholder = "Search fields…";
    search.setAttribute("aria-label", "Find label information");
    tools.append(searchToggle, search);
    checklist.insertAdjacentElement("beforebegin", tools);
    searchToggle.addEventListener("click", () => {
      search.hidden = !search.hidden;
      searchToggle.classList.toggle("active", !search.hidden);
      if (!search.hidden) search.focus();
      else { search.value = ""; search.dispatchEvent(new Event("input")); }
    });
    search.addEventListener("keydown", event => {
      if (event.key === "Escape") { search.hidden = true; searchToggle.classList.remove("active"); search.value = ""; search.dispatchEvent(new Event("input")); searchToggle.focus(); }
    });
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      checklist.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => {
        const text = choice.querySelector("label span")?.textContent?.toLowerCase() || "";
        choice.hidden = !!query && !text.includes(query);
      });
      refreshFieldHeadings(checklist);
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

    /* Selected fields always expose their compact styling controls. The old Options
       button created a hidden dependency where controls existed but were not visible. */
    choice.querySelector(".fieldChoiceOptionsToggle")?.remove();
    if (choice.classList.contains("chosen")) {
      choice.classList.add("fieldChoiceExpanded");
      renameShowFieldControl(choice);
    } else {
      choice.classList.remove("fieldChoiceExpanded");
    }
  });
  refreshFieldHeadings(checklist);

  const selectedStrip = section.querySelector<HTMLElement>(".labelInfoSelectedStrip");
  if (selectedStrip) {
    selectedStrip.replaceChildren();
    const selectedChoices = Array.from(checklist.querySelectorAll<HTMLElement>(".fieldChoice.chosen"));
    selectedChoices.forEach(choice => {
      const label = choice.querySelector("label span")?.textContent?.trim();
      if (!label) return;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "labelInfoChip";
      chip.title = `Edit ${label}`;
      const text = document.createElement("span");
      text.className = "labelInfoChipText";
      text.textContent = label;
      const remove = document.createElement("span");
      remove.className = "labelInfoChipRemove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const checkbox = choice.querySelector<HTMLInputElement>(':scope > label:first-child input[type="checkbox"]');
        checkbox?.click();
      });
      chip.append(text, remove);
      chip.addEventListener("click", () => {
        section.classList.remove("labelInfoCollapsed");
        const toggle = section.querySelector<HTMLButtonElement>(".labelInfoToggle");
        if (toggle) toggle.textContent = "Done";
        choice.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      selectedStrip.appendChild(chip);
    });
  }

  const toggle = section.querySelector<HTMLButtonElement>(".labelInfoToggle");
  if (toggle && section.classList.contains("labelInfoCollapsed")) {
    const count = checklist.querySelectorAll<HTMLInputElement>(':scope > .fieldChoice input[type="checkbox"]:checked').length;
    toggle.textContent = `Choose information · ${count} selected`;
  }
}

function reorderSections(page: HTMLElement) {
  const stack = page.querySelector<HTMLElement>(".labelControlStack");
  const setup = page.querySelector<HTMLElement>(".labelSetup");
  const info = page.querySelector<HTMLElement>(".simpleDesigner");
  const grid = page.querySelector<HTMLElement>(".labelDesignerGrid");
  if (stack && setup && stack.firstElementChild !== setup) stack.insertBefore(setup, stack.firstElementChild);
  if (stack && info && setup && setup.nextElementSibling !== info) stack.insertBefore(info, setup.nextElementSibling);
  grid?.classList.add("labelSelectionPreviewGrid");
  const canvas = grid?.querySelector<HTMLElement>(".labelCanvasPanel");
  canvas?.classList.add("labelCanvasPrimary");

  grid?.querySelector<HTMLElement>(":scope > .labelProperties")?.classList.add("labelContextInspector");
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

}

function cleanCanvasChrome(page: HTMLElement) {
  page.querySelector(".canvasElementResizeControls")?.remove();
  const button = page.querySelector<HTMLButtonElement>(".canvasSizeButton");
  if (button && !button.classList.contains("labelFinalSizeManage")) button.hidden = true;
  const hint = page.querySelector<HTMLElement>(".canvasToolbar span");
  if (hint) hint.textContent = "Drag to move. Use the mouse wheel to resize. Arrow keys nudge; Shift + Arrow moves 1 mm.";
}

function tidyRecordLabels(page: HTMLElement) {
  const mode = sourceMode();
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
}

function enhancePage(page: HTMLElement) {
  tidyTopActions(page);
  forceInteractiveCanvas(page);
  reorderSections(page);
  organizeInformation(page);
  manageSetupDrawers(page);
  cleanCanvasChrome(page);
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

