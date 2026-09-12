"use client";

import { useEffect } from "react";

const BASE_CANVAS_WIDTH = 50 * 8;
const LABEL_W = 50;
const LABEL_H = 25;

function setReactInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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
    control.innerHTML = '<input type="checkbox"><span>Include product details on label</span>';
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

  let guard = 0;
  while ((element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) && scaled > 5 && guard < 160) {
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

function inspectorInput(controls: HTMLElement, name: string) {
  return Array.from(controls.querySelectorAll<HTMLLabelElement>("label")).find(label =>
    label.childNodes[0]?.textContent?.trim() === name
  )?.querySelector<HTMLInputElement>("input") || null;
}

function measureTextBox(page: HTMLElement) {
  const selected = page.querySelector<HTMLElement>(".packingCanvas .canvasElement.selected");
  const controls = page.querySelector<HTMLElement>(".packingSelectedControls");
  const canvas = page.querySelector<HTMLElement>(".packingCanvas");
  const text = selected?.querySelector<HTMLElement>(".packingFitText");
  if (!selected || !controls || !canvas || !text) return null;

  const fontInput = inspectorInput(controls, "Font");
  const widthInput = inspectorInput(controls, "Width");
  const heightInput = inspectorInput(controls, "Height");
  if (!fontInput || !widthInput || !heightInput) return null;

  const preferredPt = Number(fontInput.value);
  if (!Number.isFinite(preferredPt)) return null;
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
  const pxPerMm = canvasRect.width / LABEL_W;
  const scale = Math.max(0.5, canvasRect.width / BASE_CANVAS_WIDTH);
  const targetPx = preferredPt * 1.333 * scale;
  const lines = (text.textContent || " ").split("\n");
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  const style = getComputedStyle(text);
  const family = style.fontFamily || "Arial";
  const weight = Number.parseInt(style.fontWeight || "400", 10) >= 600 ? 700 : 400;
  context.font = `${weight} ${targetPx}px ${family}`;
  const widest = Math.max(1, ...lines.map(line => context.measureText(line || " ").width));
  const desiredW = Math.max(2, widest / pxPerMm + 0.45);
  const desiredH = Math.max(2, lines.length * targetPx * 1.08 / pxPerMm + 0.35);
  const x = Number.parseFloat(selected.style.left || "0") / 100 * LABEL_W;
  const y = Number.parseFloat(selected.style.top || "0") / 100 * LABEL_H;
  return {
    widthInput,
    heightInput,
    desiredW: clamp(desiredW, 2, Math.max(2, LABEL_W - x)),
    desiredH: clamp(desiredH, 2, Math.max(2, LABEL_H - y)),
  };
}

function fitSelectedBox(page: HTMLElement, onlyGrow = false) {
  const measured = measureTextBox(page);
  if (!measured) return;
  const currentW = Number(measured.widthInput.value);
  const currentH = Number(measured.heightInput.value);
  const nextW = onlyGrow ? Math.max(currentW, measured.desiredW) : measured.desiredW;
  const nextH = onlyGrow ? Math.max(currentH, measured.desiredH) : measured.desiredH;
  if (Math.abs(nextW - currentW) > 0.08) setReactInputValue(measured.widthInput, (Math.round(nextW * 4) / 4).toString());
  if (Math.abs(nextH - currentH) > 0.08) setReactInputValue(measured.heightInput, (Math.round(nextH * 4) / 4).toString());
}

function ensureInspector(page: HTMLElement) {
  const panel = page.querySelector<HTMLElement>(".labelCanvasPanel");
  const toolbar = panel?.querySelector<HTMLElement>(".canvasToolbar");
  const controls = panel?.querySelector<HTMLElement>(".packingSelectedControls");
  if (!panel || !toolbar || !controls) return;

  controls.classList.add("packingInspectorBar");
  if (toolbar.nextElementSibling !== controls) toolbar.insertAdjacentElement("afterend", controls);

  let fitButton = controls.querySelector<HTMLButtonElement>(".packingFitBoxButton");
  if (!fitButton) {
    fitButton = document.createElement("button");
    fitButton.type = "button";
    fitButton.className = "secondary packingFitBoxButton";
    fitButton.textContent = "Fit box to text";
    fitButton.title = "Tighten the field area around the current text so it can move farther to the edge.";
    fitButton.addEventListener("click", () => requestAnimationFrame(() => fitSelectedBox(page, false)));
    controls.appendChild(fitButton);
    const hint = document.createElement("small");
    hint.className = "packingInspectorHint";
    hint.textContent = "Wheel changes text size · Fit box removes unused area · long records still shrink only when needed.";
    controls.appendChild(hint);
  }
}

type LibraryItem = Record<string, unknown>;

function parseArray(key: string): LibraryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as LibraryItem[] : [];
  } catch { return []; }
}

