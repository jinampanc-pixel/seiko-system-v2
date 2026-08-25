"use client";

import { useEffect } from "react";

type StoredChoice = { label: string; value: string };
type ChoiceStore = { hidden: string[]; aliases: StoredChoice[] };

function businessId() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function choiceKey(kind: string) {
  return `jinam:${businessId()}:owner-choice:${kind}:v2`;
}

function normalizeStore(store: ChoiceStore, canonical: StoredChoice[]): ChoiceStore {
  const validValues = new Set(canonical.map(item => item.value));
  const canonicalLabels = new Set(canonical.map(item => item.label.trim().toLowerCase()));
  const hidden = [...new Set((store.hidden || []).filter(value => validValues.has(value)))];
  const seen = new Set<string>();
  const aliases = (store.aliases || []).filter(item => {
    const label = item.label.trim();
    const key = label.toLowerCase();
    if (!label || !validValues.has(item.value) || canonicalLabels.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => ({ label: item.label.trim(), value: item.value }));
  return { hidden, aliases };
}

function loadChoiceStore(kind: string, canonical: StoredChoice[]): ChoiceStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(choiceKey(kind)) || "null") as ChoiceStore | null;
    const normalized = normalizeStore({ hidden: parsed?.hidden || [], aliases: parsed?.aliases || [] }, canonical);
    localStorage.setItem(choiceKey(kind), JSON.stringify(normalized));
    return normalized;
  } catch {
    return { hidden: [], aliases: [] };
  }
}

function saveChoiceStore(kind: string, store: ChoiceStore, canonical: StoredChoice[]) {
  localStorage.setItem(choiceKey(kind), JSON.stringify(normalizeStore(store, canonical)));
}

function isOwnerSetup() {
  return Boolean(document.querySelector(".orderSetup .policyRow .iconRemove"));
}

function enhanceEditableSelect(select: HTMLSelectElement, kind: string) {
  if (select.dataset.ownerComboReady === "true") return;
  select.dataset.ownerComboReady = "true";

  const canonical = () => Array.from(select.options).map(option => ({
    label: option.textContent?.trim() || option.value,
    value: option.value,
  }));
  const canonicalLabel = () => canonical().find(item => item.value === select.value)?.label || select.value;

  const wrapper = document.createElement("div");
  wrapper.className = "ownerManagedSelect";

  const input = document.createElement("input");
  input.className = "ownerManagedSelectInput";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");
  input.autocomplete = "off";

  const chevron = document.createElement("button");
  chevron.type = "button";
  chevron.className = "ownerManagedChevron";
  chevron.setAttribute("aria-label", "Show choices");
  chevron.textContent = "⌄";

  const panel = document.createElement("div");
  panel.className = "ownerManagedPanel";
  panel.hidden = true;

  wrapper.append(input, chevron, panel);
  select.insertAdjacentElement("afterend", wrapper);
  select.classList.add("ownerEditableNative");
  select.tabIndex = -1;

  const close = () => {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const syncInput = () => {
    const store = loadChoiceStore(kind, canonical());
    const remembered = input.dataset.displayValue === select.value
      ? store.aliases.find(item => item.label === input.dataset.displayLabel && item.value === select.value)
      : undefined;
    input.value = remembered?.label || canonicalLabel();
    if (!remembered) {
      delete input.dataset.displayValue;
      delete input.dataset.displayLabel;
    }
  };

  const choose = (choice: StoredChoice) => {
    if (!canonical().some(item => item.value === choice.value)) return;
    select.value = choice.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    input.value = choice.label;
    input.dataset.displayValue = choice.value;
    input.dataset.displayLabel = choice.label;
    close();
  };

  const render = (filter = "") => {
    const base = canonical();
    const store = loadChoiceStore(kind, base);
    const query = filter.trim().toLowerCase();
    const rows: Array<StoredChoice & { alias: boolean }> = [
      ...base.filter(item => !store.hidden.includes(item.value)).map(item => ({ ...item, alias: false })),
      ...store.aliases.map(item => ({ ...item, alias: true })),
    ].filter(item => !query || item.label.toLowerCase().includes(query));

    panel.replaceChildren();
    rows.forEach(row => {
      const line = document.createElement("div");
      line.className = "ownerManagedChoice";

      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "ownerManagedPick";
      pick.textContent = row.label;
      pick.addEventListener("mousedown", event => event.preventDefault());
      pick.addEventListener("click", () => choose(row));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ownerManagedRemove";
      remove.textContent = "×";
      remove.title = `Remove ${row.label}`;
      remove.addEventListener("mousedown", event => event.preventDefault());
      remove.addEventListener("click", event => {
        event.stopPropagation();
        const next = loadChoiceStore(kind, base);
        if (row.alias) next.aliases = next.aliases.filter(item => !(item.label === row.label && item.value === row.value));
        else if (!next.hidden.includes(row.value)) next.hidden.push(row.value);
        saveChoiceStore(kind, next, base);
        render(input.value === canonicalLabel() ? "" : input.value);
      });

      line.append(pick, remove);
      panel.appendChild(line);
    });

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "ownerManagedEmpty";
      empty.textContent = "No matching choice";
      panel.appendChild(empty);
    }

    const footer = document.createElement("div");
    footer.className = "ownerManagedFooter";
    const help = document.createElement("span");
    help.textContent = "Type a new label + Enter";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.addEventListener("mousedown", event => event.preventDefault());
    reset.addEventListener("click", () => {
      saveChoiceStore(kind, { hidden: [], aliases: [] }, base);
      syncInput();
      render();
    });
    footer.append(help, reset);
    panel.appendChild(footer);
  };

  const open = (filter = "") => {
    render(filter);
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.value = canonicalLabel();
  input.placeholder = "Type or choose";
  input.addEventListener("focus", () => open());
  input.addEventListener("click", () => open());
  input.addEventListener("input", () => open(input.value));
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      syncInput();
      close();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const typed = input.value.trim();
    if (!typed) return;

    const base = canonical();
    const exactCanonical = base.find(item => item.label.toLowerCase() === typed.toLowerCase());
    if (exactCanonical) {
      const store = loadChoiceStore(kind, base);
      store.hidden = store.hidden.filter(value => value !== exactCanonical.value);
      saveChoiceStore(kind, store, base);
      choose(exactCanonical);
      return;
    }

    const store = loadChoiceStore(kind, base);
    const exactAlias = store.aliases.find(item => item.label.toLowerCase() === typed.toLowerCase());
    if (exactAlias) {
      choose(exactAlias);
      return;
    }

    // Custom owner wording reuses the currently selected real system behaviour.
    store.aliases.push({ label: typed, value: select.value });
    saveChoiceStore(kind, store, base);
    input.dataset.displayValue = select.value;
    input.dataset.displayLabel = typed;
    input.value = typed;
    close();
  });

  chevron.addEventListener("mousedown", event => event.preventDefault());
  chevron.addEventListener("click", () => panel.hidden ? open() : close());

  select.addEventListener("change", () => {
    if (input.dataset.displayValue !== select.value) syncInput();
  });

  document.addEventListener("mousedown", event => {
    if (!wrapper.contains(event.target as Node)) close();
  });
}

