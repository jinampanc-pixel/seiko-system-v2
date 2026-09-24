"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

type ExtraKind = "text" | "sequence" | "qr" | "barcode";
type ExtraElement = { id: string; kind: ExtraKind; value: string; x: number; y: number; w: number; h: number; font: number };
type DragState = { id: string; startX: number; startY: number; x: number; y: number } | null;

const LABEL_W = 50;
const LABEL_H = 25;
const BASE_CANVAS_W = 400;
let extraDrag: DragState = null;
let selectedExtraId = "";

function currentBusiness() {
  return new URLSearchParams(window.location.search).get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}
function currentOrderId() { return new URLSearchParams(window.location.search).get("order") || "current"; }
function extraKey() { return `jinam:${currentBusiness()}:packing-extras:${currentOrderId()}`; }
function readExtras(): ExtraElement[] {
  try {
    const value = JSON.parse(localStorage.getItem(extraKey()) || "[]");
    return Array.isArray(value) ? value as ExtraElement[] : [];
  } catch { return []; }
}
function writeExtras(items: ExtraElement[]) { localStorage.setItem(extraKey(), JSON.stringify(items)); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function setReactInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
function labelOf(label: HTMLLabelElement) {
  return label.childNodes[0]?.textContent?.trim() || label.querySelector("span")?.textContent?.trim() || "";
}
function inspectorInput(page: HTMLElement, names: string[]) {
  return Array.from(page.querySelectorAll<HTMLLabelElement>(".packingInspectorBar label,.packingSelectedControls label"))
    .find(label => names.includes(labelOf(label)))?.querySelector<HTMLInputElement>("input") || null;
}
function selectedNative(page: HTMLElement) {
  const canvas = page.querySelector<HTMLElement>(".packingCanvas");
  const selected = canvas?.querySelector<HTMLElement>(".canvasElement.selected:not(.finalPackingExtra)");
  const text = selected?.querySelector<HTMLElement>(".packingFitText");
  const font = inspectorInput(page, ["Font", "Text size"]);
  const width = inspectorInput(page, ["Width", "Box width"]);
  const height = inspectorInput(page, ["Height", "Box height"]);
  return canvas && selected && text && font && width && height ? { canvas, selected, text, font, width, height } : null;
}
function measuredNative(page: HTMLElement, targetPt: number) {
  const parts = selectedNative(page); if (!parts) return null;
  const rect = parts.canvas.getBoundingClientRect(); if (!rect.width) return null;
  const targetPx = targetPt * (96 / 72) * (rect.width / BASE_CANVAS_W);
  const pxPerMm = rect.width / LABEL_W;
  const raw = parts.text.dataset.finalRawText || parts.text.textContent || " ";
  const lines = raw.split("\n");
  const context = document.createElement("canvas").getContext("2d"); if (!context) return null;
  const style = getComputedStyle(parts.text);
  context.font = `${Number.parseInt(style.fontWeight || "400", 10) >= 600 ? 700 : 400} ${targetPx}px ${style.fontFamily || "Arial"}`;
  const widest = Math.max(1, ...lines.map(line => context.measureText(line || " ").width));
  return { ...parts, targetPx, desiredW: widest / pxPerMm + .7, desiredH: lines.length * targetPx * 1.08 / pxPerMm + .55 };
}
function enforceNativeText(page: HTMLElement) {
  const parts = selectedNative(page); if (!parts) return;
  const pt = clamp(Number(parts.font.value) || 8, 4, 40);
  const rect = parts.canvas.getBoundingClientRect(); if (!rect.width) return;
  const key = `${parts.selected.dataset.itemId || "selected"}|${pt}|${Math.round(rect.width)}`;
  if (parts.text.dataset.reviewFontKey === key) return;
  let px = pt * (96 / 72) * (rect.width / BASE_CANVAS_W);
  parts.text.style.setProperty("font-size", `${px}px`, "important");
  parts.text.style.setProperty("line-height", "1.04", "important");
  let guard = 0;
  while ((parts.text.scrollWidth > parts.text.clientWidth + 1 || parts.text.scrollHeight > parts.text.clientHeight + 1) && px > 6 && guard < 240) {
    px -= .5;
    parts.text.style.setProperty("font-size", `${px}px`, "important");
    guard += 1;
  }
  parts.text.dataset.reviewFontKey = key;
}
function tightenNativeArea(page: HTMLElement) {
  const parts = selectedNative(page); if (!parts) return;
  const pt = clamp(Number(parts.font.value) || 8, 4, 40);
  const measured = measuredNative(page, pt); if (!measured) return;
  setReactInput(measured.width, String(Math.round(clamp(measured.desiredW, 2, 50) * 4) / 4));
  setReactInput(measured.height, String(Math.round(clamp(measured.desiredH, 2, 25) * 4) / 4));
  window.setTimeout(() => {
    const fresh = selectedNative(page);
    if (fresh) delete fresh.text.dataset.reviewFontKey;
    enforceNativeText(page);
  }, 0);
}
function orderNo(page: HTMLElement) {
  return (page.querySelector(".labelTopbar .eyebrow")?.textContent || "").replace(/^ORDER\s+/i, "").split("·")[0]?.trim() || "ORDER";
}
function previewPosition(page: HTMLElement) {
  const select = page.querySelector<HTMLSelectElement>(".labelPreviewSample select");
  const total = select?.options.length || page.querySelectorAll(".labelSidebar .record").length || 1;
  return { index: Math.max(0, select?.selectedIndex || 0), total };
}
function extraText(extra: ExtraElement, page: HTMLElement, index?: number, total?: number) {
  const pos = index === undefined ? previewPosition(page) : { index, total: total || 1 };
  if (extra.kind === "sequence") return `${pos.index + 1} of ${pos.total}`;
  if (extra.kind === "qr" || extra.kind === "barcode") return `${orderNo(page)}:${pos.index + 1}`;
  return extra.value;
}
function renderExtraContent(node: HTMLElement, extra: ExtraElement, page: HTMLElement, index?: number, total?: number) {
  const value = extraText(extra, page, index, total);
  node.replaceChildren();
  if (extra.kind === "qr") {
    const qr = document.createElement("span");
    qr.className = "fakeQr";
    qr.setAttribute("aria-label", `QR ${value}`);
    qr.textContent = "▦";
    node.appendChild(qr);
    return;
  }
  if (extra.kind === "barcode") {
    const barcode = document.createElement("span");
    barcode.className = "fakeBarcode";
    const bars = document.createElement("i");
    const small = document.createElement("small");
    small.textContent = value;
    barcode.append(bars, small);
    node.appendChild(barcode);
    return;
  }
  node.textContent = value;
}
function extrasSignature(page: HTMLElement) {
  const pos = previewPosition(page);
  const printed = page.querySelectorAll(".printSheet .printedLabel").length;
  return `${JSON.stringify(readExtras())}|${selectedExtraId}|${pos.index}|${pos.total}|${printed}`;
}
function renderExtras(page: HTMLElement, force = false) {
  const canvas = page.querySelector<HTMLElement>(".packingCanvas"); if (!canvas) return;
  const signature = extrasSignature(page);
  if (!force && canvas.dataset.reviewExtrasSignature === signature) return;
  canvas.dataset.reviewExtrasSignature = signature;
  const extras = readExtras();
  canvas.querySelectorAll(".finalPackingExtra").forEach(node => node.remove());
  extras.forEach(extra => {
    const node = document.createElement("div");
    node.className = `canvasElement finalPackingExtra finalExtra-${extra.kind}${selectedExtraId === extra.id ? " selected" : ""}`;
    node.dataset.extraId = extra.id;
    node.style.left = `${extra.x / LABEL_W * 100}%`;
    node.style.top = `${extra.y / LABEL_H * 100}%`;
    node.style.width = `${extra.w / LABEL_W * 100}%`;
    node.style.height = `${extra.h / LABEL_H * 100}%`;
    node.style.fontSize = `${extra.font * (96 / 72) * (canvas.getBoundingClientRect().width / BASE_CANVAS_W)}px`;
    renderExtraContent(node, extra, page);
    const handle = document.createElement("span");
    handle.className = "finalExtraResize";
    handle.setAttribute("aria-hidden", "true");
    node.appendChild(handle);
    canvas.appendChild(node);
  });
  const labels = [...page.querySelectorAll<HTMLElement>(".printSheet .printedLabel")];
  labels.forEach((label, index) => {
    label.querySelectorAll(".finalPrintExtra").forEach(node => node.remove());
    extras.forEach(extra => {
      const node = document.createElement("div");
      node.className = `printedElement finalPrintExtra ${extra.kind === "sequence" ? "element-sequence" : extra.kind === "text" ? "element-text" : ""}`;
      node.style.left = `${extra.x}mm`;
      node.style.top = `${extra.y}mm`;
      node.style.width = `${extra.w}mm`;
      node.style.height = `${extra.h}mm`;
      if (extra.kind === "text" || extra.kind === "sequence") node.style.fontSize = `${extra.font}pt`;
      renderExtraContent(node, extra, page, index, labels.length);
      label.appendChild(node);
    });
  });
}
function ensureExtraInspector(page: HTMLElement, force = false) {
  const existing = page.querySelector<HTMLElement>(".finalExtraInspector");
  if (!selectedExtraId) { existing?.remove(); return; }
  if (!force && existing?.dataset.extraId === selectedExtraId) return;
  existing?.remove();
  const extra = readExtras().find(item => item.id === selectedExtraId); if (!extra) return;
  const toolbar = page.querySelector<HTMLElement>(".canvasToolbar"); if (!toolbar) return;
  const panel = document.createElement("div");
  panel.className = "finalExtraInspector";
  panel.dataset.extraId = extra.id;
  panel.innerHTML = `<b>${extra.kind === "text" ? "Fixed text" : extra.kind === "sequence" ? "Sequence" : extra.kind === "qr" ? "QR code" : "Barcode"}</b>${extra.kind === "text" || extra.kind === "sequence" ? `<label>Text size <input data-extra-control="font" type="number" min="4" max="40" step=".5" value="${extra.font}"></label>` : ""}<label>Width <input data-extra-control="width" type="number" min="2" max="50" step=".25" value="${extra.w}"></label><label>Height <input data-extra-control="height" type="number" min="2" max="25" step=".25" value="${extra.h}"></label><button type="button" class="secondary finalExtraDelete">Remove</button>`;
  panel.querySelectorAll<HTMLInputElement>("input[data-extra-control]").forEach(input => input.addEventListener("change", () => {
    const control = input.dataset.extraControl;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    writeExtras(readExtras().map(item => item.id === extra.id ? {
      ...item,
      ...(control === "font" ? { font: clamp(value, 4, 40) } : {}),
      ...(control === "width" ? { w: clamp(value, 2, LABEL_W - item.x) } : {}),
      ...(control === "height" ? { h: clamp(value, 2, LABEL_H - item.y) } : {}),
    } : item));
    renderExtras(page, true);
    ensureExtraInspector(page, true);
  }));
  panel.querySelector(".finalExtraDelete")?.addEventListener("click", () => {
    writeExtras(readExtras().filter(item => item.id !== extra.id));
    selectedExtraId = "";
    renderExtras(page, true);
    ensureExtraInspector(page, true);
  });
  toolbar.insertAdjacentElement("afterend", panel);
}
function addExtra(page: HTMLElement, kind: ExtraKind) {
  let value = "";
  if (kind === "text") {
    value = window.prompt("Fixed text to print on this label:", "")?.trim() || "";
    if (!value) return;
  }
  const extra: ExtraElement = {
    id: crypto.randomUUID(), kind, value,
    x: kind === "qr" ? 39 : 3,
    y: kind === "barcode" ? 19 : 14,
    w: kind === "qr" ? 9 : kind === "barcode" ? 32 : 16,
    h: kind === "qr" ? 9 : kind === "barcode" ? 4 : 4,
    font: 7,
  };
  writeExtras([...readExtras(), extra]);
  selectedExtraId = extra.id;
  renderExtras(page, true);
  ensureExtraInspector(page, true);
}
function clickInfoChoice(page: HTMLElement, label: string) {
  const choice = Array.from(page.querySelectorAll<HTMLElement>(".packingInfoGrid .fieldChoice"))
    .find(node => node.querySelector("label span")?.textContent?.trim() === label);
  choice?.querySelector<HTMLInputElement>('label input[type="checkbox"]')?.click();
}
function ensureTraceTools(page: HTMLElement) {
  const host = page.querySelector<HTMLElement>(".finalTraceTools"); if (!host || host.dataset.reviewReady) return;
  host.dataset.reviewReady = "true";
  host.innerHTML = '<p class="eyebrow">TRACE & CODES</p><p>Add trace information here without leaving this packing-label workspace.</p><div class="finalTraceGrid"><button type="button" data-tool="number">Label number</button><button type="button" data-tool="order">Order number</button><button type="button" data-tool="sequence">Sequence</button><button type="button" data-tool="text">Fixed text</button><button type="button" data-tool="qr">QR code</button><button type="button" data-tool="barcode">Barcode</button></div>';
  host.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(button => button.addEventListener("click", () => {
    const tool = button.dataset.tool || "";
    if (tool === "number") clickInfoChoice(page, "Label number / total");
    else if (tool === "order") clickInfoChoice(page, "Order number");
    else addExtra(page, tool as ExtraKind);
  }));
}
function stabilizeMenu() {
  document.querySelectorAll<HTMLElement>(".moduleMenu").forEach(menu => {
    if (!menu.classList.contains("reviewStableMenu")) menu.classList.add("reviewStableMenu");
  });
}
function stabilizeOrderCenter() {
  document.querySelectorAll<HTMLElement>(".ordersPage").forEach(page => {
    const head = page.querySelector<HTMLElement>(".orderCenterHead"); if (!head) return;
    const back = head.querySelector<HTMLButtonElement>(".finalSessionBack");
    if (back && !page.querySelector(".reviewOrderBackRow")) {
      const row = document.createElement("div");
      row.className = "reviewOrderBackRow";
      head.insertAdjacentElement("beforebegin", row);
      row.appendChild(back);
    }
    if (!head.classList.contains("reviewOrderHead")) head.classList.add("reviewOrderHead");
  });
}
function stabilizeHome() {
  document.querySelectorAll<HTMLElement>(".seikoOperationalDashboard").forEach(page => {
    const button = Array.from(page.querySelectorAll<HTMLButtonElement>("button")).find(node => node.textContent?.trim() === "Customize dashboard");
    if (!button) return;
    let footer = page.querySelector<HTMLElement>(".reviewDashboardFooter");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "reviewDashboardFooter";
      page.appendChild(footer);
    }
    if (button.parentElement !== footer) footer.appendChild(button);
  });
}
function stabilizePacking(page: HTMLElement) {
  const font = inspectorInput(page, ["Font", "Text size"]);
  if (font) { font.min = "4"; font.max = "40"; font.step = ".5"; }
  const fit = page.querySelector<HTMLButtonElement>(".packingFitBoxButton");
  if (fit && !fit.dataset.reviewReady) {
    fit.dataset.reviewReady = "true";
    fit.textContent = "Tighten area";
    fit.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => tightenNativeArea(page), 0);
    }, true);
  }
  const selected = selectedNative(page);
  if (selected) {
    const sig = `${selected.selected.dataset.itemId || ""}|${selected.font.value}|${Math.round(selected.canvas.getBoundingClientRect().width)}`;
    if (page.dataset.reviewNativeSignature !== sig) {
      page.dataset.reviewNativeSignature = sig;
      delete selected.text.dataset.reviewFontKey;
      enforceNativeText(page);
    }
  } else delete page.dataset.reviewNativeSignature;
  ensureTraceTools(page);
  renderExtras(page);
  ensureExtraInspector(page);
}

