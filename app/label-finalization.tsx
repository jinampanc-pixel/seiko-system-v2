"use client";

import { useEffect } from "react";

type OrderSummary = {
  orderId?: string;
  archived?: boolean;
  details?: {
    orderNo?: string;
    clientName?: string;
    contactPerson?: string;
    contactNumber?: string;
  };
};
type Preset = { id: string; name: string; labelW: number; labelH: number; rollW: number; columns: number; outer: number; gapX: number; gapY: number };

const DEFAULT_PRESET: Preset = { id: "pixra-109", name: "109 mm roll · 2 × 50 × 25", labelW: 50, labelH: 25, rollW: 109, columns: 2, outer: 3, gapX: 3, gapY: 3 };
const CSS_PX_PER_PT = 96 / 72;
const MM_PER_PT = 25.4 / 72;

function activeBusiness() {
  const params = new URLSearchParams(window.location.search);
  return params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}
function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
function orderData(businessId: string): OrderSummary[] {
  try {
    const rows = JSON.parse(localStorage.getItem(`jinam:${businessId}:orders-v1`) || "[]") as OrderSummary[];
    return rows.filter(order => !order.archived);
  } catch { return []; }
}
function enhanceOrderSearch() {
  const select = document.querySelector<HTMLSelectElement>(".labelCreateOrderChoice .labelCreateField:first-child select");
  if (!select || select.dataset.searchReady) return;
  select.dataset.searchReady = "true";
  select.classList.add("labelOrderNativeSelect");
  const businessId = activeBusiness();
  const orders = orderData(businessId);
  const byId = new Map(orders.map(order => [String(order.orderId || ""), order]));
  const wrapper = document.createElement("div");
  wrapper.className = "labelOrderSearch";
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.placeholder = "Search order, client, Attn or phone";
  input.setAttribute("aria-label", "Search orders by order number, client, attention name or phone number");
  const results = document.createElement("div");
  results.className = "labelOrderSearchResults";
  results.hidden = true;
  wrapper.append(input, results);
  select.insertAdjacentElement("afterend", wrapper);

  const labelFor = (order: OrderSummary | undefined, fallback = "") => order ? `${order.details?.orderNo || "Order"} — ${order.details?.clientName || "Unnamed client"}` : fallback;
  const syncFromSelect = () => {
    const option = select.options[select.selectedIndex];
    input.value = select.value ? labelFor(byId.get(select.value), option?.textContent || "") : "";
  };
  const render = (query: string) => {
    const term = query.trim().toLowerCase();
    const matches = orders.filter(order => {
      const d = order.details || {};
      const haystack = [d.orderNo, d.clientName, d.contactPerson, d.contactNumber].filter(Boolean).join(" ").toLowerCase();
      return !term || haystack.includes(term);
    }).slice(0, 12);
    results.replaceChildren();
    for (const order of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "labelOrderSearchResult";
      const title = document.createElement("b");
      title.textContent = labelFor(order);
      const meta = document.createElement("small");
      const details = [order.details?.contactPerson && `Attn: ${order.details.contactPerson}`, order.details?.contactNumber && `Phone: ${order.details.contactNumber}`].filter(Boolean);
      meta.textContent = details.join(" · ") || "No contact details saved";
      button.append(title, meta);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => {
        const id = String(order.orderId || "");
        setNativeSelectValue(select, id);
        input.value = labelFor(order);
        results.hidden = true;
      });
      results.appendChild(button);
    }
    if (!matches.length) {
      const empty = document.createElement("p"); empty.className = "labelOrderSearchEmpty"; empty.textContent = "No matching orders"; results.appendChild(empty);
    }
    results.hidden = false;
  };
  input.addEventListener("focus", () => render(input.value.includes(" — ") ? "" : input.value));
  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", event => { if (event.key === "Escape") { results.hidden = true; input.blur(); } });
  select.addEventListener("change", syncFromSelect);
  document.addEventListener("pointerdown", event => { if (!wrapper.contains(event.target as Node)) results.hidden = true; });
  syncFromSelect();
}

