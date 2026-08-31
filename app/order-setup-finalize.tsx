"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function setText(node: HTMLElement | null | undefined, value: string) {
  if (node && node.textContent !== value) node.textContent = value;
}

function labelText(label: HTMLLabelElement) {
  return label.querySelector<HTMLElement>(":scope > span")?.textContent?.trim().replace(/\s*\*$/, "") || "";
}

function restoreNativeSourcePickers(setup: Element) {
  setup.querySelectorAll<HTMLElement>(".sourceOwnerCombo").forEach(node => node.remove());
  setup.querySelectorAll<HTMLSelectElement>(".sourceNativeHidden").forEach(select => {
    select.classList.remove("sourceNativeHidden");
    delete select.closest<HTMLElement>(".sourceFieldPicker")?.dataset.ownerSourceReady;
    select.tabIndex = 0;
  });
}

function finalizeClientDetails(setup: Element) {
  setup.querySelectorAll<HTMLLabelElement>(".clientDetails .setupGrid label").forEach(label => {
    const name = labelText(label);
    label.classList.toggle("seikoDeliveryAddress", name === "Delivery address");
    label.classList.toggle("seikoBillingAddress", name === "Billing address");
  });
}

function finalizePersonDetails(setup: Element) {
  setup.querySelectorAll<HTMLInputElement>(".personDetails .policyRow > input:first-child").forEach(input => {
    input.placeholder = "Person / record field";
    input.setAttribute("aria-description", "Use the terminology for this order, for example Employee name, Class, Patient ID or Department.");
  });
}

function finalizeProductDetails(setup: Element) {
  setup.querySelectorAll<HTMLElement>(".productPolicy").forEach(card => {
    const quantitySelect = card.querySelector<HTMLSelectElement>(".productPolicyTop label > select");
    const help = card.querySelector<HTMLElement>(":scope > .ruleHelp");
    const quantityInputs = Array.from(card.querySelectorAll<HTMLInputElement>(".productPolicyTop input"));
    const quantityInput = quantityInputs.at(-1);
    const quantityLabel = quantityInput?.closest("label")?.querySelector<HTMLElement>(":scope > span");
    if (!quantitySelect) return;

    quantitySelect.setAttribute("aria-label", "Quantity rule");

    if (quantitySelect.value === "by_group") {
      setText(help, "Set the normal quantity once, then add only the groups that differ. Use comma-separated values or a range such as 1-7 for several groups at once; quantity 0 means that group does not receive this product.");
      setText(quantityLabel, "Default qty");
      const rules = card.querySelector<HTMLElement>(".quantityGroupRules");
      setText(rules?.querySelector<HTMLElement>(":scope > summary"), "Quantity exceptions by group");
      rules?.querySelectorAll<HTMLInputElement>(":scope > div input:first-child").forEach(input => {
        input.placeholder = "Group values or range, e.g. 1-7";
      });
      rules?.querySelectorAll<HTMLInputElement>('input[aria-label="Group quantity"]').forEach(input => {
        input.min = "0";
        input.placeholder = "Qty";
      });
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

function finalizeOrderSetup() {
  const setup = document.querySelector(".orderSetup");
  if (!setup) return;

  // Group source fields are real fields from this order. Keep the native select
  // instead of wrapping it in another owner-editable combobox.
  restoreNativeSourcePickers(setup);
  finalizeClientDetails(setup);
  finalizePersonDetails(setup);
  finalizeProductDetails(setup);
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