export function SeikoReviewStabilization() {
  useEffect(() => {
    const controller = startDomEnhancement(() => {
      stabilizeMenu();
      stabilizeOrderCenter();
      stabilizeHome();
      const page = document.querySelector<HTMLElement>(".packingWorkflowDesigner");
      if (page) stabilizePacking(page);
    }, { observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "value", "open"] } });

    const wheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      const page = target?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!page) return;
      const extraNode = target?.closest<HTMLElement>(".finalPackingExtra");
      if (extraNode) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        const id = extraNode.dataset.extraId || "";
        const step = event.shiftKey ? 2 : .5;
        writeExtras(readExtras().map(item => item.id === id ? { ...item, font: clamp(item.font + (event.deltaY < 0 ? step : -step), 4, 40) } : item));
        selectedExtraId = id;
        renderExtras(page, true);
        ensureExtraInspector(page, true);
        return;
      }
      const native = target?.closest<HTMLElement>(".packingCanvas .canvasElement.selected:not(.finalPackingExtra)");
      if (!native) return;
      const font = inspectorInput(page, ["Font", "Text size"]); if (!font) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const step = event.shiftKey ? 2 : .5;
      const next = clamp((Number(font.value) || 8) + (event.deltaY < 0 ? step : -step), 4, 40);
      setReactInput(font, String(Math.round(next * 2) / 2));
      window.setTimeout(() => {
        tightenNativeArea(page);
        const fresh = selectedNative(page);
        if (fresh) delete fresh.text.dataset.reviewFontKey;
        enforceNativeText(page);
      }, 0);
    };
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const node = target?.closest<HTMLElement>(".finalPackingExtra");
      if (!node) return;
      const page = node.closest<HTMLElement>(".packingWorkflowDesigner");
      const canvas = node.closest<HTMLElement>(".packingCanvas");
      if (!page || !canvas) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const id = node.dataset.extraId || "";
      const extra = readExtras().find(item => item.id === id); if (!extra) return;
      selectedExtraId = id;
      extraDrag = { id, startX: event.clientX, startY: event.clientY, x: extra.x, y: extra.y };
      renderExtras(page, true);
      ensureExtraInspector(page, true);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!extraDrag) return;
      const page = document.querySelector<HTMLElement>(".packingWorkflowDesigner");
      const canvas = page?.querySelector<HTMLElement>(".packingCanvas");
      if (!page || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const extra = readExtras().find(item => item.id === extraDrag!.id); if (!extra) return;
      const dx = (event.clientX - extraDrag.startX) * LABEL_W / rect.width;
      const dy = (event.clientY - extraDrag.startY) * LABEL_H / rect.height;
      const x = Math.round(clamp(extraDrag.x + dx, 0, LABEL_W - extra.w) * 4) / 4;
      const y = Math.round(clamp(extraDrag.y + dy, 0, LABEL_H - extra.h) * 4) / 4;
      writeExtras(readExtras().map(item => item.id === extra.id ? { ...item, x, y } : item));
      renderExtras(page, true);
    };
    const pointerUp = () => { extraDrag = null; };
    const input = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const page = target?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!target || !page) return;
      if (target === inspectorInput(page, ["Font", "Text size"])) {
        window.setTimeout(() => {
          tightenNativeArea(page);
          const fresh = selectedNative(page);
          if (fresh) delete fresh.text.dataset.reviewFontKey;
          enforceNativeText(page);
        }, 0);
      }
    };
    document.addEventListener("wheel", wheel, { capture: true, passive: false });
    document.addEventListener("pointerdown", pointerDown, true);
    window.addEventListener("pointermove", pointerMove, true);
    window.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("input", input, true);
    return () => {
      controller.stop();
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("pointermove", pointerMove, true);
      window.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("input", input, true);
    };
  }, []);
  return null;
}
