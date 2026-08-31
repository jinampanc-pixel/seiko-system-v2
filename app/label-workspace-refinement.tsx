"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function packingWorkspace(page: HTMLElement) {
  const purpose = document.querySelector<HTMLElement>(".labelCreateApp")?.dataset.labelPurpose;
  return purpose === "packing" || /Packing labels/i.test(page.querySelector(".labelTopbar")?.textContent || "");
}

function cleanHeaderAndSetup(page: HTMLElement) {
  page.querySelectorAll<HTMLButtonElement>(".labelSaveBar button").forEach(button => {
    const label = button.textContent?.trim() || "";
    if (/^(Layout Library|Layouts\b|Saved sets\b|Batches\b)/i.test(label)) {
      button.hidden = true;
      button.style.display = "none";
    }
  });
  page.querySelector(".labelSaveMeaning")?.remove();
  page.querySelectorAll<HTMLElement>(".labelSetupHelp").forEach(help => {
    if (/Physical size and roll geometry drive preview and printing in millimetres/i.test(help.textContent || "")) help.remove();
  });
}

function addArrangeControl(page: HTMLElement) {
  const toolbar = page.querySelector<HTMLElement>(".canvasToolbar");
  const native = Array.from(page.querySelectorAll<HTMLButtonElement>(".simpleDesignerHead > button.secondary"))
    .find(button => /Advanced layout|Use simple setup|Manual layout|Automatic layout/i.test(button.textContent || ""));
  if (!toolbar || !native) return;
  let button = toolbar.querySelector<HTMLButtonElement>(".labelArrangeButton");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "secondary labelArrangeButton";
    button.title = "Arrange, move and resize label fields on the physical preview";
    toolbar.appendChild(button);
    button.addEventListener("click", () => native.click());
  }
  const manual = /Use simple setup|Automatic layout/i.test(native.textContent || "");
  button.textContent = manual ? "Finish arranging" : "Arrange label";
  button.classList.toggle("active", manual);
  page.classList.toggle("labelManualArrange", manual);
}

function fullRecordText(record: HTMLElement) {
  const title = record.querySelector("b")?.textContent?.trim() || "Label record";
  const compact = record.querySelector("small")?.textContent?.trim() || "";
  const detail = record.dataset.recordPreview?.trim() || compact;
  return { title, detail };
}

function removeHoverCard() {
  document.querySelector(".labelRecordHoverCard")?.remove();
}

function showHoverCard(record: HTMLElement) {
  removeHoverCard();
  const { title, detail } = fullRecordText(record);
  const card = document.createElement("div");
  card.className = "labelRecordHoverCard";
  card.setAttribute("role", "tooltip");
  const heading = document.createElement("b");
  heading.textContent = title;
  const body = document.createElement("span");
  body.textContent = detail || "No additional saved information for this label.";
  card.append(heading, body);
  document.body.appendChild(card);
  const box = record.getBoundingClientRect();
  const width = Math.min(420, Math.max(280, box.width + 100));
  card.style.width = `${width}px`;
  const measured = card.getBoundingClientRect();
  const left = box.left - measured.width - 10 >= 8 ? box.left - measured.width - 10 : Math.min(window.innerWidth - measured.width - 8, box.right + 10);
  const top = Math.max(8, Math.min(window.innerHeight - measured.height - 8, box.top));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function enhanceRecordHover(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>(".labelSidebar .recordList .record").forEach(record => {
    if (record.dataset.hoverDetailReady === "true") return;
    record.dataset.hoverDetailReady = "true";
    record.addEventListener("pointerenter", () => showHoverCard(record));
    record.addEventListener("pointerleave", removeHoverCard);
    record.addEventListener("focus", () => showHoverCard(record));
    record.addEventListener("blur", removeHoverCard);
  });
}

function removePackingGenericChoices(page: HTMLElement) {
  if (!packingWorkspace(page)) return;
  page.querySelectorAll<HTMLElement>(".fieldChoice").forEach(choice => {
    const label = choice.querySelector("label span")?.textContent?.trim() || "";
    if (/^(Person \/ workpiece|Group \/ label type)$/i.test(label)) choice.hidden = true;
  });
}

function personPackageWorkspace(page: HTMLElement) {
  if (!packingWorkspace(page)) return false;
  return Array.from(page.querySelectorAll<HTMLElement>(".recordList .record small"))
    .some(item => /Complete person package|Total\s+\d+/i.test(item.textContent || ""));
}

function resetControlledSelect(select: HTMLSelectElement) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "");
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function refineRecordFilters(page: HTMLElement) {
  const bar = page.querySelector<HTMLElement>(".recordFilterBar");
  const search = page.querySelector<HTMLInputElement>(".recordSearch");
  if (!bar || !search) return;
  const filterSelect = bar.querySelector<HTMLSelectElement>("label:first-child select");
  if (!filterSelect) return;

  const personPackage = personPackageWorkspace(page);
  Array.from(filterSelect.options).forEach(option => {
    const inaccurateForPackage = personPackage && (option.value === "product" || option.value === "product_summary");
    option.hidden = inaccurateForPackage;
    option.disabled = inaccurateForPackage;
  });
  if (personPackage && ["product", "product_summary"].includes(filterSelect.value)) resetControlledSelect(filterSelect);

  search.placeholder = personPackage
    ? "Find person, class/group or a product contained in the package"
    : "Find person, product, class, group or any order field";

  let hint = bar.parentElement?.querySelector<HTMLElement>(".labelRecordAccuracyHint");
  if (personPackage) {
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "labelRecordAccuracyHint";
      bar.insertAdjacentElement("afterend", hint);
    }
    hint.textContent = "Person/package contents come from the saved order quantities. The label tool never infers gender or product eligibility from a name. Search a product name above to find packages containing it; if a product is unexpected, correct that person/group quantity in the order.";
  } else {
    hint?.remove();
  }
}

