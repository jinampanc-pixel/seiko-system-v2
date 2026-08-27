"use client";

import { useEffect } from "react";

/**
 * Small interaction adapter for behaviours that must react to pointer movement
 * outside the physical label canvas. Core label data remains owned by LabelDesigner.
 */
export function LabelDesignerInteractions() {
  useEffect(() => {
    let draggedPage: HTMLElement | null = null;
    let draggedElement: HTMLElement | null = null;
    let removeArmed = false;
    let animationFrame = 0;

    const ensureDeleteTarget = (page: HTMLElement) => {
      const panel = page.querySelector<HTMLElement>(".labelCanvasPanel");
      if (!panel || panel.querySelector(".labelDragDeleteTarget")) return;

      const target = document.createElement("div");
      target.className = "labelDragDeleteTarget";
      target.setAttribute("aria-hidden", "true");
      target.innerHTML = '<span class="labelDragDeleteIcon">×</span><b>Drop to remove</b>';
      panel.appendChild(target);
    };

    const placeSizeEditor = (page: HTMLElement) => {
      const stack = page.querySelector<HTMLElement>(".labelControlStack");
      const setup = stack?.querySelector<HTMLElement>(".labelSetup");
      const editor = page.querySelector<HTMLElement>(".customSize");
      if (!stack || !setup || !editor) return;

      editor.classList.add("labelInlineSizeEditor");
      if (editor.parentElement !== stack || setup.nextElementSibling !== editor) {
        setup.insertAdjacentElement("afterend", editor);
      }
    };

    const enhance = () => {
      animationFrame = 0;
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
        ensureDeleteTarget(page);
        placeSizeEditor(page);
      });
    };

    const scheduleEnhance = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(enhance);
    };

    const setDeleteState = (target: HTMLElement, armed: boolean) => {
      target.classList.add("visible");
      target.classList.toggle("armed", armed);
    };

    const beginDrag = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".labelDesignerPage .canvasElement");
      if (!element) return;

      const page = element.closest<HTMLElement>(".labelDesignerPage");
      const target = page?.querySelector<HTMLElement>(".labelDragDeleteTarget");
      if (!page || !target) return;

      draggedPage = page;
      draggedElement = element;
      removeArmed = false;
      setDeleteState(target, false);
    };

    const updateDrag = (event: PointerEvent) => {
      if (!draggedPage || !draggedElement) return;

      const target = draggedPage.querySelector<HTMLElement>(".labelDragDeleteTarget");
      const canvas = draggedPage.querySelector<HTMLElement>(".labelCanvas");
      const panel = draggedPage.querySelector<HTMLElement>(".labelCanvasPanel");
      if (!target || !canvas || !panel) return;

      const targetRect = target.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const overTarget =
        event.clientX >= targetRect.left - 28 &&
        event.clientX <= targetRect.right + 28 &&
        event.clientY >= targetRect.top - 28 &&
        event.clientY <= targetRect.bottom + 28;
      const pulledBelowLabel =
        event.clientX >= panelRect.left &&
        event.clientX <= panelRect.right &&
        event.clientY >= canvasRect.bottom + 8;

      removeArmed = overTarget || pulledBelowLabel;
      setDeleteState(target, removeArmed);
      draggedElement.classList.toggle("deleteArmed", removeArmed);
    };

    const finishDrag = () => {
      if (!draggedPage) return;

      const page = draggedPage;
      const element = draggedElement;
      const shouldRemove = removeArmed;
      const target = page.querySelector<HTMLElement>(".labelDragDeleteTarget");

      target?.classList.remove("visible", "armed");
      element?.classList.remove("deleteArmed");
      draggedPage = null;
      draggedElement = null;
      removeArmed = false;

      if (!shouldRemove) return;

      // Use LabelDesigner's own remove action so items, saved layouts and print data
      // all update through the same React state path.
      window.setTimeout(() => {
        page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click();
      }, 0);
    };

    enhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", beginDrag, true);
    document.addEventListener("pointermove", updateDrag, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", beginDrag, true);
      document.removeEventListener("pointermove", updateDrag, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
