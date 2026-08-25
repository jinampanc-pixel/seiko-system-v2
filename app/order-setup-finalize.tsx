"use client";

import { useEffect } from "react";

function isOwnerSetup() {
  return Boolean(document.querySelector(".orderSetup .personDetails .policyRow .iconRemove"));
}

function finalizeOrderSetup() {
  const setup = document.querySelector(".orderSetup");
  if (!setup) return;

  if (!isOwnerSetup()) {
    setup.querySelectorAll<HTMLElement>(".sourceOwnerCombo").forEach(node => node.remove());
    setup.querySelectorAll<HTMLSelectElement>(".sourceNativeHidden").forEach(select => {
      select.classList.remove("sourceNativeHidden");
      select.tabIndex = 0;
    });
  }

  setup.querySelectorAll<HTMLElement>(".productPolicy").forEach(card => {
    const quantitySelect = card.querySelector<HTMLSelectElement>(".productPolicyTop label > select");
    const help = card.querySelector<HTMLElement>(":scope > .ruleHelp");
    const quantityInputs = Array.from(card.querySelectorAll<HTMLInputElement>(".productPolicyTop input"));
    const quantityInput = quantityInputs.at(-1);
    const quantityLabel = quantityInput?.closest("label")?.querySelector<HTMLElement>(":scope > span");
    if (!quantitySelect) return;

    if (quantitySelect.value === "by_group") {
      if (help) help.textContent = "Set a quantity for every required group below. Rows without a matching group are blocked from production.";
      if (quantityLabel) quantityLabel.textContent = "Not used";
    } else if (quantitySelect.value === "per_person") {
      if (help) help.textContent = "Enter the quantity separately in each person’s row.";
      if (quantityLabel) quantityLabel.textContent = "Not used";
    } else if (quantitySelect.value === "order_total") {
      if (quantityLabel) quantityLabel.textContent = "Order total";
    } else {
      if (quantityLabel) quantityLabel.textContent = "Default qty";
    }
  });
}

export function OrderSetupFinalize() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        finalizeOrderSetup();
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
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