function stackAutomaticPreview(page: HTMLElement) {
  if (page.classList.contains("labelManualArrange")) return;

  page.querySelectorAll<HTMLElement>(".labelCanvas").forEach(canvas => {
    const fields = Array.from(canvas.querySelectorAll<HTMLElement>(".canvasElement.element-field"));
    if (!fields.length) return;
    const hasQr = Boolean(canvas.querySelector(".canvasElement.element-qr"));
    const start = 7;
    const usable = 82;
    const step = Math.min(18, usable / Math.max(1, fields.length));
    const height = Math.max(8, step - 2);
    fields.forEach((field, index) => {
      field.style.left = "4%";
      field.style.top = `${start + index * step}%`;
      field.style.width = hasQr ? "66%" : "92%";
      field.style.height = `${height}%`;
    });
  });

  page.querySelectorAll<HTMLElement>(".printSheet .printedLabel").forEach(label => {
    const fields = Array.from(label.querySelectorAll<HTMLElement>(".printedElement.element-field"));
    if (!fields.length) return;
    const hasQr = Boolean(label.querySelector(".printedElement.element-qr"));
    const step = Math.min(4, 19 / Math.max(1, fields.length));
    fields.forEach((field, index) => {
      field.style.left = "2mm";
      field.style.top = `${2 + index * step}mm`;
      field.style.width = hasQr ? "33mm" : "46mm";
      field.style.height = `${Math.max(2.2, step - .3)}mm`;
    });
  });
}

function enhancePage(page: HTMLElement) {
  cleanHeaderAndSetup(page);
  addArrangeControl(page);
  enhanceRecordHover(page);
  removePackingGenericChoices(page);
  refineRecordFilters(page);
  stackAutomaticPreview(page);
}

export function LabelWorkspaceRefinement() {
  useEffect(() => {
    const controller = startDomEnhancement(() => {
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(enhancePage);
    }, { observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] } });

    const removeChip = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const remove = target?.closest<HTMLElement>(".labelInfoChipRemove, .labelInfoChip > b");
      if (!remove) return;
      const page = remove.closest<HTMLElement>(".labelDesignerPage");
      const chip = remove.closest<HTMLElement>(".labelInfoChip");
      const label = chip?.querySelector<HTMLElement>(".labelInfoChipText")?.textContent?.trim()
        || chip?.querySelector<HTMLElement>("span:not(.srOnly)")?.textContent?.trim();
      if (!page || !label) return;
      const choice = Array.from(page.querySelectorAll<HTMLElement>(".fieldChoice")).find(item => item.querySelector("label span")?.textContent?.trim() === label);
      const checkbox = choice?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!checkbox || !checkbox.checked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      checkbox.click();
      window.setTimeout(controller.schedule, 0);
    };

    document.addEventListener("click", removeChip, true);
    document.addEventListener("change", controller.schedule, true);
    window.addEventListener("scroll", removeHoverCard, true);
    window.addEventListener("resize", removeHoverCard);
    return () => {
      document.removeEventListener("click", removeChip, true);
      document.removeEventListener("change", controller.schedule, true);
      window.removeEventListener("scroll", removeHoverCard, true);
      window.removeEventListener("resize", removeHoverCard);
      removeHoverCard();
      controller.stop();
    };
  }, []);
  return null;
}
