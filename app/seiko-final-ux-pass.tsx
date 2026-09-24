"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

const NAV_STACK_KEY = "jinam:session-nav-v2";
const NAV_CURRENT_KEY = "jinam:session-nav-current-v2";
const NAV_BACKING_KEY = "jinam:session-nav-backing-v2";
const OPEN_ORDER_KEY = "jinam:seiko:open-order";
const LABEL_CONTEXT_KEY = "jinam:seiko:label-context-order";
const NAV_INTENT_KEY = "jinam:navigation-intent";
const ADVANCED_LABEL_KEY = "jinam:seiko:advanced-label-order";
const CANVAS_BASE_WIDTH = 400;

type NavEntry = {
  key: string;
  label: string;
  kind: "module" | "workspace" | "setup" | "url";
  target: string;
};

type TypographyPrefs = {
  fieldNameBold?: boolean;
  valueBold?: boolean;
};

type PackingPrefs = {
  information: Record<string, TypographyPrefs>;
  products: Record<string, TypographyPrefs>;
};

function setReactInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setReactSelectValue(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function writeJson(key: string, value: unknown) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function packingOrderNo(page: HTMLElement) {
  const text = page.querySelector(".labelTopbar .eyebrow")?.textContent || "";
  return text.replace(/^ORDER\s+/i, "").split("·")[0]?.trim() || "";
}

function packingPrefsKey(page: HTMLElement) {
  return `jinam:seiko:packing-typography:${packingOrderNo(page) || "current"}`;
}

function readPackingPrefs(page: HTMLElement): PackingPrefs {
  try {
    const value = JSON.parse(localStorage.getItem(packingPrefsKey(page)) || "null") as PackingPrefs | null;
    return {
      information: value?.information || {},
      products: value?.products || {},
    };
  } catch { return { information: {}, products: {} }; }
}

function writePackingPrefs(page: HTMLElement, prefs: PackingPrefs) {
  localStorage.setItem(packingPrefsKey(page), JSON.stringify(prefs));
}

function closeInfoDrawer(page: HTMLElement) {
  page.querySelector<HTMLElement>(".packingInformationPanel")?.classList.remove("finalInfoDrawerOpen");
  page.querySelector(".finalInfoBackdrop")?.remove();
  const button = page.querySelector<HTMLButtonElement>(".finalInfoCustomize");
  if (button) button.textContent = "Customize";
}

function fieldChoiceName(choice: HTMLElement) {
  return choice.querySelector<HTMLElement>("label span")?.textContent?.trim() || "Field";
}

function ensureInformationDrawer(page: HTMLElement) {
  const panel = page.querySelector<HTMLElement>(".packingInformationPanel");
  if (!panel) return;
  const readiness = page.querySelector<HTMLElement>(".packingReadinessPanel");
  if (readiness && readiness.nextElementSibling !== panel) panel.insertAdjacentElement("beforebegin", readiness);

  let head = panel.querySelector<HTMLElement>(".finalInfoHead");
  if (!head) {
    head = document.createElement("div");
    head.className = "finalInfoHead";
    head.innerHTML = '<div><p class="eyebrow">INFORMATION</p><h3>Information on the label</h3><p>Choose order fields and decide how their names and values should print.</p></div><button type="button" class="secondary finalInfoCustomize">Customize</button>';
    panel.prepend(head);
    Array.from(panel.children).forEach(child => {
      if (child !== head && !child.classList.contains("packingInfoGrid")) (child as HTMLElement).classList.add("finalInfoLegacyHeading");
    });
    head.querySelector<HTMLButtonElement>(".finalInfoCustomize")?.addEventListener("click", () => {
      const open = !panel.classList.contains("finalInfoDrawerOpen");
      if (!open) { closeInfoDrawer(page); return; }
      panel.classList.add("finalInfoDrawerOpen");
      const button = head?.querySelector<HTMLButtonElement>(".finalInfoCustomize");
      if (button) button.textContent = "Done";
      const backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "finalInfoBackdrop";
      backdrop.setAttribute("aria-label", "Close information settings");
      backdrop.addEventListener("click", () => closeInfoDrawer(page));
      panel.insertAdjacentElement("beforebegin", backdrop);
    });
  }

  const prefs = readPackingPrefs(page);
  panel.querySelectorAll<HTMLElement>(".packingInfoGrid .fieldChoice").forEach(choice => {
    const name = fieldChoiceName(choice);
    if (name === "Package contents") {
      choice.classList.add("finalPackageChoice");
      return;
    }
    const showName = Array.from(choice.querySelectorAll<HTMLLabelElement>("label")).find(label => /Show field name/i.test(label.textContent || ""));
    const showInput = showName?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!showInput) return;

    let fieldBold = choice.querySelector<HTMLLabelElement>(".finalFieldNameBold");
    if (!fieldBold) {
      fieldBold = document.createElement("label");
      fieldBold.className = "showName finalFieldNameBold";
      fieldBold.innerHTML = '<input type="checkbox"><span>Field name bold</span>';
      showName.insertAdjacentElement("afterend", fieldBold);
      fieldBold.querySelector<HTMLInputElement>("input")?.addEventListener("change", event => {
        const next = readPackingPrefs(page);
        next.information[name] = { ...next.information[name], fieldNameBold: (event.currentTarget as HTMLInputElement).checked };
        writePackingPrefs(page, next);
      });
    }
    const fieldBoldInput = fieldBold.querySelector<HTMLInputElement>("input");
    if (fieldBoldInput) fieldBoldInput.checked = prefs.information[name]?.fieldNameBold ?? false;
    fieldBold.hidden = !showInput.checked;
    if (!showInput.dataset.finalFieldBoldListener) {
      showInput.dataset.finalFieldBoldListener = "true";
      showInput.addEventListener("change", () => { if (fieldBold) fieldBold.hidden = !showInput.checked; });
    }
  });
}

