"use client";

import { useEffect } from "react";

function isOwnerSetup() {
  return Boolean(document.querySelector(".orderSetup .personDetails .policyRow .iconRemove"));
}

function setText(node: HTMLElement | null | undefined, value: string) {
  if (node && node.textContent !== value) node.textContent = value;
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
      setText(help, "Set a quantity for every required group below. Rows without a matching group are blocked from production.");
      setText(quantityLabel, "Not used");
    } else if (quantitySelect.value === "per_person") {
      setText(help, "Enter the quantity separately in each person’s row.");
      setText(quantityLabel, "Not used");
    } else if (quantitySelect.value === "order_total") {
      setText(quantityLabel, "Order total");
    } else {
      setText(quantityLabel, "Default qty");
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
