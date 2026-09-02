"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

type Preset = {
  id: string;
  name: string;
  labelW: number;
  labelH: number;
  rollW: number;
  columns: number;
  outer: number;
  gapX: number;
  gapY: number;
};

const DEFAULT_PRESET: Preset = {
  id: "pixra-109",
  name: "109 mm roll · 2 × 50 × 25",
  labelW: 50,
  labelH: 25,
  rollW: 109,
  columns: 2,
  outer: 3,
  gapX: 3,
  gapY: 3,
};

function activeBusiness() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function currentPreset(): Preset {
  const page = document.querySelector<HTMLElement>(".labelDesignerPage");
  const triggerText = page?.querySelector<HTMLElement>(".managedSizeTrigger span")?.textContent?.trim() || "";
  const title = page?.querySelector<HTMLElement>(".canvasToolbar b")?.textContent || "";
  const match = title.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*mm/i);
  const labelW = Number(match?.[1]) || DEFAULT_PRESET.labelW;
  const labelH = Number(match?.[2]) || DEFAULT_PRESET.labelH;

  try {
    const stored = JSON.parse(localStorage.getItem(`jinam:${activeBusiness()}:labels:presets-v1`) || "[]") as Preset[];
    const found = [DEFAULT_PRESET, ...stored].find(preset => preset.name === triggerText);
    if (found) return found;
  } catch { /* use the visible label dimensions below */ }

  return { ...DEFAULT_PRESET, labelW, labelH };
}

function pagerButton(root: HTMLElement, label: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.trim() === label);
}

function pagerSpan(root: HTMLElement, prefix: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(":scope > span"))
    .find(span => span.textContent?.trim().startsWith(prefix));
}

function syncWorkspacePagers() {
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => {
    const bottom = page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)");
    const top = page.querySelector<HTMLElement>(":scope > .workspaceTools .workspacePagerTop");
    if (!bottom || !top) return;

    for (const label of ["Previous", "Next"]) {
      const source = pagerButton(bottom, label);
      const proxy = pagerButton(top, label);
      if (source && proxy && proxy.disabled !== source.disabled) proxy.disabled = source.disabled;
    }

    for (const prefix of ["Showing ", "Page "]) {
      const source = pagerSpan(bottom, prefix);
      const proxy = pagerSpan(top, prefix);
      if (source && proxy && proxy.textContent !== source.textContent) proxy.textContent = source.textContent;
    }
  });
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