function productName(details: HTMLElement) {
  return details.querySelector<HTMLElement>("summary b, summary strong")?.textContent?.trim()
    || details.querySelector("summary")?.textContent?.split("prints as")[0]?.trim()
    || "Product";
}

function ensureProductControls(page: HTMLElement) {
  const prefs = readPackingPrefs(page);
  page.querySelectorAll<HTMLElement>(".packingPresentationRules details").forEach(details => {
    const name = productName(details);
    const body = details.querySelector<HTMLElement>(".packingRuleBody");
    if (!body) return;
    const include = body.querySelector<HTMLInputElement>('.packingCheck:first-child input[type="checkbox"]');
    if (!include) return;
    details.classList.toggle("finalProductExcluded", !include.checked);

    let typography = body.querySelector<HTMLElement>(".finalProductTypography");
    if (!typography) {
      typography = document.createElement("div");
      typography.className = "finalProductTypography";
      typography.innerHTML = '<label><input type="checkbox" class="finalProductShowName"><span>Show field name</span></label><label><input type="checkbox" class="finalProductFieldBold"><span>Field name bold</span></label><label><input type="checkbox" class="finalProductValueBold"><span>Value bold</span></label>';
      body.querySelector(".packingCheck:first-child")?.insertAdjacentElement("afterend", typography);

      const format = Array.from(body.querySelectorAll<HTMLSelectElement>("select")).find(select => Array.from(select.options).some(option => /Name: details/i.test(option.textContent || "")));
      const show = typography.querySelector<HTMLInputElement>(".finalProductShowName")!;
      show.checked = format ? format.value !== "details_only" : true;
      show.addEventListener("change", () => {
        if (!format) return;
        if (!show.checked) {
          format.dataset.previousFormat = format.value;
          setReactSelectValue(format, "details_only");
        } else if (format.value === "details_only") {
          setReactSelectValue(format, format.dataset.previousFormat || "name_details");
        }
      });
      typography.querySelector<HTMLInputElement>(".finalProductFieldBold")?.addEventListener("change", event => {
        const next = readPackingPrefs(page);
        next.products[name] = { ...next.products[name], fieldNameBold: (event.currentTarget as HTMLInputElement).checked };
        writePackingPrefs(page, next);
      });
      typography.querySelector<HTMLInputElement>(".finalProductValueBold")?.addEventListener("change", event => {
        const next = readPackingPrefs(page);
        next.products[name] = { ...next.products[name], valueBold: (event.currentTarget as HTMLInputElement).checked };
        writePackingPrefs(page, next);
      });
    }
    const fieldBold = typography.querySelector<HTMLInputElement>(".finalProductFieldBold");
    const valueBold = typography.querySelector<HTMLInputElement>(".finalProductValueBold");
    if (fieldBold) fieldBold.checked = prefs.products[name]?.fieldNameBold ?? true;
    if (valueBold) valueBold.checked = prefs.products[name]?.valueBold ?? true;
    if (!include.dataset.finalCompactListener) {
      include.dataset.finalCompactListener = "true";
      include.addEventListener("change", () => details.classList.toggle("finalProductExcluded", !include.checked));
    }
  });
}

