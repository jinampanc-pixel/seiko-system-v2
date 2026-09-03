"use client";

import { useEffect } from "react";

function currentBusiness() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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
    let directPrintTimer = 0;
    let textDrag: {
      page: HTMLElement;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      width: number;
      height: number;
    } | null = null;

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

    const geometryInput = (page: HTMLElement, label: string) => Array.from(page.querySelectorAll<HTMLLabelElement>(".labelGeometryFields label")).find(node => node.querySelector("span")?.textContent?.trim() === label)?.querySelector<HTMLInputElement>("input") || null;

    const fitSelectedTextBounds = (page: HTMLElement) => {
      const element = page.querySelector<HTMLElement>(".canvasElement.selected");
      if (!element || !element.matches(".element-text,.element-field,.element-sequence")) return null;
      const widthInput = geometryInput(page, "Width mm");
      const heightInput = geometryInput(page, "Height mm");
      const xInput = geometryInput(page, "X mm");
      const yInput = geometryInput(page, "Y mm");
      const canvas = page.querySelector<HTMLElement>(".labelCanvas");
      if (!widthInput || !heightInput || !xInput || !yInput || !canvas) return null;

      const currentWidth = Number(widthInput.value);
      const currentHeight = Number(heightInput.value);
      const x = Number(xInput.value);
      const y = Number(yInput.value);
      if (![currentWidth, currentHeight, x, y].every(Number.isFinite)) return null;

      const canvasRect = canvas.getBoundingClientRect();
      const preset = currentPreset();
      const pxPerMm = canvasRect.width / preset.labelW;
      if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return null;

      const range = document.createRange();
      range.selectNodeContents(element);
      const contentRect = range.getBoundingClientRect();
      range.detach();
      if (!contentRect.width || !contentRect.height) return null;

      const safeWidthMm = contentRect.width / pxPerMm + 0.18;
      const safeHeightMm = contentRect.height / pxPerMm + 0.12;
      const maxWidth = Math.max(0.5, preset.labelW - x);
      const maxHeight = Math.max(0.5, preset.labelH - y);
      const width = clamp(Math.ceil(Math.max(0.75, safeWidthMm) * 4) / 4, 0.75, maxWidth);
      const height = clamp(Math.ceil(Math.max(0.75, safeHeightMm) * 4) / 4, 0.75, maxHeight);

      if (Math.abs(width - currentWidth) >= 0.2) setReactInputValue(widthInput, String(width));
      if (Math.abs(height - currentHeight) >= 0.2) setReactInputValue(heightInput, String(height));
      return { x, y, width, height };
    };

    const autoFitSelectedText = (page: HTMLElement) => {
      fitSelectedTextBounds(page);
    };

    const runDirectPrintWhenReady = (page: HTMLElement) => {
      const business = currentBusiness();
      const directKey = `jinam:${business}:labels:open-task-direct-action`;
      const taskKey = `jinam:${business}:labels:open-task`;
      const action = sessionStorage.getItem(directKey);
      if (!action || sessionStorage.getItem(taskKey) || directPrintTimer) return;
      const printButton = page.querySelector<HTMLButtonElement>(".labelHeaderCommandBar > button.primary");
      if (!printButton || printButton.disabled) return;
      sessionStorage.removeItem(directKey);
      directPrintTimer = window.setTimeout(() => {
        directPrintTimer = 0;
        printButton.click();
      }, 80);
    };

    const enhance = () => {
      animationFrame = 0;
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
        ensureDeleteTarget(page);
        placeSizeEditor(page);
        enhanceInformation(page);
        autoFitSelectedText(page);
        runDirectPrintWhenReady(page);
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

      if (element.matches(".element-text,.element-field,.element-sequence")) {
        const pointerId = event.pointerId;
        const startClientX = event.clientX;
        const startClientY = event.clientY;
        window.setTimeout(() => {
          if (!page.isConnected) return;
          const fitted = fitSelectedTextBounds(page);
          if (!fitted) return;
          textDrag = { page, pointerId, startClientX, startClientY, startX: fitted.x, startY: fitted.y, width: fitted.width, height: fitted.height };
        }, 0);
      } else {
        textDrag = null;
      }
    };

    const updateDrag = (event: PointerEvent) => {
      if (!draggedPage || !draggedElement) return;

      if (textDrag && textDrag.pointerId === event.pointerId && textDrag.page === draggedPage) {
        const canvas = draggedPage.querySelector<HTMLElement>(".labelCanvas");
        const xInput = geometryInput(draggedPage, "X mm");
        const yInput = geometryInput(draggedPage, "Y mm");
        if (canvas && xInput && yInput) {
          const rect = canvas.getBoundingClientRect();
          const preset = currentPreset();
          let dx = (event.clientX - textDrag.startClientX) * preset.labelW / rect.width;
          let dy = (event.clientY - textDrag.startClientY) * preset.labelH / rect.height;
          if (event.shiftKey) {
            if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          let x = textDrag.startX + dx;
          let y = textDrag.startY + dy;
          if (!event.altKey) {
            x = Math.round(x * 4) / 4;
            y = Math.round(y * 4) / 4;
          }
          x = clamp(x, 0, Math.max(0, preset.labelW - textDrag.width));
          y = clamp(y, 0, Math.max(0, preset.labelH - textDrag.height));
          if (Math.abs(Number(xInput.value) - x) >= 0.01) setReactInputValue(xInput, String(x));
          if (Math.abs(Number(yInput.value) - y) >= 0.01) setReactInputValue(yInput, String(y));
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }

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
      textDrag = null;
      removeArmed = false;

      if (shouldRemove) {
        window.setTimeout(() => {
          page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click();
        }, 0);
      } else {
        window.setTimeout(() => autoFitSelectedText(page), 0);
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
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled", "style"] });
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
      if (directPrintTimer) window.clearTimeout(directPrintTimer);
    };
  }, []);

  return null;
}
