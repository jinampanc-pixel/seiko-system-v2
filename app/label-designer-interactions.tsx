"use client";

import { useEffect } from "react";

/**
 * Pointer/document-scope helpers for the label designer.
 * Label geometry remains owned by LabelDesigner; this adapter must never
 * reserve hidden canvas space or rewrite an element's saved position.
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

    const enhanceInformation = (page: HTMLElement) => {
      const section = page.querySelector<HTMLElement>(".simpleDesigner");
      const checklist = section?.querySelector<HTMLElement>(".fieldChecklist");
      if (!section || !checklist) return;

      const classification = section.querySelector<HTMLElement>(".classificationInformation");
      if (classification) {
        classification.classList.add("classificationTile");
        const clientChoice = Array.from(checklist.querySelectorAll<HTMLElement>(":scope > .fieldChoice")).find(choice =>
          choice.querySelector("label span")?.textContent?.trim() === "Client"
        );
        if (classification.parentElement !== checklist || (clientChoice && classification.nextElementSibling !== clientChoice)) {
          if (clientChoice) checklist.insertBefore(classification, clientChoice);
          else checklist.appendChild(classification);
        }
      }
    };

    const enhance = () => {
      animationFrame = 0;
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
        ensureDeleteTarget(page);
        placeSizeEditor(page);
        enhanceInformation(page);
      });
    };

    const scheduleEnhance = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(enhance);
    };

    const selectedFieldCount = (section: HTMLElement) =>
      section.querySelectorAll<HTMLInputElement>('.fieldChecklist > .fieldChoice input[type="checkbox"]:checked').length;

    const toggleInformation = (button: HTMLButtonElement) => {
      const section = button.closest<HTMLElement>(".simpleDesigner");
      if (!section) return;
      const collapsed = section.classList.toggle("labelInfoCollapsed");
      button.textContent = collapsed ? `Choose information · ${selectedFieldCount(section)} selected` : "Done";
      if (!collapsed) scheduleEnhance();
    };

    const validateSizeEditor = (editor: HTMLElement) => {
      editor.querySelector(".labelSizeValidation")?.remove();
      const inputs = Array.from(editor.querySelectorAll<HTMLInputElement>("input"));
      const name = inputs.find(input => input.type === "text");
      const numeric = inputs.filter(input => input.type === "number");
      let message = "";

      if (!name?.value.trim()) message = "Give this label size a name.";
      else if (numeric.some(input => !Number.isFinite(Number(input.value)) || Number(input.value) < 0)) message = "Enter valid measurements before saving.";
      else if (numeric.slice(0, 4).some(input => Number(input.value) <= 0)) message = "Width, height, roll width and Across must be greater than zero.";
      else if (numeric.length >= 7) {
        const [labelW, , rollW, columns, outer, gapX] = numeric.map(input => Number(input.value));
        const required = outer * 2 + columns * labelW + Math.max(0, columns - 1) * gapX;
        if (required > rollW + .01) message = `This layout needs at least ${required.toFixed(1)} mm roll width. Increase the roll width or reduce label width, columns, margin or gap.`;
      }

      if (!message) return true;

      const note = document.createElement("p");
      note.className = "labelSizeValidation";
      note.setAttribute("role", "alert");
      note.textContent = message;
      editor.querySelector(".customSizeActions")?.insertAdjacentElement("beforebegin", note);
      if (!name?.value.trim()) name?.focus();
      return false;
    };

    const handleControlClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const infoToggle = target.closest<HTMLButtonElement>(".labelDesignerPage .labelInfoToggle");
      if (infoToggle) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleInformation(infoToggle);
        return;
      }

      const sizeAction = target.closest<HTMLButtonElement>(".labelDesignerPage .customSizeActions button");
      if (!sizeAction) return;
      const editor = sizeAction.closest<HTMLElement>(".customSize");
      if (!editor) return;

      const isSave = sizeAction.classList.contains("primary");
      if (isSave && !validateSizeEditor(editor)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      window.setTimeout(() => {
        if (editor.isConnected) editor.remove();
      }, 0);
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

      if (shouldRemove) {
        window.setTimeout(() => {
          page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click();
        }, 0);
      }
    };

    const closeHeaderMenuOutside = (event: Event) => {
      const target = event.target as Node | null;
      document.querySelectorAll<HTMLDetailsElement>(".labelDesignerPage .labelHeaderMore[open]").forEach(details => {
        if (!target || !details.contains(target)) details.open = false;
      });
    };

    const closeHeaderMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>(".labelDesignerPage .labelHeaderMore[open]").forEach(details => { details.open = false; });
    };

    enhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleControlClick, true);
    document.addEventListener("pointerdown", beginDrag, true);
    document.addEventListener("pointermove", updateDrag, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    document.addEventListener("pointerdown", closeHeaderMenuOutside, true);
    document.addEventListener("focusin", closeHeaderMenuOutside, true);
    document.addEventListener("keydown", closeHeaderMenuOnEscape, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleControlClick, true);
      document.removeEventListener("pointerdown", beginDrag, true);
      document.removeEventListener("pointermove", updateDrag, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      document.removeEventListener("pointerdown", closeHeaderMenuOutside, true);
      document.removeEventListener("focusin", closeHeaderMenuOutside, true);
      document.removeEventListener("keydown", closeHeaderMenuOnEscape, true);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
