"use client";

import { useEffect } from "react";

const RIGHT_PRINT_SAFE_MM = 1.5;

/**
 * Narrow interaction adapter for behaviours that need pointer/document scope.
 * Label data and form state remain owned by LabelDesigner.
 */
export function LabelDesignerInteractions() {
  useEffect(() => {
    let draggedPage: HTMLElement | null = null;
    let draggedElement: HTMLElement | null = null;
    let removeArmed = false;
    let animationFrame = 0;

    const labelWidthMm = (page: HTMLElement) => {
      const text = page.querySelector<HTMLElement>(".canvasToolbar b")?.textContent || "";
      const match = text.match(/([\d.]+)\s*[×x]\s*[\d.]+\s*mm/i);
      const width = Number(match?.[1]);
      return Number.isFinite(width) && width > RIGHT_PRINT_SAFE_MM ? width : 50;
    };

    const clampPreviewRightEdge = (page: HTMLElement) => {
      const canvas = page.querySelector<HTMLElement>(".labelCanvas");
      if (!canvas) return;

      const widthMm = labelWidthMm(page);
      const safePercent = RIGHT_PRINT_SAFE_MM / widthMm * 100;
      const safeValue = `${safePercent}%`;
      if (canvas.style.getPropertyValue("--label-right-safe-pct") !== safeValue) {
        canvas.style.setProperty("--label-right-safe-pct", safeValue);
      }
      canvas.dataset.rightSafeMm = String(RIGHT_PRINT_SAFE_MM);

      canvas.querySelectorAll<HTMLElement>(".canvasElement").forEach(element => {
        const left = Number.parseFloat(element.style.left);
        const width = Number.parseFloat(element.style.width);
        if (!Number.isFinite(left) || !Number.isFinite(width)) return;
        const maxLeft = Math.max(0, 100 - safePercent - width);
        const nextLeft = Math.min(left, maxLeft);
        if (Math.abs(nextLeft - left) > 0.001) element.style.left = `${nextLeft}%`;
      });
    };

    const clampPrintedRightEdge = (page: HTMLElement) => {
      const widthMm = labelWidthMm(page);
      const maxRight = widthMm - RIGHT_PRINT_SAFE_MM;
      page.querySelectorAll<HTMLElement>(".printedLabel").forEach(label => {
        label.querySelectorAll<HTMLElement>(".printedElement").forEach(element => {
          const left = Number.parseFloat(element.style.left);
          const width = Number.parseFloat(element.style.width);
          if (!Number.isFinite(left) || !Number.isFinite(width)) return;
          const maxLeft = Math.max(0, maxRight - width);
          const nextLeft = Math.min(left, maxLeft);
          if (Math.abs(nextLeft - left) > 0.001) element.style.left = `${nextLeft}mm`;
        });
      });
    };

    const applyPrintSafety = (page: HTMLElement) => {
      clampPreviewRightEdge(page);
      clampPrintedRightEdge(page);
    };

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

      const selectedStrip = section.querySelector<HTMLElement>(".labelInfoSelectedStrip");
      selectedStrip?.querySelectorAll<HTMLButtonElement>(".labelInfoChip").forEach(chip => {
        if (chip.dataset.removeReady === "true") return;
        const label = chip.textContent?.trim();
        if (!label) return;
        chip.dataset.fieldLabel = label;
        chip.dataset.removeReady = "true";
        chip.replaceChildren();
        const text = document.createElement("span");
        text.className = "labelInfoChipText";
        text.textContent = label;
        const remove = document.createElement("span");
        remove.className = "labelInfoChipRemove";
        remove.setAttribute("aria-hidden", "true");
        remove.textContent = "×";
        chip.append(text, remove);
        chip.setAttribute("aria-label", `${label}. Click to edit; use the × to remove.`);
      });
    };

    const enhance = () => {
      animationFrame = 0;
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
        ensureDeleteTarget(page);
        placeSizeEditor(page);
        enhanceInformation(page);
        applyPrintSafety(page);
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

    const removeSelectedChip = (removeControl: HTMLElement) => {
      const chip = removeControl.closest<HTMLButtonElement>(".labelInfoChip");
      const section = chip?.closest<HTMLElement>(".simpleDesigner");
      const checklist = section?.querySelector<HTMLElement>(".fieldChecklist");
      const label = chip?.dataset.fieldLabel;
      if (!chip || !checklist || !label) return;
      const choice = Array.from(checklist.querySelectorAll<HTMLElement>(":scope > .fieldChoice")).find(item =>
        item.querySelector("label span")?.textContent?.trim() === label
      );
      choice?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
      scheduleEnhance();
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

      const chipRemove = target.closest<HTMLElement>(".labelDesignerPage .labelInfoChipRemove");
      if (chipRemove) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        removeSelectedChip(chipRemove);
        return;
      }

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

      // React owns showSizes/createSize. Because this editor is visually relocated,
      // remove the relocated DOM node after React has processed the click so an
      // orphan cannot remain visible after Cancel or Save.
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
      scheduleEnhance();
    };

    const nudgeReactDragInsideSafeArea = (event: PointerEvent, page: HTMLElement, element: HTMLElement) => {
      const canvas = page.querySelector<HTMLElement>(".labelCanvas");
      if (!canvas || !element.hasPointerCapture(event.pointerId)) return;
      const canvasRect = canvas.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const safeRight = canvasRect.right - canvasRect.width * RIGHT_PRINT_SAFE_MM / labelWidthMm(page);
      const overflowPx = elementRect.right - safeRight;
      if (overflowPx <= 0.5) return;

      element.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        clientX: event.clientX - overflowPx,
        clientY: event.clientY,
        buttons: event.buttons,
        pressure: event.pressure,
      }));
    };

    const finishDrag = (event: PointerEvent) => {
      if (!draggedPage) return;

      const page = draggedPage;
      const element = draggedElement;
      const shouldRemove = removeArmed;
      const target = page.querySelector<HTMLElement>(".labelDragDeleteTarget");

      if (!shouldRemove && element) nudgeReactDragInsideSafeArea(event, page, element);

      target?.classList.remove("visible", "armed");
      element?.classList.remove("deleteArmed");
      draggedPage = null;
      draggedElement = null;
      removeArmed = false;

      if (shouldRemove) {
        // Use LabelDesigner's own remove action so layouts and print state stay in sync.
        window.setTimeout(() => {
          page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click();
        }, 0);
        return;
      }

      requestAnimationFrame(() => applyPrintSafety(page));
    };

    const beforePrint = () => {
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(applyPrintSafety);
    };

    enhance();
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    document.addEventListener("click", handleControlClick, true);
    document.addEventListener("pointerdown", beginDrag, true);
    document.addEventListener("pointermove", updateDrag, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("resize", scheduleEnhance);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleControlClick, true);
      document.removeEventListener("pointerdown", beginDrag, true);
      document.removeEventListener("pointermove", updateDrag, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("resize", scheduleEnhance);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
