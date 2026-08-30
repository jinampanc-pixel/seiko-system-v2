"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function enhanceRowCount(page: HTMLElement) {
  const input = page.querySelector<HTMLInputElement>('.rowCountControl input[aria-label="Number of rows to add"]');
  if (!input || input.dataset.replaceOnFocus === "true") return;
  input.dataset.replaceOnFocus = "true";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.setAttribute("pattern", "[0-9]*");
  const selectValue = () => requestAnimationFrame(() => input.select());
  input.addEventListener("focus", selectValue);
  input.addEventListener("pointerdown", event => {
    event.preventDefault();
    input.focus();
    selectValue();
  });
}

function realPager(page: HTMLElement) {
  return page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)");
}

function clickReal(page: HTMLElement, label: string) {
  const button = Array.from(realPager(page)?.querySelectorAll<HTMLButtonElement>("button") || [])
    .find(item => item.textContent?.trim() === label);
  button?.click();
}

function setRealPageSize(page: HTMLElement, value: string) {
  const select = realPager(page)?.querySelector<HTMLSelectElement>("select");
  if (!select || select.value === value) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function buildTopPager(page: HTMLElement) {
  const bottom = realPager(page);
  const tools = page.querySelector<HTMLElement>(":scope > .workspaceTools");
  if (!bottom || !tools) return;

  let top = tools.querySelector<HTMLElement>(":scope > .workspacePagerTop");
  if (!top) {
    top = document.createElement("div");
    top.className = "workspacePager workspacePagerTop";
    top.setAttribute("aria-label", "Workspace pagination");
    tools.appendChild(top);
  }

  const children = Array.from(bottom.children);
  const range = children.find(child => child instanceof HTMLSpanElement && /^Showing\s/i.test(child.textContent || ""));
  const pageStatus = children.find(child => child instanceof HTMLSpanElement && /^Page\s/i.test(child.textContent || ""));
  const realSelect = bottom.querySelector<HTMLSelectElement>("select");
  const previous = Array.from(bottom.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "Previous");
  const next = Array.from(bottom.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "Next");

  top.replaceChildren();
  if (range) top.appendChild(range.cloneNode(true));

  if (realSelect) {
    const label = document.createElement("label");
    label.append("Rows ");
    const select = realSelect.cloneNode(true) as HTMLSelectElement;
    select.value = realSelect.value;
    select.setAttribute("aria-label", "Rows per page");
    select.addEventListener("change", () => setRealPageSize(page, select.value));
    label.appendChild(select);
    top.appendChild(label);
  }

  const addButton = (source: HTMLButtonElement | undefined, label: string) => {
    const proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = source?.className || "secondary";
    proxy.textContent = label;
    proxy.disabled = Boolean(source?.disabled);
    proxy.addEventListener("click", () => clickReal(page, label));
    top!.appendChild(proxy);
  };

  addButton(previous, "Previous");
  if (pageStatus) top.appendChild(pageStatus.cloneNode(true));
  addButton(next, "Next");
}

function syncWorkspaceChrome() {
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => {
    enhanceRowCount(page);
    buildTopPager(page);
  });
}

export function WorkspaceTopPager() {
  useEffect(() => {
    const controller = startDomEnhancement(syncWorkspaceChrome, {
      observer: { childList: true, subtree: true, characterData: true },
      shouldSchedule: mutations => mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        if (target.closest?.(".workspacePagerTop")) return false;
        return Boolean(target.closest?.(".workspacePage")) || Array.from(mutation.addedNodes).some(node => node instanceof HTMLElement && (node.matches?.(".workspacePage") || node.querySelector?.(".workspacePage")));
      }),
    });
    const scheduleAfterControl = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(".workspacePage")) window.setTimeout(controller.schedule, 0);
    };
    document.addEventListener("change", scheduleAfterControl, true);
    document.addEventListener("click", scheduleAfterControl, true);
    return () => {
      document.removeEventListener("change", scheduleAfterControl, true);
      document.removeEventListener("click", scheduleAfterControl, true);
      controller.stop();
    };
  }, []);

  return null;
}
