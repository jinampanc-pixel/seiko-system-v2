"use client";

import { useEffect } from "react";

/**
 * Small DOM enhancement for owner-only person-field controls.
 * The underlying order state remains React-managed; this only makes the existing
 * editable-dropdown capability obvious and labels the option editor clearly.
 */
export function OwnerDropdownUx() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".orderSetup .policyRow").forEach(row => {
        // In Person details, the remove icon is rendered only for owner/admin users.
        if (!row.querySelector(".iconRemove")) return;

        const typeSelect = row.querySelector<HTMLSelectElement>("select");
        if (typeSelect) {
          const listOption = Array.from(typeSelect.options).find(option => option.value === "dropdown");
          if (listOption) {
            listOption.textContent = "Dropdown · manage options";
            typeSelect.dataset.ownerListSelect = "true";
            typeSelect.title = "Choose this to type, add and remove dropdown options";
          }
        }

        const optionInput = row.querySelector<HTMLInputElement>(".optionEditor > input");
        if (optionInput) {
          optionInput.placeholder = "+ Add option — type and press Enter";
          optionInput.title = "Type a new dropdown option and press Enter";
        }
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