function businessId() {
  return new URLSearchParams(window.location.search).get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}

function pageOrderNo(page: HTMLElement) {
  const text = page.querySelector(".labelTopbar .eyebrow")?.textContent || "";
  return text.replace(/^ORDER\s+/i, "").split("·")[0]?.trim() || "";
}

function pageClient(page: HTMLElement) {
  return (page.querySelector(".labelTopbar h2")?.textContent || "").replace(/^Packing labels for\s+/i, "").trim();
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));
}

function findCurrentOrder(orderNo: string) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      if (!Array.isArray(parsed)) continue;
      const match = parsed.find(item => item && typeof item === "object" && (item as { details?: { orderNo?: string } }).details?.orderNo === orderNo);
      if (match) return match as { orderId?: string; records?: Array<{ recordId?: string; held?: boolean }> };
    } catch { /* ignore unrelated local data */ }
  }
  return null;
}

function closeRuntimeLayer() {
  document.querySelector(".packingRuntimeLayer")?.remove();
}

function openSavedLibrary(page: HTMLElement, kind: "sets" | "layouts") {
  closeRuntimeLayer();
  const business = businessId();
  const orderNo = pageOrderNo(page);
  const client = pageClient(page);
  const key = kind === "sets" ? `jinam:${business}:labels:tasks-v1` : `jinam:${business}:labels:templates-v1`;
  const all = parseArray(key);
  const items = kind === "sets" ? all.filter(item => item.orderNo === orderNo || (!item.orderNo && item.client === client)) : all;

  const layer = document.createElement("div");
  layer.className = "packingRuntimeLayer";
  layer.innerHTML = `<section class="packingRuntimeDialog"><header><div><p class="eyebrow">${kind === "sets" ? "SAVED LABEL SETS" : "SAVED LAYOUTS"}</p><h3>${kind === "sets" ? `This order · ${escapeHtml(orderNo)}` : "Reusable label layouts"}</h3></div><button type="button" class="secondary packingRuntimeClose">Done</button></header><div class="packingLibraryList">${items.length ? items.map(item => `<article class="packingLibraryRow"><div><b>${escapeHtml(item.name || (kind === "sets" ? "Saved label set" : "Saved layout"))}</b><small>${kind === "sets" ? `${escapeHtml(item.orderNo || orderNo)} · ${Array.isArray(item.selectedRows) ? item.selectedRows.length : 0} labels` : `${escapeHtml(item.clientType || "Reusable")} · ${escapeHtml(item.purpose || "label")}`}</small></div><button type="button" class="secondary packingLibraryOpen" data-library-id="${escapeHtml(item.id)}">${kind === "sets" ? "Open" : "Use"}</button></article>`).join("") : `<p class="packingLibraryEmpty">${kind === "sets" ? "No saved label sets for this order yet." : "No saved layouts yet."}</p>`}</div></section>`;
  document.body.appendChild(layer);
  layer.querySelector(".packingRuntimeClose")?.addEventListener("click", closeRuntimeLayer);
  layer.addEventListener("pointerdown", event => { if (event.target === layer) closeRuntimeLayer(); });
  layer.querySelectorAll<HTMLButtonElement>(".packingLibraryOpen").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.libraryId || "";
    const item = items.find(candidate => String(candidate.id || "") === id);
    if (!item) return;
    const openKey = `jinam:${business}:labels:open-task`;
    if (kind === "sets") {
      sessionStorage.setItem(openKey, id);
      window.location.reload();
      return;
    }
    const order = findCurrentOrder(orderNo);
    const orderId = String(order?.orderId || "");
    if (!orderId) return;
    const firstRecord = order?.records?.find(record => !record.held)?.recordId || "";
    const taskId = `layout-${id}-${orderId}`;
    const tasksKey = `jinam:${business}:labels:tasks-v1`;
    const tasks = parseArray(tasksKey).filter(task => task.id !== taskId);
    const task: LibraryItem = {
      id: taskId,
      name: `Layout · ${String(item.name || "Saved layout")}`,
      orderId,
      orderNo,
      client,
      createdAt: new Date().toISOString(),
      purpose: "packing",
      sourceMode: "person",
      outputMode: "combined",
      presetId: item.presetId || "pixra-109",
      items: item.items || [],
      selectedRows: firstRecord ? [firstRecord] : [],
      personPackagePlan: "together",
      includedProducts: [],
      packageGroupBy: "product",
      packageCounts: {},
      customerUpdates: false,
      presentationRules: item.presentationRules,
      packagePresentation: item.packagePresentation,
      designerKind: item.designerKind || "packing-person-v4",
    };
    localStorage.setItem(tasksKey, JSON.stringify([...tasks, task]));
    sessionStorage.setItem(openKey, taskId);
    window.location.reload();
  }));
}

