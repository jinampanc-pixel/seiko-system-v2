"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function packingWorkspace(page: HTMLElement) {
  const purpose = document.querySelector<HTMLElement>(".labelCreateApp")?.dataset.labelPurpose;
  return purpose === "packing" || /Packing labels/i.test(page.querySelector(".labelTopbar")?.textContent || "");
}

function cleanHeaderAndSetup(page: HTMLElement) {
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
