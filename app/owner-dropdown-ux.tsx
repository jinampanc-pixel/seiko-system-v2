"use client";

import { useEffect } from "react";

type StoredChoice = { label: string; value: string };
type ChoiceStore = { hidden: string[]; aliases: StoredChoice[] };

let comboSequence = 0;

function businessId() {
  return localStorage.getItem("jinam:selected-business") || "seiko";
}

function choiceKey(kind: string) {
  return `jinam:${businessId()}:owner-choice:${kind}:v1`;
}

function loadChoiceStore(kind: string): ChoiceStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(choiceKey(kind)) || "null") as ChoiceStore | null;
    return { hidden: parsed?.hidden || [], aliases: parsed?.aliases || [] };
  } catch {
    return { hidden: [], aliases: [] };
  }
}

function saveChoiceStore(kind: string, store: ChoiceStore) {
  localStorage.setItem(choiceKey(kind), JSON.stringify(store));
}

function suggestionKey(kind: string) {
  return `jinam:${businessId()}:owner-suggestions:${kind}:v1`;
}

function loadSuggestions(kind: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(suggestionKey(kind)) || "[]") as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSuggestions(kind: string, values: string[]) {
  localStorage.setItem(suggestionKey(kind), JSON.stringify(values));
}

function isOwnerSetup() {
  return Boolean(document.querySelector(".orderSetup .policyRow .iconRemove"));
}

function placeOverlay(target: HTMLElement, overlay: HTMLElement) {
  const rect = target.getBoundingClientRect();
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}

function enhanceEditableSelect(select: HTMLSelectElement, kind: string) {
  if (select.dataset.ownerComboReady === "true") return;
  select.dataset.ownerComboReady = "true";
  select.classList.add("ownerEditableNative");
  select.tabIndex = -1;

  const targetId = `owner-combo-${++comboSequence}`;
  select.dataset.ownerComboId = targetId;

  const overlay = document.createElement("div");
  overlay.className = "ownerComboOverlay";
  overlay.dataset.ownerComboFor = targetId;

  const input = document.createElement("input");
  input.className = "ownerComboInput";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.autocomplete = "off";

  const panel = document.createElement("div");
  panel.className = "ownerComboPanel";
  panel.hidden = true;

  overlay.append(input, panel);
  document.body.appendChild(overlay);

  const canonical = () => Array.from(select.options).map(option => ({ label: option.textContent?.trim() || option.value, value: option.value }));
  const canonicalLabel = () => canonical().find(item => item.value === select.value)?.label || select.value;

  const close = () => {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };

  const choose = (choice: StoredChoice) => {
    const canonicalMatch = canonical().find(item => item.value === choice.value);
    if (!canonicalMatch) return;
    select.value = choice.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    input.value = choice.label;
    input.dataset.displayValue = choice.value;
    input.dataset.displayLabel = choice.label;
    close();
  };

  const render = (filter = "") => {
    const store = loadChoiceStore(kind);
    const query = filter.trim().toLowerCase();
    const rows: Array<StoredChoice & { alias: boolean }> = [
      ...canonical().filter(item => !store.hidden.includes(item.value)).map(item => ({ ...item, alias: false })),
      ...store.aliases.map(item => ({ ...item, alias: true })),
    ].filter(item => !query || item.label.toLowerCase().includes(query));

    panel.replaceChildren();
    rows.forEach(row => {
      const line = document.createElement("div");
      line.className = "ownerComboChoice";

      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "ownerComboPick";
      pick.textContent = row.label;
      pick.addEventListener("mousedown", event => event.preventDefault());
      pick.addEventListener("click", () => choose(row));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ownerComboRemove";
      remove.textContent = "×";
      remove.title = `Remove ${row.label}`;
      remove.addEventListener("mousedown", event => event.preventDefault());
      remove.addEventListener("click", event => {
        event.stopPropagation();
        const next = loadChoiceStore(kind);
        if (row.alias) next.aliases = next.aliases.filter(item => !(item.label === row.label && item.value === row.value));
        else if (!next.hidden.includes(row.value)) next.hidden.push(row.value);
        saveChoiceStore(kind, next);
        render(input.value);
      });

      line.append(pick, remove);
      panel.appendChild(line);
    });

    const footer = document.createElement("div");
    footer.className = "ownerComboFooter";
    footer.textContent = "Type a new label + Enter";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.addEventListener("mousedown", event => event.preventDefault());
    reset.addEventListener("click", () => {
      saveChoiceStore(kind, { hidden: [], aliases: [] });
      input.value = canonicalLabel();
      render();
    });
    footer.appendChild(reset);
    panel.appendChild(footer);
  };

  const open = () => {
    render("");
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  input.value = canonicalLabel();
  input.placeholder = "+ Type or choose";
  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("input", () => {
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    render(input.value);
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      input.value = canonicalLabel();
      close();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const typed = input.value.trim();
    if (!typed) return;

    const allCanonical = canonical();
    const exactCanonical = allCanonical.find(item => item.label.toLowerCase() === typed.toLowerCase());
    if (exactCanonical) {
      const store = loadChoiceStore(kind);
      store.hidden = store.hidden.filter(value => value !== exactCanonical.value);
      saveChoiceStore(kind, store);
      choose(exactCanonical);
      return;
    }

    const store = loadChoiceStore(kind);
    const exactAlias = store.aliases.find(item => item.label.toLowerCase() === typed.toLowerCase());
    if (exactAlias) {
      choose(exactAlias);
      return;
    }

    store.aliases.push({ label: typed, value: select.value });
    saveChoiceStore(kind, store);
    input.dataset.displayValue = select.value;
    input.dataset.displayLabel = typed;
    close();
  });

  select.addEventListener("change", () => {
    if (input.dataset.displayValue !== select.value) {
      input.value = canonicalLabel();
      delete input.dataset.displayLabel;
      delete input.dataset.displayValue;
    }
  });

  const place = () => placeOverlay(select, overlay);
  place();
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);

  const outside = (event: MouseEvent) => {
    if (!overlay.contains(event.target as Node)) close();
  };
  document.addEventListener("mousedown", outside);
}

