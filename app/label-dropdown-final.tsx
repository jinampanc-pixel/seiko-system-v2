"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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

type SizeDraft = {
  name: string;
  labelW: string;
  labelH: string;
  rollW: string;
  columns: string;
  outer: string;
  gapX: string;
  gapY: string;
};

const emptyDraft: SizeDraft = {
  name: "",
  labelW: "50",
  labelH: "25",
  rollW: "109",
  columns: "2",
  outer: "3",
  gapX: "3",
  gapY: "3",
};

function activeBusiness() {
  if (typeof window === "undefined") return "seiko";
  const params = new URLSearchParams(window.location.search);
  return params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}

function presetStorageKey() {
  return `jinam:${activeBusiness()}:labels:presets-v1`;
}

function pendingPresetKey() {
  return `jinam:${activeBusiness()}:labels:pending-preset-v1`;
}

function readCustomPresets(): StoredPreset[] {
  try {
    return JSON.parse(localStorage.getItem(presetStorageKey()) || "[]") as StoredPreset[];
  } catch {
    return [];
  }
}

function setSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyPendingPreset(select: HTMLSelectElement) {
  const pending = localStorage.getItem(pendingPresetKey());
  if (!pending) return;
  if (!Array.from(select.options).some(option => option.value === pending)) return;
  setSelect(select, pending);
  localStorage.removeItem(pendingPresetKey());
}