function markProductionWorkspaceFields() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage .fieldChoice").forEach(choice => {
    const label = choice.querySelector("label span")?.textContent?.trim() || "";
    const reportOnly = /^(Package contents|Cutting bundle summary|Resolved size|Calculated quantity|Number of people|Number of variations)$/i.test(label);
    choice.dataset.productionWorkspace = reportOnly ? "false" : "true";
  });
}

function currentPreset(): Preset {
  const triggerText = document.querySelector<HTMLElement>(".labelDesignerPage .managedSizeTrigger span")?.textContent || "";
  try {
    const businessId = activeBusiness();
    const presets = [DEFAULT_PRESET, ...(JSON.parse(localStorage.getItem(`jinam:${businessId}:labels:presets-v1`) || "[]") as Preset[])];
    return presets.find(preset => preset.name === triggerText) || DEFAULT_PRESET;
  } catch { return DEFAULT_PRESET; }
}

function syncPreviewTypography(canvas: HTMLElement, labelWidthMm: number) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !labelWidthMm) return;
  const actualPxPerMm = rect.width / labelWidthMm;
  canvas.style.setProperty("--label-mm-px", String(actualPxPerMm) + "px");
  canvas.querySelectorAll<HTMLElement>(".canvasElement.element-text,.canvasElement.element-field,.canvasElement.element-sequence").forEach(element => {
    const directPt = Number.parseFloat(element.dataset.fontPt || "0");
    const fallbackPx = Number.parseFloat(element.style.fontSize || "0");
    const pointSize = directPt || (fallbackPx ? fallbackPx / CSS_PX_PER_PT : 0);
    if (!pointSize) return;
    const responsivePx = pointSize * MM_PER_PT * actualPxPerMm;
    element.style.fontSize = String(responsivePx) + "px";
    element.style.lineHeight = "1.05";
  });
}
function ensureCanvasRatio() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage .labelCanvasPanel").forEach(panel => {
    const canvas = panel.querySelector<HTMLElement>(".labelCanvas");
    const title = panel.querySelector(".canvasToolbar b")?.textContent || "";
    if (!canvas) return;
    const match = title.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*mm/i);
    const width = Number(match?.[1]) || 50;
    const height = Number(match?.[2]) || 25;
    canvas.style.setProperty("--final-label-ratio", `${width} / ${height}`);
    canvas.dataset.finalRatioReady = "true";
    syncPreviewTypography(canvas, width);
  });
}

function normalizedPrintedLabel(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>(".printedElement.element-text,.printedElement.element-field,.printedElement.element-sequence").forEach(element => {
    const logicalFont = Number.parseFloat(element.style.fontSize || "0");
    if (!logicalFont) return;
    const physicalFontMm = logicalFont * MM_PER_PT;
    element.style.fontSize = `${physicalFontMm}mm`;
    element.style.lineHeight = "1.05";
  });
  return clone;
}

function showPrintNotice(message: string) {
  document.querySelector(".labelPrintNotice")?.remove();
  const note = document.createElement("div");
  note.className = "labelPrintNotice";
  note.setAttribute("role", "status");
  note.textContent = message;
  document.body.appendChild(note);
  window.setTimeout(() => note.remove(), 5200);
}

function removeNativePrintSurface() {
  document.documentElement.classList.remove("jinamLabelPrinting");
  document.querySelector(".labelNativePrintRoot")?.remove();
  document.querySelector("#jinam-label-native-print-style")?.remove();
}