function reorderOrderMenu() {
  document.querySelectorAll<HTMLElement>(".orderActionMenu").forEach(menu => {
    const status = menu.querySelector<HTMLElement>(".orderMenuStatus");
    const edit = Array.from(menu.querySelectorAll<HTMLButtonElement>(":scope > button"))
      .find(button => button.textContent?.trim() === "Edit setup");
    if (status && edit && status.nextElementSibling !== edit) menu.insertBefore(edit, status.nextSibling);
  });
}

function cleanSpecificationButton() {
  document.querySelectorAll<HTMLButtonElement>('.specActions button[aria-label="Add specification"]').forEach(button => {
    button.classList.add("specButtonClean");
    if (button.textContent !== "+ Specification") button.textContent = "+ Specification";
  });
}

export function OwnerDropdownUx() {
  useEffect(() => {
    let frame = 0;

    const enhance = () => {
      reorderOrderMenu();
      cleanSpecificationButton();
      if (!isOwnerSetup()) return;

      document.querySelectorAll<HTMLElement>(".orderSetup .policyRow").forEach(row => {
        const typeSelect = row.querySelector<HTMLSelectElement>("select");
        if (typeSelect) {
          const listOption = Array.from(typeSelect.options).find(option => option.value === "dropdown");
          if (listOption && listOption.textContent !== "Dropdown · manage options") listOption.textContent = "Dropdown · manage options";
        }
        const optionInput = row.querySelector<HTMLInputElement>(".optionEditor > input");
        if (optionInput) optionInput.placeholder = "+ Add option — type and press Enter";
      });

      document.querySelectorAll<HTMLSelectElement>(".orderSetup .productPolicyTop label > select").forEach(select => {
        const title = select.closest("label")?.querySelector(":scope > span")?.textContent?.trim();
        if (title === "Quantity") enhanceEditableSelect(select, "quantity-mode");
      });

      document.querySelectorAll<HTMLSelectElement>('.orderSetup .specPolicy select[aria-label="Specification type"]').forEach(select => {
        enhanceEditableSelect(select, "specification-type");
      });

      document.querySelectorAll<HTMLSelectElement>('.orderSetup .specPolicy select[aria-label="Value assignment method"]').forEach(select => {
        enhanceEditableSelect(select, "specification-value-mode");
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhance();
      });
    };

    enhance();
    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length)) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll(".ownerManagedSelect").forEach(node => node.remove());
      document.querySelectorAll(".ownerEditableNative").forEach(node => node.classList.remove("ownerEditableNative"));
    };
  }, []);

  return null;
}
