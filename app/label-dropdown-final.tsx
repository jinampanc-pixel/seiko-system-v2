"use client";

import { useEffect } from "react";

type StoredPreset = {
  id: string;
  name: string;
  labelW: number;
  labelH: number;
  rollW: number;
  columns: number;
  outer: number;
  gapX: number;
  gapY: number;
  locked?: boolean;
};

function activeBusiness() {
  const params = new URLSearchParams(window.location.search);
  return params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}

function presetStorageKey() {
  return `jinam:${activeBusiness()}:labels:presets-v1`;
}

function pendingPresetKey() {
  return `jinam:${activeBusiness()}:labels:pending-preset-v1`;
}

function setSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function numberField(label: string, name: string, value: string) {
  const wrapper = document.createElement("label");
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "number";
  input.step = "0.1";
  input.min = name === "columns" ? "1" : "0";
  input.value = value;
  wrapper.append(title, input);
  return wrapper;
}

function openDirectSizeEditor(page: HTMLElement, anchor: HTMLElement) {
  const existing = page.querySelector<HTMLElement>(".labelDirectSizeEditor");
  if (existing) {
    existing.remove();
    return;
  }

  const editor = document.createElement("form");
  editor.className = "labelDirectSizeEditor panel";
  editor.noValidate = true;

  const head = document.createElement("div");
  head.className = "labelDirectSizeHead";
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "New label size";
  const note = document.createElement("small");
  note.textContent = "All measurements are millimetres.";
  copy.append(title, note);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "labelDirectSizeClose";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close new label size");
  close.addEventListener("click", () => editor.remove());
  head.append(copy, close);
  editor.appendChild(head);

  const nameLabel = document.createElement("label");
  const nameTitle = document.createElement("span");
  nameTitle.textContent = "Name";
  const name = document.createElement("input");
  name.name = "name";
  name.type = "text";
  name.placeholder = "e.g. 50 × 30 mm · 2 across";
  nameLabel.append(nameTitle, name);

  const fields = document.createElement("div");
  fields.className = "labelDirectSizeFields";
  fields.append(
    nameLabel,
    numberField("Label width", "labelW", "50"),
    numberField("Label height", "labelH", "25"),
    numberField("Roll width", "rollW", "109"),
    numberField("Across", "columns", "2"),
    numberField("Outer margin", "outer", "3"),
    numberField("Horizontal gap", "gapX", "3"),
    numberField("Vertical gap", "gapY", "3"),
  );
  editor.appendChild(fields);

  const actions = document.createElement("div");
  actions.className = "labelDirectSizeActions";
  const error = document.createElement("span");
  error.className = "labelDirectSizeError";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => editor.remove());
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary";
  save.textContent = "Save size";
  actions.append(error, cancel, save);
  editor.appendChild(actions);

  editor.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(editor);
    const preset: StoredPreset = {
      id: `size-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(data.get("name") || "").trim(),
      labelW: Number(data.get("labelW")),
      labelH: Number(data.get("labelH")),
      rollW: Number(data.get("rollW")),
      columns: Math.max(1, Math.floor(Number(data.get("columns")))),
      outer: Number(data.get("outer")),
      gapX: Number(data.get("gapX")),
      gapY: Number(data.get("gapY")),
    };
    const numeric = [preset.labelW, preset.labelH, preset.rollW, preset.columns, preset.outer, preset.gapX, preset.gapY];
    if (!preset.name) {
      error.textContent = "Enter a size name.";
      name.focus();
      return;
    }
    if (numeric.some(value => !Number.isFinite(value) || value < 0) || preset.labelW <= 0 || preset.labelH <= 0 || preset.rollW <= 0 || preset.columns <= 0) {
      error.textContent = "Check the measurements.";
      return;
    }
    const requiredWidth = preset.outer * 2 + preset.labelW * preset.columns + preset.gapX * Math.max(0, preset.columns - 1);
    if (requiredWidth > preset.rollW + 0.01) {
      error.textContent = `Needs at least ${requiredWidth.toFixed(1)} mm roll width.`;
      return;
    }
    let saved: StoredPreset[] = [];
    try { saved = JSON.parse(localStorage.getItem(presetStorageKey()) || "[]") as StoredPreset[]; } catch { saved = []; }
    saved = saved.filter(item => item.id !== preset.id && item.name.toLowerCase() !== preset.name.toLowerCase());
    saved.push(preset);
    localStorage.setItem(presetStorageKey(), JSON.stringify(saved));
    localStorage.setItem(pendingPresetKey(), preset.id);
    window.location.reload();
  });

  anchor.insertAdjacentElement("afterend", editor);
  window.setTimeout(() => {
    editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
    name.focus({ preventScroll: true });
  }, 20);
}

function applyPendingPreset(select: HTMLSelectElement) {
  const pending = localStorage.getItem(pendingPresetKey());
  if (!pending) return;
  if (!Array.from(select.options).some(option => option.value === pending)) return;
  setSelect(select, pending);
  localStorage.removeItem(pendingPresetKey());
}

function enhanceSizeDropdown(page: HTMLElement) {
  const setup = page.querySelector<HTMLElement>(".labelSetup");
  if (!setup) return;
  const sizeLabel = Array.from(setup.querySelectorAll<HTMLLabelElement>(":scope > label"))
    .find(label => label.querySelector(":scope > span")?.textContent?.trim() === "Label size");
  const select = sizeLabel?.querySelector<HTMLSelectElement>("select");
  if (!sizeLabel || !select) return;

  applyPendingPreset(select);
  sizeLabel.querySelector(".labelSizeActions")?.remove();
  select.classList.add("labelFinalNativeSelect");

  let root = sizeLabel.querySelector<HTMLElement>(".labelFinalSizeSelect");
  if (!root) {
    root = document.createElement("div");
    root.className = "labelFinalSizeSelect";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "labelFinalSizeTrigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    const menu = document.createElement("div");
    menu.className = "labelFinalSizeMenu";
    menu.hidden = true;
    root.append(trigger, menu);
    select.insertAdjacentElement("afterend", root);

    trigger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      root!.classList.toggle("open", !menu.hidden);
    });
    document.addEventListener("pointerdown", event => {
      if (!root?.contains(event.target as Node)) {
        menu.hidden = true;
        root?.classList.remove("open");
      }
    });
  }

  const trigger = root.querySelector<HTMLButtonElement>(".labelFinalSizeTrigger")!;
  const menu = root.querySelector<HTMLElement>(".labelFinalSizeMenu")!;
  const selectedOption = select.options[select.selectedIndex] || select.options[0];
  trigger.innerHTML = `<span>${selectedOption?.textContent || "Choose label size"}</span><span class="labelFinalChevron">⌄</span>`;
  trigger.disabled = select.disabled;

  menu.replaceChildren();
  const optionsWrap = document.createElement("div");
  optionsWrap.className = "labelFinalSizeOptions";
  Array.from(select.options).forEach((option, index) => {
    const row = document.createElement("div");
    row.className = `labelFinalSizeOptionRow ${option.value === select.value ? "selected" : ""}`;
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "labelFinalSizeOption";
    choose.setAttribute("role", "option");
    choose.setAttribute("aria-selected", String(option.value === select.value));
    choose.innerHTML = `<span>${option.textContent || option.value}</span>${option.value === select.value ? "<b>✓</b>" : ""}`;
    choose.addEventListener("click", event => {
      event.preventDefault();
      setSelect(select, option.value);
      menu.hidden = true;
      root!.classList.remove("open");
    });
    row.appendChild(choose);

    const isBuiltIn = option.value === "pixra-109" || index === 0;
    if (!isBuiltIn) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "labelFinalSizeRemove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${option.textContent || "size"}`);
      remove.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        setSelect(select, option.value);
        window.setTimeout(() => {
          page.querySelector<HTMLButtonElement>('.labelSetup .iconButton[aria-label="Remove selected size preset"]')?.click();
        }, 0);
      });
      row.appendChild(remove);
    }
    optionsWrap.appendChild(row);
  });
  menu.appendChild(optionsWrap);

  const newSize = document.createElement("button");
  newSize.type = "button";
  newSize.className = "labelFinalSizeManage";
  newSize.dataset.labelAction = "new-size";
  newSize.textContent = "+ New size";
  menu.appendChild(newSize);

  const oldRemove = setup.querySelector<HTMLButtonElement>('.iconButton[aria-label="Remove selected size preset"]');
  if (oldRemove) oldRemove.classList.add("labelFinalHiddenAction");
}

