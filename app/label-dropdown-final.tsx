"use client";

import { useEffect } from "react";

function placeNativeSizeEditor(page: HTMLElement) {
  const stack = page.querySelector<HTMLElement>(".labelControlStack");
  const setup = stack?.querySelector<HTMLElement>(".labelSetup");
  const editor = page.querySelector<HTMLElement>(".customSize");
  if (!stack || !setup || !editor) return;

  editor.classList.add("labelInlineSizeEditor");
  if (setup.nextElementSibling !== editor) setup.insertAdjacentElement("afterend", editor);
}

function hardenWorkingRow(page: HTMLElement) {
  const grid = page.querySelector<HTMLElement>(".labelSelectionPreviewGrid, .labelDesignerGrid");
  if (!grid) return;
  grid.classList.add("labelFinalWorkingRow");
  grid.querySelector<HTMLElement>(".labelCanvasPanel")?.classList.add("labelFinalPreviewCard");
  grid.querySelector<HTMLElement>(".labelSidebar")?.classList.add("labelFinalRecordsCard");
}

function ensureDeleteTarget(page: HTMLElement) {
  const panel = page.querySelector<HTMLElement>(".labelCanvasPanel");
  if (!panel || panel.querySelector(".labelDragDeleteTarget")) return;
  const target = document.createElement("div");
  target.className = "labelDragDeleteTarget";
  target.setAttribute("aria-hidden", "true");
  target.innerHTML = '<span class="labelDragDeleteIcon">×</span><b>Remove</b>';
  panel.appendChild(target);
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
    placeNativeSizeEditor(page);
    hardenWorkingRow(page);
    ensureDeleteTarget(page);
  });
}

export function LabelDropdownFinal() {
  useEffect(() => {
    let frame = 0;
    let dragPage: HTMLElement | null = null;
    let dragElement: HTMLElement | null = null;
    let deleteArmed = false;

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        enhance();
      });
    };

    const pointerDown = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".labelDesignerPage .canvasElement");
      if (!element) return;
      const page = element.closest<HTMLElement>(".labelDesignerPage");
      const target = page?.querySelector<HTMLElement>(".labelDragDeleteTarget");
      if (!page || !target) return;
      dragPage = page;
      dragElement = element;
      deleteArmed = false;
      target.classList.add("visible");
      target.classList.remove("armed");
    };

    const pointerMove = (event: PointerEvent) => {
      if (!dragPage || !dragElement) return;
      const target = dragPage.querySelector<HTMLElement>(".labelDragDeleteTarget");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      deleteArmed = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      target.classList.toggle("armed", deleteArmed);
      dragElement.classList.toggle("deleteArmed", deleteArmed);
    };

    const finishDrag = () => {
      if (!dragPage) return;
      const page = dragPage;
      const element = dragElement;
      const armed = deleteArmed;
      const target = page.querySelector<HTMLElement>(".labelDragDeleteTarget");
      target?.classList.remove("visible", "armed");
      element?.classList.remove("deleteArmed");
      dragPage = null;
      dragElement = null;
      deleteArmed = false;
      if (!armed) return;
      window.setTimeout(() => {
        page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click();
      }, 0);
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
