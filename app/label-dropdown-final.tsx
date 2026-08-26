"use client";

import { useEffect } from "react";

function setSelect(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function revealSizeEditor(page: HTMLElement, anchor: HTMLElement) {
  let attempts = 0;
  const reveal = () => {
    attempts += 1;
    const editor = page.querySelector<HTMLElement>(".customSize");
    if (!editor) {
      if (attempts < 24) window.setTimeout(reveal, 35);
      return;
    }
    editor.classList.add("labelFinalSizeEditor");
    editor.dataset.openedFromDropdown = "true";
    anchor.insertAdjacentElement("afterend", editor);
    const firstInput = editor.querySelector<HTMLInputElement>('input[type="text"],input');
    window.setTimeout(() => {
      editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
      firstInput?.focus({ preventScroll: true });
    }, 30);
  };
  reveal();
}

function openNativeSizeEditor(page: HTMLElement, anchor: HTMLElement) {
  const trigger = page.querySelector<HTMLButtonElement>(".canvasSizeButton")
    || Array.from(page.querySelectorAll<HTMLButtonElement>("button")).find(button => /label sizes/i.test(button.textContent || ""));
  if (!trigger) return;
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  revealSizeEditor(page, anchor);
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
    event.stopPropagation();
    menu.hidden = true;
    root!.classList.remove("open");
    openNativeSizeEditor(page, root!);
  });
  menu.appendChild(newSize);

  const oldRemove = setup.querySelector<HTMLButtonElement>('.iconButton[aria-label="Remove selected size preset"]');
  if (oldRemove) oldRemove.classList.add("labelFinalHiddenAction");

  const editor = page.querySelector<HTMLElement>('.customSize[data-opened-from-dropdown="true"]');
  if (editor && editor.previousElementSibling !== root) root.insertAdjacentElement("afterend", editor);
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