function splitStyledLine(line: string, prefs: TypographyPrefs) {
  const wrapper = document.createElement("span");
  wrapper.className = "finalStyledLine";
  const separator = line.indexOf(": ");
  if (separator < 0) { wrapper.textContent = line; wrapper.style.fontWeight = prefs.valueBold ? "700" : "400"; return wrapper; }
  const name = document.createElement("span");
  name.textContent = line.slice(0, separator + 2);
  name.style.fontWeight = prefs.fieldNameBold ? "700" : "400";
  const value = document.createElement("span");
  value.textContent = line.slice(separator + 2);
  value.style.fontWeight = prefs.valueBold ? "700" : "400";
  wrapper.append(name, value);
  return wrapper;
}

function applyPackingTypography(page: HTMLElement) {
  const prefs = readPackingPrefs(page);
  const aliases = new Map<string, TypographyPrefs>();
  page.querySelectorAll<HTMLElement>(".packingPresentationRules details").forEach(details => {
    const name = productName(details);
    const aliasInput = Array.from(details.querySelectorAll<HTMLInputElement>('input[type="text"]')).find(input => input.closest("label")?.textContent?.includes("Printed product name"));
    aliases.set(aliasInput?.value.trim() || name, prefs.products[name] || {});
  });

  page.querySelectorAll<HTMLElement>(".packingCanvas .packingFitText, .printSheet .packingFitText").forEach(text => {
    const current = text.textContent || "";
    const raw = text.dataset.finalRawText && text.dataset.finalRenderedText === current ? text.dataset.finalRawText : current;
    const lines = raw.split("\n");
    let changed = false;
    const styled = lines.map(line => {
      const alias = [...aliases.keys()].find(candidate => line === candidate || line.startsWith(`${candidate}:`) || line.startsWith(`${candidate} `));
      if (alias) { changed = true; return splitStyledLine(line, aliases.get(alias) || {}); }
      const infoName = line.includes(": ") ? line.slice(0, line.indexOf(": ")).trim() : "";
      if (infoName && prefs.information[infoName]) { changed = true; return splitStyledLine(line, prefs.information[infoName]); }
      const plain = document.createElement("span"); plain.className = "finalStyledLine"; plain.textContent = line; return plain;
    });
    if (!changed) return;
    text.textContent = "";
    styled.forEach((line, index) => { if (index) text.appendChild(document.createElement("br")); text.appendChild(line); });
    text.dataset.finalRawText = raw;
    text.dataset.finalRenderedText = text.textContent || raw;
  });
}