function ensureMenuLibraries(page: HTMLElement) {
  const menu = page.querySelector<HTMLElement>(".packingHeaderMenu");
  if (!menu || menu.querySelector(".packingSavedSetsMenu")) return;
  const divider = document.createElement("div");
  divider.className = "packingMenuDivider";
  const savedSets = document.createElement("button");
  savedSets.type = "button";
  savedSets.className = "packingSavedSetsMenu";
  savedSets.textContent = "Saved label sets";
  savedSets.addEventListener("click", () => openSavedLibrary(page, "sets"));
  const savedLayouts = document.createElement("button");
  savedLayouts.type = "button";
  savedLayouts.textContent = "Saved layouts";
  savedLayouts.addEventListener("click", () => openSavedLibrary(page, "layouts"));
  menu.append(divider, savedSets, savedLayouts);
}

function selectedFieldNames(page: HTMLElement) {
  return Array.from(page.querySelectorAll<HTMLElement>(".packingInfoGrid .fieldChoice.chosen > label:first-child span"))
    .map(node => node.textContent?.trim() || "").filter(Boolean);
}

function selectedLabelCount(page: HTMLElement) {
  const heading = page.querySelector(".labelSidebar .panelHead h3")?.textContent || "0";
  const value = Number.parseInt(heading, 10);
  return Number.isFinite(value) ? value : 0;
}

function readinessFingerprint(page: HTMLElement) {
  const fields = Array.from(page.querySelectorAll<HTMLInputElement>(".packingInfoGrid input, .packingInfoGrid select")).map(input => `${input.type}:${input.checked}:${input.value}`);
  const geometry = Array.from(page.querySelectorAll<HTMLElement>(".packingCanvas .canvasElement")).map(item => `${item.dataset.itemId || ""}:${item.style.left}:${item.style.top}:${item.style.width}:${item.style.height}`);
  const records = Array.from(page.querySelectorAll<HTMLElement>(".labelSidebar .record.selected b")).map(node => node.textContent || "");
  const product = page.querySelector(".packingPresentationSummary h3")?.textContent || "";
  const productVisible = page.querySelector<HTMLInputElement>(".packingPackageVisibility input")?.checked || false;
  return JSON.stringify({ fields, geometry, records, product, productVisible });
}

function resetConfirmation(page: HTMLElement) {
  if (page.dataset.labelSetConfirmed !== "true") return;
  page.dataset.labelSetConfirmed = "false";
  delete page.dataset.labelSetConfirmedFingerprint;
}

