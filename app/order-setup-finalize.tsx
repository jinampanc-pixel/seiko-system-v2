"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

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
      setText(help, "Set the normal quantity once, then add only the groups that differ. One exception may contain several values such as 1, 2, 3; quantity 0 means that group does not receive this product.");
      setText(quantityLabel, "Default qty");
    } else if (quantitySelect.value === "per_person") {
      setText(help, "Enter the quantity separately in each person / record row.");
      setText(quantityLabel, "Entered in workspace");
    } else if (quantitySelect.value === "order_total") {
      setText(quantityLabel, "Order total");
    } else {
      setText(quantityLabel, "Default qty");
    }
  });
}

export function OrderSetupFinalize() {
  useEffect(() => {
    const controller = startDomEnhancement(finalizeOrderSetup);
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
    };
  }, []);
  return null;
}
