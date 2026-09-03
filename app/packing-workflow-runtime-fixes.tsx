"use client";

import { useEffect } from "react";

const BASE_CANVAS_WIDTH = 50 * 8;

function packageChoice(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLElement>(".packingInfoGrid .fieldChoice")).find(choice =>
    choice.querySelector("label span")?.textContent?.trim() === "Package contents"
  ) || null;
}

function relabelBoldControls(page: HTMLElement) {
  page.querySelectorAll<HTMLLabelElement>(".packingInfoGrid .fieldChoice .showName").forEach(label => {
    if (label.textContent?.trim() !== "Bold") return;
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = " Value bold";
  });
}

function ensurePackageVisibilityControl(page: HTMLElement) {
  const summary = page.querySelector<HTMLElement>(".packingPresentationSummary");
  if (!summary) return;
  const choice = packageChoice(page);
  const sourceCheckbox = choice?.querySelector<HTMLInputElement>('label input[type="checkbox"]') || null;
  if (!sourceCheckbox) return;

  let control = summary.querySelector<HTMLLabelElement>(".packingPackageVisibility");
  if (!control) {
    control = document.createElement("label");
    control.className = "packingPackageVisibility";
    control.innerHTML = '<input type="checkbox"><span>Show package contents on label</span>';
    const button = summary.querySelector("button");
    if (button) button.insertAdjacentElement("beforebegin", control);
    else summary.appendChild(control);
    control.querySelector<HTMLInputElement>("input")?.addEventListener("change", event => {
      const next = (event.currentTarget as HTMLInputElement).checked;
      const currentChoice = packageChoice(page);
      const currentCheckbox = currentChoice?.querySelector<HTMLInputElement>('label input[type="checkbox"]');
      if (currentCheckbox && currentCheckbox.checked !== next) currentCheckbox.click();
    });
  }
  const mirror = control.querySelector<HTMLInputElement>("input");
  if (mirror) mirror.checked = sourceCheckbox.checked;
}

function fitScaledPreviewText(element: HTMLElement, scale: number) {
  const inlinePx = Number.parseFloat(element.style.fontSize || "0");
  if (!Number.isFinite(inlinePx) || inlinePx <= 0) return;

  const lastScaled = Number(element.dataset.packingScaledPx || "0");
  let basePx = Number(element.dataset.packingBasePx || "0");

  if (!basePx || Math.abs(inlinePx - lastScaled) > 0.2) basePx = inlinePx;
  if (!Number.isFinite(basePx) || basePx <= 0) return;

  let scaled = basePx * scale;
  if (Math.abs(inlinePx - scaled) > 0.1) element.style.fontSize = `${scaled}px`;

  // The canvas is enlarged only for editing. Fit the enlarged text into the same
  // user rectangle; the print surface still uses the original preferred size.
  let guard = 0;
  while ((element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) && scaled > 5 && guard < 120) {
    scaled -= 0.5;
    element.style.fontSize = `${scaled}px`;
    guard += 1;
  }

  element.dataset.packingBasePx = String(basePx);
  element.dataset.packingScaledPx = String(scaled);
  element.dataset.packingScale = String(scale);
}

function applyValueBold(element: HTMLElement) {
  const text = element.textContent || "";
  const isSingleLine = !text.includes("\n");
  const separator = text.indexOf(": ");
  const alreadyApplied = element.dataset.valueBoldApplied === "true" && element.dataset.valueBoldText === text;
  const spans = element.querySelectorAll(":scope > span");

  if (alreadyApplied && spans.length === 2) {
    if (element.style.fontWeight !== "400") element.style.fontWeight = "400";
    (spans[0] as HTMLElement).style.fontWeight = "400";
    (spans[1] as HTMLElement).style.fontWeight = "700";
    return;
  }

  const weight = Number.parseInt(getComputedStyle(element).fontWeight || "400", 10);
  if (weight < 600 || !isSingleLine || separator <= 0) {
    delete element.dataset.valueBoldApplied;
    delete element.dataset.valueBoldText;
    return;
  }

  const label = text.slice(0, separator + 2);
  const value = text.slice(separator + 2);
  if (!value) return;

  element.textContent = "";
  element.style.fontWeight = "400";
  const name = document.createElement("span");
  name.textContent = label;
  name.style.fontWeight = "400";
  const valueSpan = document.createElement("span");
  valueSpan.textContent = value;
  valueSpan.style.fontWeight = "700";
  element.append(name, valueSpan);
  element.dataset.valueBoldApplied = "true";
  element.dataset.valueBoldText = text;
}

function enhancePackingPage(page: HTMLElement) {
  relabelBoldControls(page);
  ensurePackageVisibilityControl(page);

  const canvas = page.querySelector<HTMLElement>(".packingCanvas");
  if (canvas) {
    const scale = Math.max(0.5, canvas.getBoundingClientRect().width / BASE_CANVAS_WIDTH);
    canvas.querySelectorAll<HTMLElement>(".packingFitText").forEach(element => {
      applyValueBold(element);
      fitScaledPreviewText(element, scale);
    });
  }

  page.querySelectorAll<HTMLElement>(".printSheet .packingFitText").forEach(applyValueBold);
}

export function PackingWorkflowRuntimeFixes() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(".packingWorkflowDesigner").forEach(enhancePackingPage);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };

    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "checked", "value"] });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
