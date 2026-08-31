"use client";

import { useEffect } from "react";

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  // React text inputs are driven by the input event. Do not also dispatch a
  // change event here: the global setup polish listener treats change as a
  // structural signal and would rebuild the measurement proxy on every key.
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

function lockIrrelevantDefaults() {
  document.querySelectorAll<HTMLElement>(".orderSetup .productPolicy").forEach(card => {
    const quantitySelect = card.querySelector<HTMLSelectElement>(".productPolicyTop label > select");
    const inputs = Array.from(card.querySelectorAll<HTMLInputElement>(".productPolicyTop input"));
    const quantityInput = inputs.at(-1);
    if (quantitySelect && quantityInput) {
      const blocked = quantitySelect.value === "per_person";
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
        // Group source fields stay as native order-field selectors. OrderSetupFinalize removes legacy wrappers.
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
        // The hidden measurement registry's suggestion popup can mount/unmount
        // while a product measurement proxy is being typed. That is not a
        // structural measurement change and must not rebuild the proxy row.
        if (target.closest?.(".sourceOwnerCombo,.productMeasurements,.measurementRegistry .suggestionInput")) return false;
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
