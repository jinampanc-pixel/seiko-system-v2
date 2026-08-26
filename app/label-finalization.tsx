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
  const select = document.querySelector<HTMLSelectElement>(".labelDesignerPage .labelSetup label:nth-of-type(3) select");
  if (!select || select.value === DEFAULT_PRESET.id) return DEFAULT_PRESET;
  try {
    const businessId = activeBusiness();
    const presets = JSON.parse(localStorage.getItem(`jinam:${businessId}:labels:presets-v1`) || "[]") as Preset[];
    return presets.find(preset => preset.id === select.value) || DEFAULT_PRESET;
  } catch { return DEFAULT_PRESET; }
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
  });
}

function labelOnlyPrint() {
  const sheet = document.querySelector<HTMLElement>(".labelDesignerPage .printSheet");
  if (!sheet) return;
  const popup = window.open("", "_blank", "width=980,height=760");
  if (!popup) { window.alert("Allow pop-ups for this site so the label print window can open."); return; }
  popup.document.open();
  popup.document.write("<!doctype html><html><head><title>Preparing labels…</title></head><body>Preparing labels…</body></html>");
  popup.document.close();

  window.setTimeout(() => {
    const labels = [...sheet.querySelectorAll<HTMLElement>(".printedLabel")];
    const preset = currentPreset();
    const pitch = preset.labelH + Math.max(0, preset.gapY || 0);
    const rows: string[] = [];
    for (let index = 0; index < labels.length; index += preset.columns) {
      const items = labels.slice(index, index + preset.columns).map(label => label.outerHTML).join("");
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
      .printedElement{position:absolute!important;display:flex!important;align-items:center!important;overflow:hidden!important;padding:0!important;line-height:1.05}
      .fieldName{margin-right:.25em}
      .fakeQr,.fakeQr.realQr{display:block!important;width:100%!important;height:100%!important;background:none!important;color:transparent!important;font-size:0!important;overflow:hidden!important}
      .fakeQr svg,.fakeQr.realQr svg{display:block!important;width:100%!important;height:100%!important;background:#fff!important}
      .fakeBarcode{display:grid!important;width:100%!important;height:100%!important;grid-template-rows:1fr auto}
      .fakeBarcode i{display:block;background:repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 4px,#111 4px 5px,transparent 5px 8px)}
      .fakeBarcode small{text-align:center;font:6px monospace;white-space:nowrap;color:#111}
    `;
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head><body>${rows.join("")}</body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 120);
  }, 40);
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
    observer.observe(document.body, { childList: true, subtree: true });
    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".labelDesignerPage .labelTopbar .primary");
      if (!button || button.disabled || !/^Print\b/i.test(button.textContent || "")) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      labelOnlyPrint();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("resize", schedule);
    return () => { observer.disconnect(); document.removeEventListener("click", click, true); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
