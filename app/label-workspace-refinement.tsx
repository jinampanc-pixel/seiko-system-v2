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
    .find(button => /Advanced layout|Use simple setup/i.test(button.textContent || ""));
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
  const advanced = /Use simple setup/i.test(native.textContent || "");
  button.textContent = advanced ? "Finish arranging" : "Arrange label";
  button.classList.toggle("active", advanced);
  page.classList.toggle("labelManualArrange", advanced);
}

function fullRecordText(record: HTMLElement) {
  const title = record.querySelector("b")?.textContent?.trim() || "Label record";
  const detail = record.querySelector("small")?.textContent?.trim() || "";
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
  const width = Math.min(360, Math.max(250, box.width + 70));
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

function enhancePage(page: HTMLElement) {
  cleanHeaderAndSetup(page);
  addArrangeControl(page);
  enhanceRecordHover(page);
  removePackingGenericChoices(page);
}

export function LabelWorkspaceRefinement() {
  useEffect(() => {
    const controller = startDomEnhancement(() => {
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(enhancePage);
    }, { observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] } });

    const removeChip = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const remove = target?.closest<HTMLElement>(".labelInfoChipRemove");
      if (!remove) return;
      const page = remove.closest<HTMLElement>(".labelDesignerPage");
      const chip = remove.closest<HTMLElement>(".labelInfoChip");
      const label = chip?.querySelector(".labelInfoChipText")?.textContent?.trim();
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
    window.addEventListener("scroll", removeHoverCard, true);
    window.addEventListener("resize", removeHoverCard);
    return () => {
      document.removeEventListener("click", removeChip, true);
      window.removeEventListener("scroll", removeHoverCard, true);
      window.removeEventListener("resize", removeHoverCard);
      removeHoverCard();
      controller.stop();
    };
  }, []);
  return null;
}
