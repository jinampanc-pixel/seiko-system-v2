"use client";

import { useEffect } from "react";

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setReactSelectValue(select: HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function sectionByTitle(title: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".orderSetup > .setupSection"))
    .find(section => section.querySelector(".sectionTitle h3")?.textContent?.trim() === title);
}

function manageSourcePicker(picker: HTMLElement) {
  if (picker.dataset.ownerSourceReady === "true") return;
  const select = picker.querySelector<HTMLSelectElement>(":scope > label > select");
  if (!select) return;
  picker.dataset.ownerSourceReady = "true";
  select.classList.add("sourceNativeHidden");
  select.tabIndex = -1;

  const wrapper = document.createElement("div");
  wrapper.className = "sourceOwnerCombo";
  const input = document.createElement("input");
  input.className = "sourceOwnerInput";
  input.setAttribute("role", "combobox");
  input.autocomplete = "off";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sourceOwnerToggle";
  toggle.textContent = "⌄";
  const panel = document.createElement("div");
  panel.className = "sourceOwnerPanel";
  panel.hidden = true;
  wrapper.append(input, toggle, panel);
  select.insertAdjacentElement("afterend", wrapper);

  const selectedLabel = () => select.options[select.selectedIndex]?.textContent?.trim() || "Choose a person / record field";
  const close = () => { panel.hidden = true; };

  const choose = (value: string) => {
    setReactSelectValue(select, value);
    input.value = selectedLabel();
    close();
  };

  const removeRealField = (label: string) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".orderSetup .personDetails .policyRow"));
    const row = rows.find(item => item.querySelector<HTMLInputElement>(":scope > input")?.value.trim() === label.trim());
    row?.querySelector<HTMLButtonElement>(".iconRemove")?.click();
  };

  const createRealField = (name: string) => {
    const button = picker.querySelector<HTMLButtonElement>(".newSourceButton");
    button?.click();
    window.setTimeout(() => {
      const createBox = picker.querySelector<HTMLInputElement>('.sourceFieldCreate input[aria-label="New source field name"]');
      const add = picker.querySelector<HTMLButtonElement>(".sourceFieldCreate .secondary");
      if (!createBox || !add) return;
      setReactInputValue(createBox, name);
      add.click();
      window.setTimeout(() => {
        input.value = selectedLabel();
        close();
      }, 40);
    }, 20);
  };

  const render = (query = "") => {
    const q = query.trim().toLowerCase();
    panel.replaceChildren();
    Array.from(select.options).forEach((option, index) => {
      const label = option.textContent?.trim() || option.value;
      if (!label || (q && !label.toLowerCase().includes(q))) return;
      const row = document.createElement("div");
      row.className = "sourceOwnerChoice";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "sourceOwnerPick";
      pick.textContent = label;
      pick.addEventListener("mousedown", event => event.preventDefault());
      pick.addEventListener("click", () => choose(option.value));
      row.appendChild(pick);
      if (index > 0) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "sourceOwnerRemove";
        remove.textContent = "×";
        remove.title = `Remove ${label} from Person details`;
        remove.addEventListener("mousedown", event => event.preventDefault());
        remove.addEventListener("click", event => {
          event.stopPropagation();
          removeRealField(label);
          window.setTimeout(() => render(input.value), 30);
        });
        row.appendChild(remove);
      }
      panel.appendChild(row);
    });
    const footer = document.createElement("div");
    footer.className = "sourceOwnerFooter";
    footer.textContent = "Type a new Person detail + Enter";
    panel.appendChild(footer);
  };

  input.value = selectedLabel();
  input.addEventListener("focus", () => { render(); panel.hidden = false; });
  input.addEventListener("click", () => { render(); panel.hidden = false; });
  input.addEventListener("input", () => { render(input.value); panel.hidden = false; });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { input.value = selectedLabel(); close(); return; }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const typed = input.value.trim();
    if (!typed) return;
    const exact = Array.from(select.options).find(option => option.textContent?.trim().toLowerCase() === typed.toLowerCase());
    if (exact) choose(exact.value); else createRealField(typed);
  });
  toggle.addEventListener("mousedown", event => event.preventDefault());
  toggle.addEventListener("click", () => { if (panel.hidden) { render(); panel.hidden = false; } else close(); });
  select.addEventListener("change", () => { input.value = selectedLabel(); });
  document.addEventListener("mousedown", event => { if (!wrapper.contains(event.target as Node)) close(); });
}

function lockIrrelevantDefaults() {
  document.querySelectorAll<HTMLElement>(".orderSetup .productPolicy").forEach(card => {
    const quantitySelect = card.querySelector<HTMLSelectElement>(".productPolicyTop label > select");
    const inputs = Array.from(card.querySelectorAll<HTMLInputElement>(".productPolicyTop input"));
    const quantityInput = inputs.at(-1);
    if (quantitySelect && quantityInput) {
      const blocked = quantitySelect.value === "by_group" || quantitySelect.value === "per_person";
      quantityInput.disabled = blocked;
      quantityInput.classList.toggle("modeBlockedInput", blocked);
      if (blocked) quantityInput.value = "";
    }

    card.querySelectorAll<HTMLElement>(".specPolicy").forEach(row => {
      const mode = row.querySelector<HTMLSelectElement>('select[aria-label="Value assignment method"]');
      const value = row.querySelector<HTMLInputElement>('input[aria-label="Order or default value"]');
      if (!mode || !value) return;
      const blocked = mode.value === "by_group" || mode.value === "per_person";
      value.disabled = blocked;
      value.classList.toggle("modeBlockedInput", blocked);
      if (blocked) value.value = "";
    });
  });
}