function enhanceManagedFreeText(input: HTMLInputElement, kind: string, seeds: string[]) {
  if (input.dataset.ownerSuggestReady === "true") return;
  input.dataset.ownerSuggestReady = "true";

  const panel = document.createElement("div");
  panel.className = "ownerTextSuggestPanel";
  panel.hidden = true;
  document.body.appendChild(panel);

  const learn = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const values = loadSuggestions(kind);
    if (!values.some(item => item.toLowerCase() === clean.toLowerCase())) {
      values.push(clean);
      saveSuggestions(kind, values);
    }
  };

  seeds.forEach(learn);
  if (input.value.trim()) learn(input.value);

  const place = () => {
    const rect = input.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.width = `${rect.width}px`;
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    const values = loadSuggestions(kind).filter(value => !query || value.toLowerCase().includes(query));
    panel.replaceChildren();
    values.forEach(value => {
      const row = document.createElement("div");
      row.className = "ownerComboChoice";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "ownerComboPick";
      pick.textContent = value;
      pick.addEventListener("mousedown", event => event.preventDefault());
      pick.addEventListener("click", () => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        panel.hidden = true;
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ownerComboRemove";
      remove.textContent = "×";
      remove.addEventListener("mousedown", event => event.preventDefault());
      remove.addEventListener("click", event => {
        event.stopPropagation();
        saveSuggestions(kind, loadSuggestions(kind).filter(item => item !== value));
        render();
      });
      row.append(pick, remove);
      panel.appendChild(row);
    });
    const footer = document.createElement("div");
    footer.className = "ownerComboFooter";
    footer.textContent = "Type a new option + Enter";
    panel.appendChild(footer);
  };

  const open = () => {
    place();
    render();
    panel.hidden = false;
  };

  input.addEventListener("focus", open);
  input.addEventListener("input", () => {
    place();
    render();
    panel.hidden = false;
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    learn(input.value);
    render();
  });
  input.addEventListener("blur", () => {
    learn(input.value);
    window.setTimeout(() => { panel.hidden = true; }, 120);
  });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
}

function reorderOrderMenu() {
  document.querySelectorAll<HTMLElement>(".orderActionMenu").forEach(menu => {
    const status = menu.querySelector<HTMLElement>(".orderMenuStatus");
    const edit = Array.from(menu.querySelectorAll<HTMLButtonElement>(":scope > button")).find(button => button.textContent?.trim() === "Edit setup");
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
    let enhancing = false;

    const enhance = () => {
      if (enhancing) return;
      enhancing = true;
      try {
        reorderOrderMenu();
        cleanSpecificationButton();

        if (!isOwnerSetup()) return;

        document.querySelectorAll<HTMLElement>(".orderSetup .policyRow").forEach(row => {
          const typeSelect = row.querySelector<HTMLSelectElement>("select");
          if (typeSelect) {
            const listOption = Array.from(typeSelect.options).find(option => option.value === "dropdown");
            if (listOption && listOption.textContent !== "Dropdown · manage options") {
              listOption.textContent = "Dropdown · manage options";
            }
            if (typeSelect.dataset.ownerListSelect !== "true") typeSelect.dataset.ownerListSelect = "true";
            if (typeSelect.title !== "Choose this to type, add and remove dropdown options") {
              typeSelect.title = "Choose this to type, add and remove dropdown options";
            }
          }
          const optionInput = row.querySelector<HTMLInputElement>(".optionEditor > input");
          if (optionInput) {
            if (optionInput.placeholder !== "+ Add option — type and press Enter") {
              optionInput.placeholder = "+ Add option — type and press Enter";
            }
            if (optionInput.title !== "Type a new dropdown option and press Enter") {
              optionInput.title = "Type a new dropdown option and press Enter";
            }
          }
        });

        document.querySelectorAll<HTMLSelectElement>(".orderSetup .productPolicyTop label > select").forEach(select => {
          const label = select.closest("label");
          const title = label?.querySelector(":scope > span")?.textContent?.trim();
          if (title === "Quantity") enhanceEditableSelect(select, "quantity-mode");
        });

        document.querySelectorAll<HTMLSelectElement>('.orderSetup .specPolicy select[aria-label="Specification type"]').forEach(select => {
          enhanceEditableSelect(select, "specification-type");
        });

        document.querySelectorAll<HTMLInputElement>('.orderSetup .specPolicy > input[placeholder^="Colour, pattern, artwork"]').forEach(input => {
          enhanceManagedFreeText(input, "specification-names", ["Colour", "Pattern/design", "Other detail", "Artwork/logo"]);
        });
      } finally {
        enhancing = false;
      }
    };

    const scheduleEnhance = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhance();
      });
    };

    enhance();
    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        if (target.closest?.(".ownerComboOverlay,.ownerTextSuggestPanel")) return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (relevant) scheduleEnhance();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll(".ownerComboOverlay,.ownerTextSuggestPanel").forEach(node => node.remove());
    };
  }, []);

  return null;
}