function inspectorInput(page: HTMLElement, labelText: string) {
  return Array.from(page.querySelectorAll<HTMLLabelElement>(".packingInspectorBar label")).find(label =>
    label.childNodes[0]?.textContent?.trim() === labelText || label.querySelector("span")?.textContent?.trim() === labelText
  )?.querySelector<HTMLInputElement>("input") || null;
}

function relabelInspector(page: HTMLElement) {
  const controls = page.querySelector<HTMLElement>(".packingInspectorBar");
  if (!controls) return;
  const rename = (from: string, to: string) => {
    const label = Array.from(controls.querySelectorAll<HTMLLabelElement>("label")).find(node => node.childNodes[0]?.textContent?.trim() === from);
    if (!label) return;
    const node = Array.from(label.childNodes).find(child => child.nodeType === Node.TEXT_NODE);
    if (node) node.textContent = `${to} `;
  };
  rename("Font", "Text size");
  rename("Width", "Box width");
  rename("Height", "Box height");
  const font = inspectorInput(page, "Text size") || inspectorInput(page, "Font");
  if (!font) return;
  font.max = "96";
  font.min = "4";
  font.step = ".5";
  if (!controls.querySelector(".finalFontStepper")) {
    const stepper = document.createElement("div");
    stepper.className = "finalFontStepper";
    stepper.innerHTML = '<button type="button" aria-label="Decrease text size">−</button><button type="button" aria-label="Increase text size">+</button>';
    const change = (delta: number) => {
      const next = Math.max(4, Math.min(96, (Number(font.value) || 8) + delta));
      setReactInputValue(font, String(Math.round(next * 2) / 2));
      requestAnimationFrame(() => forceSelectedFont(page));
    };
    stepper.children[0].addEventListener("click", () => change(-1));
    stepper.children[1].addEventListener("click", () => change(1));
    font.closest("label")?.appendChild(stepper);
  }
}

function forceSelectedFont(page: HTMLElement) {
  const canvas = page.querySelector<HTMLElement>(".packingCanvas");
  const selected = canvas?.querySelector<HTMLElement>(".canvasElement.selected");
  const text = selected?.querySelector<HTMLElement>(".packingFitText");
  const font = inspectorInput(page, "Text size") || inspectorInput(page, "Font");
  if (!canvas || !selected || !text || !font) return;
  const pt = Number(font.value);
  if (!Number.isFinite(pt) || pt <= 0) return;
  const scale = Math.max(.5, canvas.getBoundingClientRect().width / CANVAS_BASE_WIDTH);
  const basePx = pt * 1.333;
  let px = basePx * scale;
  text.dataset.packingBasePx = String(basePx);
  text.dataset.packingScale = String(scale);
  text.style.setProperty("font-size", `${px}px`, "important");
  let guard = 0;
  while ((text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1) && px > 5 && guard < 220) {
    px -= .5;
    text.style.setProperty("font-size", `${px}px`, "important");
    guard += 1;
  }
  text.dataset.packingScaledPx = String(px);
}

function closePackingMenu(page: HTMLElement) {
  const menu = page.querySelector<HTMLElement>(".packingHeaderMenu");
  if (!menu || getComputedStyle(menu).display === "none") return;
  const toggle = page.querySelector<HTMLButtonElement>(".labelHeaderMenuButton");
  toggle?.click();
}

function ensureMenuDismissal(page: HTMLElement) {
  const wrap = page.querySelector<HTMLElement>(".packingMenuWrap");
  if (!wrap || wrap.dataset.finalDismissReady) return;
  wrap.dataset.finalDismissReady = "true";
  wrap.addEventListener("pointerleave", () => window.setTimeout(() => {
    if (!wrap.matches(":hover") && !wrap.contains(document.activeElement)) closePackingMenu(page);
  }, 140));
}

