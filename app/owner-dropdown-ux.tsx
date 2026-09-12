"use client";

import { useEffect } from "react";
import { useAccess } from "./access-control";
import { startDomEnhancement } from "./lib/dom-enhancement";

/**
 * Owner controls are limited to real order-owned data. Workflow policy enums such
 * as Quantity mode, Specification type and Value assignment method are system
 * choices and must stay native selects: they are not renameable/removable master
 * data. Keeping them native also gives consistent keyboard, touch and mobile UX.
 */
function cleanSpecificationButton() {
  document.querySelectorAll<HTMLButtonElement>('.specActions button[aria-label="Add specification"]').forEach(button => {
    button.classList.add("specButtonClean");
    if (button.textContent !== "+ Specification") button.textContent = "+ Specification";
  });
}

function removeLegacyEditablePolicyControls() {
  document.querySelectorAll<HTMLElement>(".ownerManagedSelect").forEach(node => node.remove());
  document.querySelectorAll<HTMLSelectElement>(".ownerEditableNative").forEach(select => {
    select.classList.remove("ownerEditableNative");
    delete select.dataset.ownerComboReady;
    select.tabIndex = 0;
  });
}

function setOwnerOnlyControls(owner: boolean) {
  document.querySelectorAll<HTMLElement>(".orderSetup .policyRow .iconRemove, .orderSetup .optionEditor").forEach(control => {
    control.hidden = !owner;
    control.setAttribute("aria-hidden", owner ? "false" : "true");
  });

  document.querySelectorAll<HTMLElement>(".orderSetup .policyRow").forEach(row => {
    const typeSelect = row.querySelector<HTMLSelectElement>("select");
    if (typeSelect) {
      const listOption = Array.from(typeSelect.options).find(option => option.value === "dropdown");
      if (listOption) listOption.textContent = owner ? "Dropdown · manage options" : "Dropdown";
    }
    const optionInput = row.querySelector<HTMLInputElement>(".optionEditor > input");
    if (optionInput) optionInput.placeholder = "+ Add option — type and press Enter";
  });
}

function enhance(owner: boolean) {
  removeLegacyEditablePolicyControls();
  cleanSpecificationButton();
  setOwnerOnlyControls(owner);
}

export function OwnerDropdownUx() {
  const { membership } = useAccess();
  const isOwner = membership?.role === "owner";

  useEffect(() => {
    const controller = startDomEnhancement(() => enhance(isOwner), {
      shouldSchedule: mutations => mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length),
    });
    document.addEventListener("change", controller.schedule, true);

    return () => {
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
      removeLegacyEditablePolicyControls();
    };
  }, [isOwner]);

  return null;
}