function addSetupClasses() {
  sectionByTitle("Person details")?.classList.add("personDetails");
  sectionByTitle("Product details")?.classList.add("productDetailsSection");
  sectionByTitle("Measurements for products")?.classList.add("measurementRegistry");
}

function syncProxyInput(proxy: HTMLInputElement, original: HTMLInputElement) {
  proxy.value = original.value;
  proxy.addEventListener("input", () => setReactInputValue(original, proxy.value));
}

function syncProxySelect(proxy: HTMLSelectElement, original: HTMLSelectElement) {
  proxy.innerHTML = original.innerHTML;
  proxy.value = original.value;
  proxy.addEventListener("change", () => setReactSelectValue(original, proxy.value));
}

function buildProductMeasurements() {
  const registry = sectionByTitle("Measurements for products");
  const productSection = sectionByTitle("Product details");
  if (!registry || !productSection) return;
  registry.classList.add("measurementRegistry");
  const cards = Array.from(productSection.querySelectorAll<HTMLElement>(".productPolicy"));
  const measurementRows = Array.from(registry.querySelectorAll<HTMLElement>(".measurementRow"));
  const addRegistryButton = registry.querySelector<HTMLButtonElement>(".sectionTitle .secondary");

  cards.forEach((card, productIndex) => {
    let panel = card.querySelector<HTMLElement>(":scope > .productMeasurements");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "productMeasurements";
      card.appendChild(panel);
    }
    panel.replaceChildren();

    const head = document.createElement("div");
    head.className = "productMeasurementsHead";
    const title = document.createElement("div");
    const strong = document.createElement("b");
    strong.textContent = "Measurements";
    const note = document.createElement("span");
    note.textContent = "Measurements used for this product";
    title.append(strong, note);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "secondary productMeasurementAdd";
    add.textContent = "+ Measurement";
    add.addEventListener("click", () => {
      addRegistryButton?.click();
      window.setTimeout(() => {
        const rows = Array.from(registry.querySelectorAll<HTMLElement>(".measurementRow"));
        const newest = rows.at(-1);
        const checkbox = newest?.querySelectorAll<HTMLInputElement>(".productChip input")[productIndex];
        if (checkbox && !checkbox.checked) checkbox.click();
        window.setTimeout(() => {
          buildProductMeasurements();
          const freshPanel = card.querySelector<HTMLElement>(":scope > .productMeasurements");
          freshPanel?.querySelector<HTMLInputElement>(".productMeasurementRow:last-of-type input")?.focus();
        }, 30);
      }, 30);
    });
    head.append(title, add);
    panel.appendChild(head);

    let count = 0;
    measurementRows.forEach(row => {
      const productChecks = Array.from(row.querySelectorAll<HTMLInputElement>(".productChip input"));
      const association = productChecks[productIndex];
      if (!association?.checked) return;
      const originalName = row.querySelector<HTMLInputElement>(".suggestionInput input");
      const originalMode = row.querySelector<HTMLSelectElement>(":scope > select");
      if (!originalName || !originalMode) return;
      count++;
      const proxy = document.createElement("div");
      proxy.className = "productMeasurementRow";
      const name = document.createElement("input");
      name.placeholder = "Measurement, e.g. Length";
      syncProxyInput(name, originalName);
      const mode = document.createElement("select");
      syncProxySelect(mode, originalMode);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "iconRemove";
      remove.textContent = "×";
      remove.title = "Remove measurement from this product";
      remove.addEventListener("click", () => {
        if (association.checked) association.click();
        window.setTimeout(() => {
          const stillUsed = productChecks.some(check => check.checked);
          if (!stillUsed) row.querySelector<HTMLButtonElement>(":scope > .dangerText")?.click();
          buildProductMeasurements();
        }, 20);
      });
      proxy.append(name, mode, remove);
      panel!.appendChild(proxy);
    });

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "productMeasurementsEmpty";
      empty.textContent = "No measurements added.";
      panel.appendChild(empty);
    }
  });
}

export function OrderSetupPolish() {
  useEffect(() => {
    let frame = 0;
    let running = false;
    const enhance = () => {
      if (running) return;
      running = true;
      try {
        if (!document.querySelector(".orderSetup")) return;
        addSetupClasses();
        document.querySelectorAll<HTMLElement>(".orderSetup .sourceFieldPicker").forEach(manageSourcePicker);
        lockIrrelevantDefaults();
        buildProductMeasurements();
      } finally {
        running = false;
      }
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };
    enhance();
    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        if (target.closest?.(".sourceOwnerCombo,.productMeasurements")) return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