function ensureTraceTools(page: HTMLElement) {
  const sidebar = page.querySelector<HTMLElement>(".labelSidebar");
  if (!sidebar || sidebar.querySelector(".finalTraceTools")) return;
  const tools = document.createElement("div");
  tools.className = "finalTraceTools";
  tools.innerHTML = '<p class="eyebrow">TRACE & CODES</p><p>Add QR codes, barcodes, fixed text, sequence and full trace fields with the complete label toolset.</p><button type="button" class="secondary">Open trace & code tools</button>';
  tools.querySelector("button")?.addEventListener("click", () => {
    const orderNo = packingOrderNo(page);
    if (!orderNo) return;
    sessionStorage.setItem(ADVANCED_LABEL_KEY, orderNo);
    sessionStorage.setItem(LABEL_CONTEXT_KEY, orderNo);
    sessionStorage.setItem(NAV_INTENT_KEY, "labels");
    window.location.assign("/?business=seiko");
  });
  sidebar.appendChild(tools);
}

function detectView(): NavEntry | null {
  if (window.location.pathname.startsWith("/labels/create")) return { key: `url:${window.location.pathname}${window.location.search}`, label: "Label workspace", kind: "url", target: `${window.location.pathname}${window.location.search}` };
  const workspace = document.querySelector<HTMLElement>(".workspacePage");
  if (workspace) {
    const order = workspace.querySelector(".workspaceTitle h1,.workspaceTitle h2,.workspaceTitle")?.textContent?.match(/\d{4}-\d{2}-\d{3}/)?.[0] || "";
    return { key: `workspace:${order}`, label: "Order workspace", kind: "workspace", target: order };
  }
  const setup = document.querySelector<HTMLElement>(".orderSetup");
  if (setup) {
    const order = setup.textContent?.match(/\d{4}-\d{2}-\d{3}/)?.[0] || "";
    return { key: `setup:${order}`, label: "Order setup", kind: "setup", target: order };
  }
  if (document.querySelector(".ordersPage")) return { key: "module:Orders", label: "Order Center", kind: "module", target: "Orders" };
  if (document.querySelector(".labelLauncher")) return { key: "module:Labels", label: "Label Center", kind: "module", target: "Labels" };
  if (document.querySelector(".seikoOperationalDashboard")) return { key: "module:Home", label: "Home", kind: "module", target: "Home" };
  const active = document.querySelector<HTMLElement>(".app .moduleMenu .nav.active small")?.textContent?.trim();
  if (active) return { key: `module:${active}`, label: active, kind: "module", target: active };
  return null;
}

function rememberView() {
  const next = detectView();
  if (!next) return;
  const current = readJson<NavEntry | null>(NAV_CURRENT_KEY, null);
  if (current?.key === next.key) return;
  if (sessionStorage.getItem(NAV_BACKING_KEY) === "true") {
    sessionStorage.removeItem(NAV_BACKING_KEY);
    writeJson(NAV_CURRENT_KEY, next);
    return;
  }
  const stack = readJson<NavEntry[]>(NAV_STACK_KEY, []);
  if (current && stack.at(-1)?.key !== current.key) stack.push(current);
  writeJson(NAV_STACK_KEY, stack.slice(-40));
  writeJson(NAV_CURRENT_KEY, next);
}

function clickModule(label: string) {
  const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .moduleMenu .nav")).find(node => node.querySelector("small")?.textContent?.trim() === label);
    button?.click();
  }, 0);
}

function navigateBack() {
  const stack = readJson<NavEntry[]>(NAV_STACK_KEY, []);
  const entry = stack.pop();
  if (!entry) { if (window.history.length > 1) window.history.back(); return; }
  writeJson(NAV_STACK_KEY, stack);
  sessionStorage.setItem(NAV_BACKING_KEY, "true");
  if (entry.kind === "url") { window.location.assign(entry.target); return; }
  if (entry.kind === "workspace") {
    if (entry.target) sessionStorage.setItem(OPEN_ORDER_KEY, entry.target);
    clickModule("Orders");
    return;
  }
  if (entry.kind === "setup") {
    sessionStorage.setItem("jinam:final-open-order-action", `setup:${entry.target}`);
    if (entry.target) sessionStorage.setItem(OPEN_ORDER_KEY, entry.target);
    clickModule("Orders");
    return;
  }
  clickModule(entry.target);
}