function updateReadiness(page: HTMLElement) {
  const panel = page.querySelector<HTMLElement>(".packingReadinessPanel");
  if (!panel) return;
  const orderNo = pageOrderNo(page);
  const fields = selectedFieldNames(page);
  const labels = selectedLabelCount(page);
  const size = page.querySelector(".canvasToolbar b")?.textContent?.trim() || "50 × 25 mm";
  const productSummary = page.querySelector(".packingPresentationSummary h3")?.textContent?.trim() || "No product details";
  const conditional = page.querySelector(".packingPresentationSummary p:last-child")?.textContent?.trim() || "";
  const productVisible = page.querySelector<HTMLInputElement>(".packingPackageVisibility input")?.checked || false;
  const confirmed = page.dataset.labelSetConfirmed === "true" && page.dataset.labelSetConfirmedFingerprint === readinessFingerprint(page);

  const value = (name: string, text: string) => {
    const node = panel.querySelector<HTMLElement>(`[data-ready-value="${name}"]`);
    if (node && node.textContent !== text) node.textContent = text;
  };
  value("order", orderNo || "Current order");
  value("labels", `${labels} label${labels === 1 ? "" : "s"}`);
  value("size", size.replace(/ label$/i, ""));
  value("fields", fields.filter(field => field !== "Package contents").join(", ") || "None");
  value("products", productVisible ? productSummary : "Not included on this label set");
  value("rules", productVisible && conditional ? conditional : "—");

  panel.classList.toggle("confirmed", confirmed);
  const state = panel.querySelector<HTMLElement>(".packingReadinessState");
  if (state) state.textContent = confirmed ? "Confirmed · ready to print" : "Review and confirm before printing";
  const confirm = panel.querySelector<HTMLButtonElement>(".packingConfirmSet");
  if (confirm) {
    confirm.textContent = confirmed ? "Label set confirmed" : "Confirm label set";
    confirm.disabled = confirmed || labels < 1 || fields.length < 1;
  }
  const print = page.querySelector<HTMLButtonElement>(".labelTopbar .primary");
  if (print) {
    const hasLabels = labels > 0;
    print.disabled = !hasLabels || !confirmed;
    print.title = confirmed ? "Print confirmed label set" : "Confirm the label set below before printing.";
  }
}

function ensureReadiness(page: HTMLElement) {
  let panel = page.querySelector<HTMLElement>(".packingReadinessPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "panel packingReadinessPanel";
    panel.innerHTML = '<div class="packingReadinessHead"><div><p class="eyebrow">LABEL SET BRIEF</p><h3>Ready-check before printing</h3><p class="packingReadinessState">Review and confirm before printing</p></div><button type="button" class="primary packingConfirmSet">Confirm label set</button></div><div class="packingReadinessGrid"><div><span>Order</span><b data-ready-value="order"></b></div><div><span>Labels</span><b data-ready-value="labels"></b></div><div><span>Label size</span><b data-ready-value="size"></b></div><div><span>Information</span><b data-ready-value="fields"></b></div><div><span>Product details</span><b data-ready-value="products"></b></div><div><span>Conditional rules</span><b data-ready-value="rules"></b></div></div>';
    const grid = page.querySelector(".packingDesignerGrid");
    if (grid) grid.insertAdjacentElement("beforebegin", panel);
    panel.querySelector(".packingConfirmSet")?.addEventListener("click", () => {
      page.dataset.labelSetConfirmed = "true";
      page.dataset.labelSetConfirmedFingerprint = readinessFingerprint(page);
      updateReadiness(page);
    });
  }
  updateReadiness(page);
}

function enhancePackingPage(page: HTMLElement) {
  relabelBoldControls(page);
  ensurePackageVisibilityControl(page);
  ensureInspector(page);
  ensureMenuLibraries(page);
  ensureReadiness(page);

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
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };

    const changed = (event: Event) => {
      const target = event.target as Element | null;
      const page = target?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!page || target?.closest(".packingConfirmSet,.packingRuntimeLayer")) return;
      if (target?.closest(".labelPreviewSample,.recordSearch")) return;
      resetConfirmation(page);
      if (event.type === "wheel" && target?.closest(".packingCanvas .canvasElement")) {
        requestAnimationFrame(() => requestAnimationFrame(() => fitSelectedBox(page, true)));
      }
      schedule();
    };

    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "checked", "value"] });
    document.addEventListener("input", changed, true);
    document.addEventListener("change", changed, true);
    document.addEventListener("pointerup", changed, true);
    document.addEventListener("wheel", changed, { capture: true, passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", changed, true);
      document.removeEventListener("change", changed, true);
      document.removeEventListener("pointerup", changed, true);
      document.removeEventListener("wheel", changed, true);
      window.removeEventListener("resize", schedule);
      closeRuntimeLayer();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
