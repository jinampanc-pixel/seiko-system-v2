"use client";

import { useEffect } from "react";

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function grow(textarea: HTMLTextAreaElement) {
  textarea.style.height = "0px";
  textarea.style.height = `${Math.max(34, textarea.scrollHeight)}px`;
}

function labelText(label: HTMLLabelElement) {
  return label.querySelector(":scope > span")?.textContent?.trim().replace(/\s*\*$/, "") || "";
}

function upgradeLongTextField(label: HTMLLabelElement) {
  if (label.dataset.adaptiveTextReady === "true") return;
  const input = label.querySelector<HTMLInputElement>(":scope > input");
  if (!input || input.type !== "text") return;

  label.dataset.adaptiveTextReady = "true";
  input.classList.add("adaptiveNativeInput");
  input.tabIndex = -1;

  const textarea = document.createElement("textarea");
  textarea.className = "adaptiveTextArea";
  textarea.rows = 1;
  textarea.value = input.value;
  textarea.setAttribute("aria-label", labelText(label) || input.getAttribute("aria-label") || "Text value");
  textarea.placeholder = input.placeholder;
  input.insertAdjacentElement("afterend", textarea);
  grow(textarea);

  textarea.addEventListener("input", () => {
    setReactInputValue(input, textarea.value);
    grow(textarea);
  });
  textarea.addEventListener("blur", () => {
    if (textarea.value !== input.value) setReactInputValue(input, textarea.value);
  });
  input.addEventListener("input", () => {
    if (textarea.value !== input.value) {
      textarea.value = input.value;
      grow(textarea);
    }
  });
}

function markClientFields() {
  document.querySelectorAll<HTMLLabelElement>(".orderSetup .clientDetails .setupGrid label").forEach(label => {
    const name = labelText(label);
    if (name === "Phone number") label.classList.add("clientPhoneField");
    if (name === "Delivery address" || name === "Billing address") {
      label.classList.add("clientLongField");
      upgradeLongTextField(label);
    }
    if (name === "Client name" || name === "Contact person / Attn") label.classList.add("clientFlexibleField");
  });
}

function upgradeSpecificationFreeText() {
  document.querySelectorAll<HTMLInputElement>('.orderSetup .specPolicy > input:not([aria-label="Order or default value"])').forEach(input => {
    if (input.dataset.adaptiveTextReady === "true") return;
    input.dataset.adaptiveTextReady = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "adaptiveSpecText";
    const textarea = document.createElement("textarea");
    textarea.rows = 1;
    textarea.value = input.value;
    textarea.placeholder = input.placeholder;
    textarea.setAttribute("aria-label", "Specification name");
    input.classList.add("adaptiveNativeInput");
    input.tabIndex = -1;
    input.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(textarea);
    grow(textarea);
    textarea.addEventListener("input", () => {
      setReactInputValue(input, textarea.value);
      grow(textarea);
    });
    input.addEventListener("input", () => {
      if (textarea.value !== input.value) {
        textarea.value = input.value;
        grow(textarea);
      }
    });
  });
}

function syncAdaptiveValues() {
  document.querySelectorAll<HTMLLabelElement>(".orderSetup label[data-adaptive-text-ready='true']").forEach(label => {
    const input = label.querySelector<HTMLInputElement>(":scope > input.adaptiveNativeInput");
    const textarea = label.querySelector<HTMLTextAreaElement>(":scope > textarea.adaptiveTextArea");
    if (input && textarea && textarea.value !== input.value && document.activeElement !== textarea) {
      textarea.value = input.value;
      grow(textarea);
    }
  });
  document.querySelectorAll<HTMLElement>(".orderSetup .adaptiveSpecText").forEach(wrapper => {
    const input = wrapper.previousElementSibling as HTMLInputElement | null;
    const textarea = wrapper.querySelector<HTMLTextAreaElement>("textarea");
    if (input && textarea && textarea.value !== input.value && document.activeElement !== textarea) {
      textarea.value = input.value;
      grow(textarea);
    }
  });
}

export function OrderCompactUx() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      if (!document.querySelector(".orderSetup")) return;
      markClientFields();
      upgradeSpecificationFreeText();
      syncAdaptiveValues();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        enhance();
      });
    };
    enhance();
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