function hardenWorkingRow(page: HTMLElement) {
  const grid = page.querySelector<HTMLElement>(".labelSelectionPreviewGrid, .labelDesignerGrid");
  if (!grid) return;
  grid.classList.add("labelFinalWorkingRow");
  const preview = grid.querySelector<HTMLElement>(".labelCanvasPanel");
  const records = grid.querySelector<HTMLElement>(".labelSidebar");
  preview?.classList.add("labelFinalPreviewCard");
  records?.classList.add("labelFinalRecordsCard");
}

function ensureDeleteTarget(page: HTMLElement) {
  const panel = page.querySelector<HTMLElement>(".labelCanvasPanel");
  if (!panel || panel.querySelector(".labelDragDeleteTarget")) return;
  const target = document.createElement("div");
  target.className = "labelDragDeleteTarget";
  target.setAttribute("aria-hidden", "true");
  target.innerHTML = '<span class="labelDragDeleteIcon">×</span><b>Remove</b>';
  panel.appendChild(target);
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
    enhanceSizeDropdown(page);
    hardenWorkingRow(page);
    ensureDeleteTarget(page);
  });
}

export function LabelDropdownFinal() {
  useEffect(() => {
    let frame = 0;
    let dragPage: HTMLElement | null = null;
    let dragElement: HTMLElement | null = null;
    let deleteArmed = false;

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };

    const delegatedClick = (event: MouseEvent) => {
      const action = (event.target as Element | null)?.closest<HTMLElement>('[data-label-action="new-size"]');
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const page = action.closest<HTMLElement>(".labelDesignerPage");
      const root = action.closest<HTMLElement>(".labelFinalSizeSelect");
      if (!page || !root) return;
      const menu = root.querySelector<HTMLElement>(".labelFinalSizeMenu");
      if (menu) menu.hidden = true;
      root.classList.remove("open");
      openDirectSizeEditor(page, root);
    };

    const pointerDown = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".labelDesignerPage .canvasElement");
      if (!element) return;
      const page = element.closest<HTMLElement>(".labelDesignerPage");
      const target = page?.querySelector<HTMLElement>(".labelDragDeleteTarget");
      if (!page || !target) return;
      dragPage = page;
      dragElement = element;
      deleteArmed = false;
      target.classList.add("visible");
      target.classList.remove("armed");
    };

    const pointerMove = (event: PointerEvent) => {
      if (!dragPage || !dragElement) return;
      const target = dragPage.querySelector<HTMLElement>(".labelDragDeleteTarget");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      deleteArmed = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      target.classList.toggle("armed", deleteArmed);
      dragElement.classList.toggle("deleteArmed", deleteArmed);
    };

    const finishDrag = () => {
      if (!dragPage) return;
      const page = dragPage;
      const element = dragElement;
      const armed = deleteArmed;
      const target = page.querySelector<HTMLElement>(".labelDragDeleteTarget");
      target?.classList.remove("visible", "armed");
      element?.classList.remove("deleteArmed");
      dragPage = null;
      dragElement = null;
      deleteArmed = false;
      if (!armed) return;
      window.setTimeout(() => {
        page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click();
      }, 0);
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", delegatedClick, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", delegatedClick, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
