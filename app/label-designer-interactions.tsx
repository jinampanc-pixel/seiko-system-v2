"use client";

import { useEffect } from "react";

function setReactInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canvasFont(style: CSSStyleDeclaration) {
  return `${style.fontStyle || "normal"} ${style.fontVariant || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "16px"} ${style.fontFamily || "sans-serif"}`;
}

function measureGlyphs(element: HTMLElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const nodes = Array.from(element.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  const pieces = nodes.length ? nodes : [element];
  let width = 0;
  let ascent = 0;
  let descent = 0;
  for (const piece of pieces) {
    const text = piece.textContent || "";
    if (!text) continue;
    const style = getComputedStyle(piece);
    context.font = canvasFont(style);
    const metrics = context.measureText(text);
    width += metrics.width;
    const fontPx = Number.parseFloat(style.fontSize || "0") || 16;
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent || fontPx * .78);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent || fontPx * .22);
  }
  if (!width) return null;
  return { width, height: Math.max(1, ascent + descent) };
}

/**
 * DOM-only helpers for the label designer.
 * Pointer movement is deliberately NOT handled here: LabelDesigner is the
 * single owner of pointer capture, selection and x/y state.
 */
export function LabelDesignerInteractions() {
  useEffect(() => {
    let animationFrame = 0;

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
      if (!element || !element.matches(".element-text,.element-field,.element-sequence")) return;
      const widthInput = geometryInput(page, "Width mm");
      const heightInput = geometryInput(page, "Height mm");
      const xInput = geometryInput(page, "X mm");
      const yInput = geometryInput(page, "Y mm");
      const canvas = page.querySelector<HTMLElement>(".labelCanvas");
      if (!widthInput || !heightInput || !xInput || !yInput || !canvas) return;

      const currentWidth = Number(widthInput.value);
      const currentHeight = Number(heightInput.value);
      const x = Number(xInput.value);
      const y = Number(yInput.value);
      if (![currentWidth, currentHeight, x, y].every(Number.isFinite)) return;

      const canvasRect = canvas.getBoundingClientRect();
      const title = page.querySelector(".canvasToolbar b")?.textContent || "";
      const match = title.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*mm/i);
      const labelW = Number(match?.[1]) || 50;
      const labelH = Number(match?.[2]) || 25;
      const pxPerMm = canvasRect.width / labelW;
      if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return;

      const glyphs = measureGlyphs(element);
      if (!glyphs) return;

      // Canvas TextMetrics tracks the inked glyphs instead of the CSS line box.
      // Keep only a microscopic anti-clipping allowance around the ink itself.
      const safeWidthMm = glyphs.width / pxPerMm + 0.03;
      const safeHeightMm = glyphs.height / pxPerMm + 0.03;
      const maxWidth = Math.max(0.5, labelW - x);
      const maxHeight = Math.max(0.5, labelH - y);
      const width = clamp(Math.ceil(Math.max(0.5, safeWidthMm) * 20) / 20, 0.5, maxWidth);
      const height = clamp(Math.ceil(Math.max(0.5, safeHeightMm) * 20) / 20, 0.5, maxHeight);

      if (Math.abs(width - currentWidth) >= 0.04) setReactInputValue(widthInput, String(width));
      if (Math.abs(height - currentHeight) >= 0.04) setReactInputValue(heightInput, String(height));
    };

    const enhance = () => {
      animationFrame = 0;
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
        placeSizeEditor(page);
        enhanceInformation(page);
        fitSelectedTextBounds(page);
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
    document.addEventListener("pointerdown", closeHeaderMenuOutside, true);
    document.addEventListener("focusin", closeHeaderMenuOutside, true);
    document.addEventListener("keydown", closeHeaderMenuOnEscape, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleControlClick, true);
      document.removeEventListener("pointerdown", closeHeaderMenuOutside, true);
      document.removeEventListener("focusin", closeHeaderMenuOutside, true);
      document.removeEventListener("keydown", closeHeaderMenuOnEscape, true);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, []);

  return null;
}
