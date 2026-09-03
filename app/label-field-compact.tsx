"use client";

import { useEffect } from "react";

function setReactInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function geometryInput(page: HTMLElement, label: string) {
  return Array.from(page.querySelectorAll<HTMLLabelElement>(".labelGeometryFields label"))
    .find(node => node.querySelector("span")?.textContent?.trim() === label)
    ?.querySelector<HTMLInputElement>("input") || null;
}

function canvasFont(style: CSSStyleDeclaration) {
  return `${style.fontStyle || "normal"} ${style.fontVariant || "normal"} ${style.fontWeight || "400"} ${style.fontSize || "16px"} ${style.fontFamily || "sans-serif"}`;
}

function compactFieldPixels(element: HTMLElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const pieces = Array.from(element.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (!pieces.length) return null;

  let width = 0;
  let height = 0;
  let largestFont = 0;
  let populated = 0;

  for (const piece of pieces) {
    const text = (piece.textContent || "").trimEnd();
    if (!text) continue;
    const style = getComputedStyle(piece);
    const fontPx = Number.parseFloat(style.fontSize || "0") || 16;
    largestFont = Math.max(largestFont, fontPx);
    context.font = canvasFont(style);
    const metrics = context.measureText(text);
    width += metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || fontPx * .78;
    const descent = metrics.actualBoundingBoxDescent || fontPx * .22;
    height = Math.max(height, ascent + descent);
    populated += 1;
  }

  if (!populated || !width || !height) return null;
  if (populated > 1) width += largestFont * .035;
  return { width, height };
}

function labelDimensions(page: HTMLElement) {
  const title = page.querySelector(".canvasToolbar b")?.textContent || "";
  const match = title.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*mm/i);
  return { width: Number(match?.[1]) || 50, height: Number(match?.[2]) || 25 };
}

function fitSelectedField(page: HTMLElement) {
  // Adaptive person/package labels use the saved rectangle as a maximum text
  // zone. Shrinking that rectangle to the current person's glyphs would make
  // longer names on later records unnecessarily tiny, so the adaptive engine
  // owns fitting while this legacy compact-box helper stands down.
  if (page.classList.contains("adaptiveLabelMode")) return;

  const element = page.querySelector<HTMLElement>(".canvasElement.element-field.selected");
  const canvas = page.querySelector<HTMLElement>(".labelCanvas");
  if (!element || !canvas) return;

  const widthInput = geometryInput(page, "Width mm");
  const heightInput = geometryInput(page, "Height mm");
  const xInput = geometryInput(page, "X mm");
  const yInput = geometryInput(page, "Y mm");
  if (!widthInput || !heightInput || !xInput || !yInput) return;

  const currentWidth = Number(widthInput.value);
  const currentHeight = Number(heightInput.value);
  const x = Number(xInput.value);
  const y = Number(yInput.value);
  if (![currentWidth, currentHeight, x, y].every(Number.isFinite)) return;

  const physical = labelDimensions(page);
  const canvasWidth = canvas.getBoundingClientRect().width;
  const pxPerMm = canvasWidth / physical.width;
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return;

  const compact = compactFieldPixels(element);
  if (!compact) return;

  const desiredWidth = Math.ceil((compact.width / pxPerMm + .02) * 100) / 100;
  const desiredHeight = Math.ceil((compact.height / pxPerMm + .02) * 100) / 100;
  const width = Math.min(Math.max(1, desiredWidth), Math.max(1, physical.width - x));
  const height = Math.min(Math.max(1, desiredHeight), Math.max(1, physical.height - y));

  if (Math.abs(width - currentWidth) >= .015) setReactInputValue(widthInput, String(width));
  if (Math.abs(height - currentHeight) >= .015) setReactInputValue(heightInput, String(height));
}

export function LabelFieldCompact() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(fitSelectedField);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
      characterData: true,
    });
    document.addEventListener("pointerup", schedule, true);
    document.addEventListener("wheel", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerup", schedule, true);
      document.removeEventListener("wheel", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
