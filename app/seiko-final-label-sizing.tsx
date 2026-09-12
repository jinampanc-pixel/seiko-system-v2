"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

const LABEL_W = 50;
const LABEL_H = 25;
const BASE_CANVAS_WIDTH = 400;

function setReactInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function controlInput(page: HTMLElement, names: string[]) {
  return Array.from(page.querySelectorAll<HTMLLabelElement>(".packingInspectorBar label")).find(label => {
    const text = label.childNodes[0]?.textContent?.trim() || "";
    return names.includes(text);
  })?.querySelector<HTMLInputElement>("input") || null;
}

function selectedParts(page: HTMLElement) {
  const canvas = page.querySelector<HTMLElement>(".packingCanvas");
  const selected = canvas?.querySelector<HTMLElement>(".canvasElement.selected");
  const text = selected?.querySelector<HTMLElement>(".packingFitText");
  const font = controlInput(page, ["Font", "Text size"]);
  const width = controlInput(page, ["Width", "Box width"]);
  const height = controlInput(page, ["Height", "Box height"]);
  if (!canvas || !selected || !text || !font || !width || !height) return null;
  return { canvas, selected, text, font, width, height };
}

function targetBox(page: HTMLElement) {
  const parts = selectedParts(page);
  if (!parts) return null;
  const pt = Number(parts.font.value);
  if (!Number.isFinite(pt) || pt <= 0) return null;
  const rect = parts.canvas.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const scale = Math.max(.5, rect.width / BASE_CANVAS_WIDTH);
  const pxPerMm = rect.width / LABEL_W;
  const targetPx = pt * 1.333 * scale;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  const style = getComputedStyle(parts.text);
  context.font = `${Number.parseInt(style.fontWeight || "400", 10) >= 600 ? 700 : 400} ${targetPx}px ${style.fontFamily || "Arial"}`;
  const raw = parts.text.dataset.finalRawText || parts.text.textContent || " ";
  const lines = raw.split("\n");
  const widest = Math.max(1, ...lines.map(line => context.measureText(line || " ").width));
  const desiredW = widest / pxPerMm + .55;
  const desiredH = lines.length * targetPx * 1.08 / pxPerMm + .45;
  const x = Number.parseFloat(parts.selected.style.left || "0") / 100 * LABEL_W;
  const y = Number.parseFloat(parts.selected.style.top || "0") / 100 * LABEL_H;
  return {
    ...parts,
    targetPx,
    basePx: pt * 1.333,
    scale,
    desiredW: Math.min(Math.max(2, desiredW), Math.max(2, LABEL_W - x)),
    desiredH: Math.min(Math.max(2, desiredH), Math.max(2, LABEL_H - y)),
  };
}

function applySize(page: HTMLElement, growBox: boolean) {
  const target = targetBox(page);
  if (!target) return;
  if (growBox) {
    const currentW = Number(target.width.value) || 0;
    const currentH = Number(target.height.value) || 0;
    if (target.desiredW > currentW + .05) setReactInputValue(target.width, String(Math.round(target.desiredW * 4) / 4));
    if (target.desiredH > currentH + .05) setReactInputValue(target.height, String(Math.round(target.desiredH * 4) / 4));
  }
  requestAnimationFrame(() => {
    const refreshed = selectedParts(page);
    if (!refreshed) return;
    let px = target.targetPx;
    refreshed.text.dataset.packingBasePx = String(target.basePx);
    refreshed.text.dataset.packingScale = String(target.scale);
    refreshed.text.style.setProperty("font-size", `${px}px`, "important");
    let guard = 0;
    while ((refreshed.text.scrollWidth > refreshed.text.clientWidth + 1 || refreshed.text.scrollHeight > refreshed.text.clientHeight + 1) && px > 5 && guard < 220) {
      px -= .5;
      refreshed.text.style.setProperty("font-size", `${px}px`, "important");
      guard += 1;
    }
    refreshed.text.dataset.packingScaledPx = String(px);
  });
}

function fitBox(page: HTMLElement) {
  const target = targetBox(page);
  if (!target) return;
  setReactInputValue(target.width, String(Math.round(target.desiredW * 4) / 4));
  setReactInputValue(target.height, String(Math.round(target.desiredH * 4) / 4));
  requestAnimationFrame(() => applySize(page, false));
}

export function SeikoFinalLabelSizing() {
  useEffect(() => {
    const controller = startDomEnhancement(() => {
      const page = document.querySelector<HTMLElement>(".packingWorkflowDesigner");
      if (!page) return;
      const font = controlInput(page, ["Font", "Text size"]);
      if (font) { font.min = "4"; font.max = "96"; font.step = ".5"; }
    }, { observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] } });

    const wheel = (event: WheelEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".packingWorkflowDesigner .packingCanvas .canvasElement.selected");
      const page = element?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!element || !page) return;
      const font = controlInput(page, ["Font", "Text size"]);
      if (!font) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const step = event.shiftKey ? 2 : .5;
      const next = Math.max(4, Math.min(96, (Number(font.value) || 8) + (event.deltaY < 0 ? step : -step)));
      setReactInputValue(font, String(Math.round(next * 2) / 2));
      requestAnimationFrame(() => applySize(page, true));
    };

    const input = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const page = target?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!target || !page) return;
      const font = controlInput(page, ["Font", "Text size"]);
      if (target === font) requestAnimationFrame(() => applySize(page, true));
    };

    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".packingWorkflowDesigner .packingFitBoxButton");
      const page = button?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!button || !page) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      fitBox(page);
    };

    document.addEventListener("wheel", wheel, { capture: true, passive: false });
    document.addEventListener("input", input, true);
    document.addEventListener("click", click, true);
    return () => {
      controller.stop();
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return null;
}
