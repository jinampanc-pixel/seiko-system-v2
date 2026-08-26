"use client";

import { useEffect } from "react";

function setSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function enhanceSizeDropdown(page: HTMLElement) {
  const setup = page.querySelector<HTMLElement>(".labelSetup");
  if (!setup) return;
  const sizeLabel = Array.from(setup.querySelectorAll<HTMLLabelElement>(":scope > label"))
    .find(label => label.querySelector(":scope > span")?.textContent?.trim() === "Label size");
  const select = sizeLabel?.querySelector<HTMLSelectElement>("select");
  if (!sizeLabel || !select) return;

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
  newSize.textContent = "+ New size";
  newSize.addEventListener("click", event => {
    event.preventDefault();
    menu.hidden = true;
    root!.classList.remove("open");
    page.querySelector<HTMLButtonElement>(".canvasSizeButton")?.click();
  });
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

function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
    enhanceSizeDropdown(page);
    hardenWorkingRow(page);
  });
}

export function LabelDropdownFinal() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };
    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