function removePreset(id: string, select: HTMLSelectElement) {
  const next = readCustomPresets().filter(item => item.id !== id);
  localStorage.setItem(presetStorageKey(), JSON.stringify(next));
  localStorage.setItem(pendingPresetKey(), select.value === id ? "pixra-109" : select.value);
  window.location.reload();
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
  }

  const trigger = root.querySelector<HTMLButtonElement>(".labelFinalSizeTrigger")!;
  const menu = root.querySelector<HTMLElement>(".labelFinalSizeMenu")!;
  const selectedOption = select.options[select.selectedIndex] || select.options[0];
  trigger.innerHTML = `<span>${selectedOption?.textContent || "Choose label size"}</span><span class="labelFinalChevron">⌄</span>`;
  trigger.disabled = select.disabled;

  menu.replaceChildren();
  const optionsWrap = document.createElement("div");
  optionsWrap.className = "labelFinalSizeOptions";
  const customIds = new Set(readCustomPresets().map(item => item.id));

  Array.from(select.options).forEach(option => {
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

    if (customIds.has(option.value)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "labelFinalSizeRemove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${option.textContent || "size"}`);
      remove.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        removePreset(option.value, select);
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

  setup.querySelector<HTMLButtonElement>('.iconButton[aria-label="Remove selected size preset"]')?.classList.add("labelFinalHiddenAction");
}

function hardenWorkingRow(page: HTMLElement) {
  const grid = page.querySelector<HTMLElement>(".labelSelectionPreviewGrid, .labelDesignerGrid");
  if (!grid) return;
  grid.classList.add("labelFinalWorkingRow");
  grid.querySelector<HTMLElement>(".labelCanvasPanel")?.classList.add("labelFinalPreviewCard");
  grid.querySelector<HTMLElement>(".labelSidebar")?.classList.add("labelFinalRecordsCard");
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

function SizeEditor({ draft, setDraft, error, setError, onClose }: {
  draft: SizeDraft;
  setDraft: (next: SizeDraft) => void;
  error: string;
  setError: (message: string) => void;
  onClose: () => void;
}) {
  const fields = useMemo(() => [
    ["labelW", "Label width"],
    ["labelH", "Label height"],
    ["rollW", "Roll width"],
    ["columns", "Across"],
    ["outer", "Outer margin"],
    ["gapX", "Horizontal gap"],
    ["gapY", "Vertical gap"],
  ] as const, []);

  const save = () => {
    const preset: StoredPreset = {
      id: `size-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: draft.name.trim(),
      labelW: Number(draft.labelW),
      labelH: Number(draft.labelH),
      rollW: Number(draft.rollW),
      columns: Math.max(1, Math.floor(Number(draft.columns))),
      outer: Number(draft.outer),
      gapX: Number(draft.gapX),
      gapY: Number(draft.gapY),
    };
    const numeric = [preset.labelW, preset.labelH, preset.rollW, preset.columns, preset.outer, preset.gapX, preset.gapY];
    if (!preset.name) return setError("Enter a size name.");
    if (numeric.some(value => !Number.isFinite(value) || value < 0) || preset.labelW <= 0 || preset.labelH <= 0 || preset.rollW <= 0 || preset.columns <= 0) return setError("Check the measurements.");
    const requiredWidth = preset.outer * 2 + preset.labelW * preset.columns + preset.gapX * Math.max(0, preset.columns - 1);
    if (requiredWidth > preset.rollW + 0.01) return setError(`Needs at least ${requiredWidth.toFixed(1)} mm roll width.`);

    const saved = readCustomPresets().filter(item => item.name.toLowerCase() !== preset.name.toLowerCase());
    saved.push(preset);
    localStorage.setItem(presetStorageKey(), JSON.stringify(saved));
    localStorage.setItem(pendingPresetKey(), preset.id);
    window.location.reload();
  };

  return createPortal(<div className="labelSizeModalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="labelDirectSizeEditor labelDirectSizeModal panel" onSubmit={event => { event.preventDefault(); save(); }}>
      <div className="labelDirectSizeHead"><div><h3>New label size</h3><small>All measurements are millimetres.</small></div><button type="button" className="labelDirectSizeClose" aria-label="Close new label size" onClick={onClose}>×</button></div>
      <div className="labelDirectSizeFields">
        <label className="labelSizeName"><span>Name</span><input autoFocus value={draft.name} placeholder="e.g. 50 × 30 mm · 2 across" onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
        {fields.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min={key === "columns" ? 1 : 0} step={key === "columns" ? 1 : .1} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })}/></label>)}
      </div>
      <div className="labelDirectSizeActions"><span className="labelDirectSizeError">{error}</span><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save size</button></div>
    </form>
  </div>, document.body);
}

export function LabelDropdownFinal() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<SizeDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    let frame = 0;
    let dragPage: HTMLElement | null = null;
    let dragElement: HTMLElement | null = null;
    let deleteArmed = false;

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };
    const click = (event: MouseEvent) => {
      const action = (event.target as Element | null)?.closest<HTMLElement>('[data-label-action="new-size"]');
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      const root = action.closest<HTMLElement>(".labelFinalSizeSelect");
      const menu = root?.querySelector<HTMLElement>(".labelFinalSizeMenu");
      if (menu) menu.hidden = true;
      root?.classList.remove("open");
      setError("");
      setDraft(emptyDraft);
      setEditorOpen(true);
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      document.querySelectorAll<HTMLElement>(".labelFinalSizeSelect.open").forEach(root => {
        if (root.contains(target)) return;
        root.classList.remove("open");
        const menu = root.querySelector<HTMLElement>(".labelFinalSizeMenu");
        if (menu) menu.hidden = true;
      });
    };
    const pointerDown = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>(".labelDesignerPage .canvasElement");
      if (!element) return;
      const page = element.closest<HTMLElement>(".labelDesignerPage");
      const target = page?.querySelector<HTMLElement>(".labelDragDeleteTarget");
      if (!page || !target) return;
      dragPage = page; dragElement = element; deleteArmed = false;
      target.classList.add("visible"); target.classList.remove("armed");
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
      const page = dragPage, element = dragElement, armed = deleteArmed;
      const target = page.querySelector<HTMLElement>(".labelDragDeleteTarget");
      target?.classList.remove("visible", "armed"); element?.classList.remove("deleteArmed");
      dragPage = null; dragElement = null; deleteArmed = false;
      if (!armed) return;
      window.setTimeout(() => page.querySelector<HTMLButtonElement>('.labelProperties .iconButton[aria-label="Remove selected element"]')?.click(), 0);
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", click, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", finishDrag, true);
    document.addEventListener("pointercancel", finishDrag, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", finishDrag, true);
      document.removeEventListener("pointercancel", finishDrag, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return editorOpen ? <SizeEditor draft={draft} setDraft={setDraft} error={error} setError={setError} onClose={() => setEditorOpen(false)}/> : null;
}
