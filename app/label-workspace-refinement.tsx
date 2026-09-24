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

function openLabelSaveChoice(page: HTMLElement) {
  document.querySelector(".labelSaveChoiceLayer")?.remove();
  const layer = document.createElement("div"); layer.className = "labelSaveChoiceLayer";
  layer.innerHTML = '<section class="labelSaveChoiceDialog" role="dialog" aria-modal="true" aria-labelledby="label-save-choice-title"><h3 id="label-save-choice-title">Save label work</h3><p>Choose what Ctrl/Cmd + S should save.</p><div><button type="button" class="primary saveSet">Save label set</button><button type="button" class="secondary saveLayout">Save layout</button><button type="button" class="textButton cancel">Cancel</button></div></section>';
  const close = () => layer.remove();
  layer.querySelector<HTMLButtonElement>(".cancel")?.addEventListener("click", close);
  layer.addEventListener("click", event => { if (event.target === layer) close(); });
  layer.querySelector<HTMLButtonElement>(".saveSet")?.addEventListener("click", () => { const details=page.querySelector<HTMLDetailsElement>(".labelHeaderMore"); if(details) details.open=true; requestAnimationFrame(()=>{Array.from(page.querySelectorAll<HTMLButtonElement>(".labelHeaderMoreMenu button")).find(button=>/^(Save|Update) label set$/.test(button.textContent?.trim()||""))?.click(); close();}); });
  layer.querySelector<HTMLButtonElement>(".saveLayout")?.addEventListener("click", () => { const details=page.querySelector<HTMLDetailsElement>(".labelHeaderMore"); if(details) details.open=true; requestAnimationFrame(()=>{Array.from(page.querySelectorAll<HTMLButtonElement>(".labelHeaderMoreMenu button")).find(button=>/^(Save|Update) layout$/.test(button.textContent?.trim()||""))?.click(); close();}); });
  document.body.appendChild(layer); layer.querySelector<HTMLButtonElement>(".saveSet")?.focus();
}

function enhancePage(page: HTMLElement) {
  cleanHeaderAndSetup(page);
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

    const saveShortcut = (event: KeyboardEvent) => { if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "s") return; const page=document.querySelector<HTMLElement>(".labelDesignerPage"); if(!page) return; event.preventDefault(); event.stopImmediatePropagation(); openLabelSaveChoice(page); };
    document.addEventListener("keydown", saveShortcut, true);
    document.addEventListener("click", removeChip, true);
    document.addEventListener("change", controller.schedule, true);
    window.addEventListener("scroll", removeHoverCard, true);
    window.addEventListener("resize", removeHoverCard);
    return () => {
      document.removeEventListener("keydown", saveShortcut, true);
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