function ensureSessionBack() {
  const stack = readJson<NavEntry[]>(NAV_STACK_KEY, []);
  const add = (head: HTMLElement | null) => {
    if (!head || head.querySelector(".finalSessionBack")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "textButton finalSessionBack";
    button.textContent = stack.length ? "← Back" : "← Back";
    button.disabled = !stack.length && window.history.length <= 1;
    button.addEventListener("click", navigateBack);
    head.prepend(button);
  };
  add(document.querySelector<HTMLElement>(".ordersPage .orderCenterHead"));
  add(document.querySelector<HTMLElement>(".labelLauncher .labelLauncherHead"));

  document.querySelectorAll<HTMLButtonElement>(".contextBackButton").forEach(button => {
    if (button.dataset.finalSessionBackReady) return;
    button.dataset.finalSessionBackReady = "true";
    button.addEventListener("click", event => {
      const currentStack = readJson<NavEntry[]>(NAV_STACK_KEY, []);
      if (!currentStack.length) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      navigateBack();
    }, true);
  });
}

function waitFor(predicate: () => HTMLElement | null, action: (node: HTMLElement) => void, attempts = 80) {
  const node = predicate();
  if (node) { action(node); return; }
  if (attempts > 0) window.setTimeout(() => waitFor(predicate, action, attempts - 1), 40);
}

function orderRow(orderNo: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".ordersPage .orderRow")).find(row => row.querySelector("b")?.textContent?.trim() === orderNo) || null;
}

function openOrderChoice(orderNo: string, action: "setup" | "workspace" | "labels") {
  clickModule("Orders");
  waitFor(() => orderRow(orderNo), row => {
    if (action === "workspace") { row.querySelector<HTMLButtonElement>(".openOrderButton")?.click(); return; }
    const menu = row.querySelector<HTMLDetailsElement>(".seikoRowActionMenu");
    if (menu) menu.open = true;
    window.setTimeout(() => {
      const label = action === "setup" ? "Edit setup" : "Labels";
      const button = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(node => node.textContent?.trim() === label);
      button?.click();
    }, 0);
  });
}

function closeOrderChooser() { document.querySelector(".finalOrderChooserLayer")?.remove(); }

function openOrderChooser(button: HTMLButtonElement) {
  closeOrderChooser();
  const orderNo = button.querySelector("strong")?.textContent?.trim() || "Order";
  const client = button.querySelector("span")?.textContent?.trim() || "";
  const layer = document.createElement("div");
  layer.className = "finalOrderChooserLayer";
  layer.innerHTML = `<section class="finalOrderChooser"><header><div><p class="eyebrow">${orderNo}</p><h3>${client || "Choose where to continue"}</h3><p>Open the part of this order you need.</p></div><button type="button" class="secondary finalChooserClose">×</button></header><div class="finalOrderDestinations"><button type="button" data-action="setup"><b>Order page / setup</b><span>Products, fields, quantities and configuration.</span></button><button type="button" data-action="workspace"><b>Workspace</b><span>Enter and review person / record data.</span></button><button type="button" data-action="labels"><b>Labels</b><span>Create, open and print label sets for this order.</span></button></div></section>`;
  document.body.appendChild(layer);
  layer.querySelector(".finalChooserClose")?.addEventListener("click", closeOrderChooser);
  layer.addEventListener("pointerdown", event => { if (event.target === layer) closeOrderChooser(); });
  layer.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(destination => destination.addEventListener("click", () => {
    const action = destination.dataset.action as "setup" | "workspace" | "labels";
    closeOrderChooser(); openOrderChoice(orderNo, action);
  }));
}