function buildPrintPortal(copies: number) {
  document.querySelector("#seikoLabelPrintPortal")?.remove();
  document.querySelector("#seikoLabelRuntimePrintStyle")?.remove();

  const sourceSheet = document.querySelector<HTMLElement>(".labelDesignerPage .printSheet");
  const sourceLabels = sourceSheet ? Array.from(sourceSheet.querySelectorAll<HTMLElement>(".printedLabel")) : [];
  if (!sourceLabels.length) {
    showPrintNotice("Select at least one label before printing.");
    return null;
  }

  const preset = currentPreset();
  const pitch = preset.labelH + Math.max(0, preset.gapY || 0);
  const expanded: HTMLElement[] = [];
  sourceLabels.forEach(label => {
    for (let copy = 0; copy < copies; copy += 1) expanded.push(label.cloneNode(true) as HTMLElement);
  });

  const portal = document.createElement("div");
  portal.id = "seikoLabelPrintPortal";
  portal.setAttribute("aria-hidden", "true");
  portal.style.display = "none";

  for (let index = 0; index < expanded.length; index += preset.columns) {
    const row = document.createElement("section");
    row.className = "seikoLabelPrintRow";
    expanded.slice(index, index + preset.columns).forEach(label => row.appendChild(label));
    portal.appendChild(row);
  }

  const style = document.createElement("style");
  style.id = "seikoLabelRuntimePrintStyle";
  style.textContent = `
    @page { size: ${preset.rollW}mm ${pitch}mm; margin: 0; }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${preset.rollW}mm !important;
        min-width: ${preset.rollW}mm !important;
        background: #fff !important;
      }
      body > * { display: none !important; }
      #seikoLabelPrintPortal {
        display: block !important;
        position: static !important;
        width: ${preset.rollW}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      #seikoLabelPrintPortal .seikoLabelPrintRow {
        position: relative !important;
        display: grid !important;
        box-sizing: border-box !important;
        width: ${preset.rollW}mm !important;
        height: ${pitch}mm !important;
        grid-template-columns: repeat(${preset.columns}, ${preset.labelW}mm) !important;
        grid-template-rows: ${preset.labelH}mm !important;
        column-gap: ${preset.gapX}mm !important;
        align-items: start !important;
        padding: 0 ${preset.outer}mm !important;
        margin: 0 !important;
        overflow: hidden !important;
        background: #fff !important;
        break-after: page !important;
        page-break-after: always !important;
      }
      #seikoLabelPrintPortal .seikoLabelPrintRow:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }
      #seikoLabelPrintPortal .printedLabel {
        position: relative !important;
        display: block !important;
        box-sizing: border-box !important;
        width: ${preset.labelW}mm !important;
        height: ${preset.labelH}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #fff !important;
      }
      #seikoLabelPrintPortal .printedElement {
        position: absolute !important;
        display: flex !important;
        align-items: center !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        line-height: 1 !important;
        white-space: normal !important;
      }
      #seikoLabelPrintPortal .fieldName { margin-right: .25em !important; }
      #seikoLabelPrintPortal .fakeQr,
      #seikoLabelPrintPortal .fakeQr.realQr {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: none !important;
        color: transparent !important;
        font-size: 0 !important;
        overflow: hidden !important;
      }
      #seikoLabelPrintPortal .fakeQr svg,
      #seikoLabelPrintPortal .fakeQr.realQr svg {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        background: #fff !important;
      }
      #seikoLabelPrintPortal .fakeBarcode {
        display: grid !important;
        width: 100% !important;
        height: 100% !important;
        grid-template-rows: 1fr auto !important;
      }
      #seikoLabelPrintPortal .fakeBarcode i {
        display: block !important;
        background: repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 4px,#111 4px 5px,transparent 5px 8px) !important;
      }
      #seikoLabelPrintPortal .fakeBarcode small {
        text-align: center !important;
        font: 6px monospace !important;
        white-space: nowrap !important;
        color: #111 !important;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(portal);
  return { portal, style };
}

function printLabels(copies: number) {
  const runtime = buildPrintPortal(copies);
  if (!runtime) return;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    runtime.portal.remove();
    runtime.style.remove();
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 30000);
}

function askPrintCopies(selected: number) {
  document.querySelector(".labelPrintCopiesDialog")?.remove();
  const storageKey = `jinam:${activeBusiness()}:labels:print-copies`;
  const layer = document.createElement("div");
  layer.className = "seikoConfirmLayer labelPrintCopiesDialog";
  layer.innerHTML = '<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="label-copies-title"><h3 id="label-copies-title">Print labels</h3><p class="labelCopiesSummary"></p><label class="labelCopiesField"><span>Copies of each selected label</span><input type="number" min="1" max="50" step="1"></label><div><button type="button" class="secondary cancel">Cancel</button><button type="button" class="primary confirm">Continue to print</button></div></section>';

  const input = layer.querySelector<HTMLInputElement>("input")!;
  input.value = localStorage.getItem(storageKey) || "1";
  const sync = () => {
    const copies = Math.max(1, Math.min(50, Math.floor(Number(input.value) || 1)));
    input.value = String(copies);
    const summary = layer.querySelector<HTMLElement>(".labelCopiesSummary");
    if (summary) summary.textContent = `${selected} selected · ${selected * copies} total print${selected * copies === 1 ? "" : "s"}`;
  };
  sync();
  input.addEventListener("input", sync);

  const close = () => layer.remove();
  layer.querySelector<HTMLButtonElement>(".cancel")!.addEventListener("click", close);
  layer.querySelector<HTMLButtonElement>(".confirm")!.addEventListener("click", () => {
    const copies = Math.max(1, Math.min(50, Math.floor(Number(input.value) || 1)));
    localStorage.setItem(storageKey, String(copies));
    close();
    printLabels(copies);
  });
  layer.addEventListener("click", event => { if (event.target === layer) close(); });
  document.body.appendChild(layer);
  input.focus();
  input.select();
}

function enhanceSettings() {
  document.querySelectorAll<HTMLElement>(".themePanel").forEach(panel => {
    const users = Array.from(panel.querySelectorAll<HTMLButtonElement>(".settingsModuleNav button"))
      .find(button => /Users\s*&\s*access/i.test(button.textContent || ""));
    const label = users?.querySelector<HTMLElement>("span");
    if (label && label.textContent !== "Access & management") label.textContent = "Access & management";

    const usersModule = panel.querySelector<HTMLElement>(".settingsUsersModule");
    const action = usersModule?.querySelector<HTMLButtonElement>(".primary");
    if (action && action.textContent !== "Open access manager") action.textContent = "Open access manager";
  });
}

function enhance() {
  syncWorkspacePagers();
  enhanceSettings();
}

export function SeikoInterfaceFixes() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, {
      observer: { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled"] },
    });

    const clickCapture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const printButton = target.closest<HTMLButtonElement>(".labelDesignerPage .labelTopbar .primary");
      if (printButton && !printButton.disabled && /^Print\b/i.test(printButton.textContent || "")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const selected = document.querySelectorAll(".labelDesignerPage .recordList .record.selected").length;
        askPrintCopies(selected);
        return;
      }

      const accessButton = target.closest<HTMLButtonElement>(".themePanel .settingsUsersModule .primary");
      if (accessButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent("jinam:open-access"));
        return;
      }

      if (target.closest(".workspacePagerTop button")) {
        window.setTimeout(controller.schedule, 0);
      }
    };

    document.addEventListener("click", clickCapture, true);
    return () => {
      document.removeEventListener("click", clickCapture, true);
      controller.stop();
      document.querySelector("#seikoLabelPrintPortal")?.remove();
      document.querySelector("#seikoLabelRuntimePrintStyle")?.remove();
    };
  }, []);

  return null;
}