function labelOnlyPrint(copies = 1) {
  const sheet = document.querySelector<HTMLElement>(".labelDesignerPage .printSheet");
  if (!sheet) { showPrintNotice("The label print sheet is not ready yet. Try Print again."); return; }
  removeNativePrintSurface();

  const sourceLabels = [...sheet.querySelectorAll<HTMLElement>(".printedLabel")];
  const labels = sourceLabels.flatMap(label => Array.from({ length: copies }, () => normalizedPrintedLabel(label)));
  if (!labels.length) { showPrintNotice("No selected labels are available to print."); return; }

  const preset = currentPreset();
  const pitch = preset.labelH + Math.max(0, preset.gapY || 0);
  const root = document.createElement("main");
  root.className = "labelNativePrintRoot";
  root.setAttribute("aria-hidden", "true");
  for (let index = 0; index < labels.length; index += preset.columns) {
    const row = document.createElement("section");
    row.className = "labelNativePrintRow";
    labels.slice(index, index + preset.columns).forEach(label => row.appendChild(label));
    root.appendChild(row);
  }

  const style = document.createElement("style");
  style.id = "jinam-label-native-print-style";
  style.textContent = `
    @page{size:${preset.rollW}mm ${pitch}mm;margin:0}
    @media screen{.labelNativePrintRoot{position:fixed;left:-200vw;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none}}
    @media print{
      html,body{margin:0!important;padding:0!important;background:#fff!important;width:${preset.rollW}mm!important}
      html.jinamLabelPrinting body *{visibility:hidden!important}
      html.jinamLabelPrinting .labelNativePrintRoot,html.jinamLabelPrinting .labelNativePrintRoot *{visibility:visible!important}
      .labelNativePrintRoot{position:absolute!important;left:0!important;top:0!important;width:${preset.rollW}mm!important;margin:0!important;padding:0!important;background:#fff!important;font-family:Arial,Helvetica,sans-serif!important}
      .labelNativePrintRow{position:relative!important;width:${preset.rollW}mm!important;height:${pitch}mm!important;padding:0 ${preset.outer}mm!important;display:grid!important;grid-template-columns:repeat(${preset.columns},${preset.labelW}mm)!important;column-gap:${preset.gapX}mm!important;align-items:start!important;break-after:page!important;page-break-after:always!important;overflow:hidden!important;background:#fff!important}
      .labelNativePrintRow:last-child{break-after:auto!important;page-break-after:auto!important}
      .printedLabel{position:relative!important;box-sizing:border-box!important;width:${preset.labelW}mm!important;height:${preset.labelH}mm!important;overflow:hidden!important;background:#fff!important}
      .printedElement{position:absolute!important;display:flex!important;align-items:center!important;overflow:hidden!important;padding:0!important;margin:0!important;line-height:1.05!important;white-space:normal!important}
      .fieldName{margin-right:.25em!important}
      .fakeQr,.fakeQr.realQr{display:block!important;width:100%!important;height:100%!important;background:none!important;color:transparent!important;font-size:0!important;overflow:hidden!important}
      .fakeQr svg,.fakeQr.realQr svg{display:block!important;width:100%!important;height:100%!important;background:#fff!important}
      .fakeBarcode{display:grid!important;width:100%!important;height:100%!important;grid-template-rows:1fr auto!important}
      .fakeBarcode i{display:block!important;background:repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 4px,#111 4px 5px,transparent 5px 8px)!important}
      .fakeBarcode small{text-align:center!important;font:6px monospace!important;white-space:nowrap!important;color:#111!important}
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(root);
  document.documentElement.classList.add("jinamLabelPrinting");

  const cleanup = () => {
    window.removeEventListener("afterprint", cleanup);
    removeNativePrintSurface();
  };
  window.addEventListener("afterprint", cleanup, { once: true });

  try {
    window.print();
  } catch {
    cleanup();
    showPrintNotice("The browser could not open print preview. Check browser print permissions and try again.");
  }
}

function askPrintCopies(selected: number, onConfirm: (copies: number) => void) {
  const raw = window.prompt(`Copies of each selected label (${selected} selected)`, "1");
  if (raw === null) return;
  const copies = Math.max(1, Math.min(99, Math.floor(Number(raw) || 1)));
  onConfirm(copies);
}

export function labelPrintCopiesDialog(selected: number) {
  askPrintCopies(selected, copies => labelOnlyPrint(copies));
}

export function LabelFinalization() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      enhanceOrderSearch();
      markProductionWorkspaceFields();
      ensureCanvasRatio();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };
    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".labelDesignerPage .labelTopbar .primary");
      if (!button || button.disabled || !/^Print\b/i.test(button.textContent || "")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      labelOnlyPrint(1);
    };
    document.addEventListener("click", click, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      window.removeEventListener("resize", schedule);
      removeNativePrintSurface();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