function enhanceAdvancedLabelAutoOpen() {
  const orderNo = sessionStorage.getItem(ADVANCED_LABEL_KEY);
  const launcher = document.querySelector<HTMLElement>(".labelLauncher");
  if (!orderNo || !launcher) return;
  const select = launcher.querySelector<HTMLSelectElement>('select[aria-label="Label use"]');
  if (select && select.value !== "packing") setReactSelectValue(select, "packing");
  const row = Array.from(launcher.querySelectorAll<HTMLElement>(".labelOrderResults article")).find(article => article.querySelector("b")?.textContent?.includes(orderNo));
  const create = row?.querySelector<HTMLButtonElement>(".orderLabelActions button");
  if (!create) return;
  sessionStorage.removeItem(ADVANCED_LABEL_KEY);
  create.click();
}

function moveBusinessSwitcherTop() {
  document.querySelectorAll<HTMLElement>(".moduleMenu").forEach(menu => {
    const switcher = menu.querySelector<HTMLElement>(":scope > .globalBusinessNavigator");
    if (switcher && menu.firstElementChild !== switcher) menu.prepend(switcher);
  });
}

function enhancePacking(page: HTMLElement) {
  ensureInformationDrawer(page);
  ensureProductControls(page);
  relabelInspector(page);
  ensureMenuDismissal(page);
  ensureTraceTools(page);
  applyPackingTypography(page);
  forceSelectedFont(page);
  page.querySelectorAll(".packingPackageVisibility").forEach(node => node.classList.add("finalLegacyPackageVisibility"));
}

export function SeikoFinalUxPass() {
  useEffect(() => {
    const controller = startDomEnhancement(() => {
      const packing = document.querySelector<HTMLElement>(".packingWorkflowDesigner");
      if (packing) enhancePacking(packing);
      rememberView();
      ensureSessionBack();
      moveBusinessSwitcherTop();
      enhanceAdvancedLabelAutoOpen();
    }, { observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "value", "open"] } });

    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (!target.closest(".packingMenuWrap")) {
        const page = document.querySelector<HTMLElement>(".packingWorkflowDesigner");
        if (page) closePackingMenu(page);
      }
      const homeOrder = target.closest<HTMLButtonElement>(".homeOrderOpen");
      if (homeOrder) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        openOrderChooser(homeOrder);
      }
    };

    const wheel = (event: WheelEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".packingWorkflowDesigner .packingCanvas .canvasElement");
      const page = element?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!element || !page || !element.classList.contains("selected")) return;
      const font = inspectorInput(page, "Text size") || inspectorInput(page, "Font");
      if (!font) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const step = event.shiftKey ? 2 : .5;
      const next = Math.max(4, Math.min(96, (Number(font.value) || 8) + (event.deltaY < 0 ? step : -step)));
      setReactInputValue(font, String(Math.round(next * 2) / 2));
      requestAnimationFrame(() => forceSelectedFont(page));
    };

    const input = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const page = target?.closest<HTMLElement>(".packingWorkflowDesigner");
      if (!target || !page) return;
      if (target.closest(".packingInspectorBar")) requestAnimationFrame(() => forceSelectedFont(page));
    };

    const focus = (event: FocusEvent) => {
      const target = event.target as Element | null;
      const page = document.querySelector<HTMLElement>(".packingWorkflowDesigner");
      if (page && target && !target.closest(".packingMenuWrap")) closePackingMenu(page);
    };

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeOrderChooser(); const page = document.querySelector<HTMLElement>(".packingWorkflowDesigner"); if (page) { closePackingMenu(page); closeInfoDrawer(page); } }
    };

    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("wheel", wheel, { capture: true, passive: false });
    document.addEventListener("input", input, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", controller.schedule);
    return () => {
      controller.stop();
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", controller.schedule);
    };
  }, []);
  return null;
}
