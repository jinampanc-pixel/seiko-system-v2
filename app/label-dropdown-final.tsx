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
  if (!panel) return;

  let target = panel.querySelector<HTMLElement>(".labelDragDeleteTarget");
  if (!target) {
    target = document.createElement("div");
    target.className = "labelDragDeleteTarget";
    target.setAttribute("aria-hidden", "true");
    target.innerHTML = '<span class="labelDragDeleteIcon">×</span><b>Drop to remove</b>';
    panel.appendChild(target);
  }

  Object.assign(target.style, {
    position: "absolute",
    zIndex: "999",
    left: "50%",
    bottom: "18px",
    transform: "translate(-50%, 18px) scale(.92)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    border: "1px solid #d7b1aa",
    borderRadius: "999px",
    background: "#fff7f5",
    color: "#b93224",
    boxShadow: "0 10px 28px rgba(125,33,21,.22)",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity .14s ease, transform .14s ease, background .14s ease, color .14s ease",
  });
}

function showDeleteTarget(target: HTMLElement) {
  target.classList.add("visible");
  target.classList.remove("armed");
  target.style.opacity = "1";
  target.style.transform = "translate(-50%, 0) scale(1)";
  target.style.background = "#fff7f5";
  target.style.color = "#b93224";
  target.style.borderColor = "#d7b1aa";
}

function armDeleteTarget(target: HTMLElement, armed: boolean) {
  target.classList.toggle("armed", armed);
  target.style.background = armed ? "#c93425" : "#fff7f5";
  target.style.color = armed ? "#fff" : "#b93224";
  target.style.borderColor = armed ? "#c93425" : "#d7b1aa";
  target.style.transform = armed ? "translate(-50%, 0) scale(1.08)" : "translate(-50%, 0) scale(1)";
}

function hideDeleteTarget(target: HTMLElement) {
  target.classList.remove("visible", "armed");
  target.style.opacity = "0";
  target.style.transform = "translate(-50%, 18px) scale(.92)";
  target.style.background = "#fff7f5";
  target.style.color = "#b93224";
  target.style.borderColor = "#d7b1aa";
}

function normalizePrintGeometry() {
  document.querySelectorAll<HTMLElement>(".printSheet .printedElement").forEach(element => {
    if (element.dataset.canvasPrintFontApplied === "true") return;
    const inline = element.style.fontSize.trim();
    if (!inline.endsWith("pt")) return;
    const font = Number.parseFloat(inline);
    if (!Number.isFinite(font)) return;

    // Designer canvas uses 8 px per millimetre and font * 1.333 px.
    // Therefore the same physical print size is font / 6 millimetres.
    element.dataset.canvasPrintFontApplied = "true";
    element.dataset.originalPrintFont = inline;
    element.style.fontSize = `${font / 6}mm`;
    element.style.lineHeight = "1";
  });

  // `outer` is the horizontal roll margin used in the 109 mm width equation.
  // Do not accidentally add the same value as a vertical print offset.
  document.querySelectorAll<HTMLElement>(".printSheet").forEach(sheet => {
    if (sheet.dataset.canvasPrintPaddingApplied === "true") return;
    sheet.dataset.canvasPrintPaddingApplied = "true";
    sheet.dataset.originalPaddingTop = sheet.style.paddingTop;
    sheet.dataset.originalPaddingBottom = sheet.style.paddingBottom;
    sheet.style.paddingTop = "0";
    sheet.style.paddingBottom = "0";
  });
}

function restorePrintGeometry() {
  document.querySelectorAll<HTMLElement>('.printSheet .printedElement[data-canvas-print-font-applied="true"]').forEach(element => {
    element.style.fontSize = element.dataset.originalPrintFont || "";
    element.style.lineHeight = "";
    delete element.dataset.canvasPrintFontApplied;
    delete element.dataset.originalPrintFont;
  });
  document.querySelectorAll<HTMLElement>('.printSheet[data-canvas-print-padding-applied="true"]').forEach(sheet => {
    sheet.style.paddingTop = sheet.dataset.originalPaddingTop || "";
    sheet.style.paddingBottom = sheet.dataset.originalPaddingBottom || "";
    delete sheet.dataset.canvasPrintPaddingApplied;
    delete sheet.dataset.originalPaddingTop;
    delete sheet.dataset.originalPaddingBottom;
  });
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
      showDeleteTarget(target);
    };

    const pointerMove = (event: PointerEvent) => {
      if (!dragPage || !dragElement) return;
      const target = dragPage.querySelector<HTMLElement>(".labelDragDeleteTarget");
      const panel = dragPage.querySelector<HTMLElement>(".labelCanvasPanel");
      const canvas = dragPage.querySelector<HTMLElement>(".labelCanvas");
      if (!target || !panel || !canvas) return;

      const targetRect = target.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const directlyOverTarget =
        event.clientX >= targetRect.left - 24 &&
        event.clientX <= targetRect.right + 24 &&
        event.clientY >= targetRect.top - 24 &&
        event.clientY <= targetRect.bottom + 24;

      const pulledDown =
        event.clientX >= panelRect.left &&
        event.clientX <= panelRect.right &&
        event.clientY >= canvasRect.bottom + 8;

      deleteArmed = directlyOverTarget || pulledDown;
      armDeleteTarget(target, deleteArmed);
      dragElement.classList.toggle("deleteArmed", deleteArmed);
      dragElement.style.opacity = deleteArmed ? ".32" : "";
    };

    const finishDrag = () => {
      if (!dragPage) return;
      const page = dragPage;
      const element = dragElement;
      const armed = deleteArmed;
      const target = page.querySelector<HTMLElement>(".labelDragDeleteTarget");

      if (target) hideDeleteTarget(target);
      element?.classList.remove("deleteArmed");
      if (element) element.style.opacity = "";

      dragPage = null;
      dragElement = null;
      deleteArmed = false;

      if (!armed) return;

      window.setTimeout(() => {
        const remove = page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]');
        remove?.click();
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
    window.addEventListener("beforeprint", normalizePrintGeometry);
    window.addEventListener("afterprint", restorePrintGeometry);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("beforeprint", normalizePrintGeometry);
      window.removeEventListener("afterprint", restorePrintGeometry);
      restorePrintGeometry();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
