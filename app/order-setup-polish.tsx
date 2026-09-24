"use client";

import { useEffect } from "react";

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
