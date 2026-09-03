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
  return clone.outerHTML;
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

function askPrintCopies(selected: number, onConfirm: (copies: number) => void) {
  document.querySelector(".labelPrintCopiesDialog")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "labelPrintCopiesDialog";
  const dialog = document.createElement("section");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const title = document.createElement("h3");
  title.textContent = "Print labels";
  const meta = document.createElement("p");
  meta.textContent = `${selected} selected`;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.value = "1";
  input.setAttribute("aria-label", "Copies of each selected label");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = "Continue to print";
  const close = () => overlay.remove();
  cancel.addEventListener("click", close);
  confirm.addEventListener("click", () => {
    const copies = Math.max(1, Math.floor(Number(input.value) || 1));
    close();
    onConfirm(copies);
  });
  dialog.append(title, meta, input, cancel, confirm);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  input.focus();
  input.select();
}

function labelOnlyPrint(copies = 1) {
  const sheet = document.querySelector<HTMLElement>(".labelDesignerPage .printSheet");
  if (!sheet) { showPrintNotice("The label print sheet is not ready yet. Try Print again."); return; }
  document.querySelector<HTMLIFrameElement>("iframe.labelNativePrintFrame")?.remove();
  const frame = document.createElement("iframe");
  frame.className = "labelNativePrintFrame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const labels = [...sheet.querySelectorAll<HTMLElement>(".printedLabel")].flatMap(label => Array.from({ length: copies }, () => label));
  if (!labels.length) { frame.remove(); showPrintNotice("No selected labels are available to print."); return; }
  const preset = currentPreset();
  const pitch = preset.labelH + Math.max(0, preset.gapY || 0);
  const rows: string[] = [];
  for (let index = 0; index < labels.length; index += preset.columns) {
    const items = labels.slice(index, index + preset.columns).map(normalizedPrintedLabel).join("");
    rows.push(`<section class="printRow">${items}</section>`);
  }
  const css = `
    @page{size:${preset.rollW}mm ${pitch}mm;margin:0}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0!important;padding:0!important;width:${preset.rollW}mm!important;background:#fff!important;font-family:Arial,Helvetica,sans-serif}
    body{overflow:visible!important}
    .printRow{position:relative;width:${preset.rollW}mm;height:${pitch}mm;padding:0 ${preset.outer}mm;display:grid;grid-template-columns:repeat(${preset.columns},${preset.labelW}mm);column-gap:${preset.gapX}mm;align-items:start;break-after:page;page-break-after:always;overflow:hidden;background:#fff}
    .printRow:last-child{break-after:auto;page-break-after:auto}
    .printedLabel{position:relative!important;box-sizing:border-box!important;width:${preset.labelW}mm!important;height:${preset.labelH}mm!important;overflow:hidden!important;background:#fff!important}
    .printedElement{position:absolute!important;display:flex!important;align-items:center!important;overflow:hidden!important;padding:0!important;line-height:1.05!important;white-space:normal!important}
    .fieldName{margin-right:.25em}
    .fakeQr,.fakeQr.realQr{display:block!important;width:100%!important;height:100%!important;background:none!important;color:transparent!important;font-size:0!important;overflow:hidden!important}
    .fakeQr svg,.fakeQr.realQr svg{display:block!important;width:100%!important;height:100%!important;background:#fff!important}
    .fakeBarcode{display:grid!important;width:100%!important;height:100%!important;grid-template-rows:1fr auto}
    .fakeBarcode i{display:block;background:repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 4px,#111 4px 5px,transparent 5px 8px)}
    .fakeBarcode small{text-align:center;font:6px monospace;white-space:nowrap;color:#111}
  `;
  const doc = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!doc || !printWindow) { frame.remove(); showPrintNotice("The browser could not prepare the print preview."); return; }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>JINAM labels</title><style>${css}</style></head><body>${rows.join("")}</body></html>`);
  doc.close();
  const openNativePreview = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      showPrintNotice("The browser could not open print preview. Check browser print permissions and try again.");
    }
    window.setTimeout(() => frame.remove(), 3000);
  };
  if (doc.readyState === "complete") window.setTimeout(openNativePreview, 80);
  else frame.addEventListener("load", () => window.setTimeout(openNativePreview, 80), { once: true });
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
    const copiesRequest = () => {
      const selected = document.querySelectorAll(".labelDesignerPage .printSheet .printedLabel").length;
      askPrintCopies(selected, copies => labelOnlyPrint(copies));
    };
    document.addEventListener("click", click, true);
    window.addEventListener("jinam:label-print-copies", copiesRequest);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click, true);
      window.removeEventListener("jinam:label-print-copies", copiesRequest);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
