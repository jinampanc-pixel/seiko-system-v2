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

function currentPageSize(page: HTMLElement, select?: HTMLSelectElement | null) {
  const remembered = Number(page.dataset.workspacePageSize || "");
  if (Number.isFinite(remembered) && remembered > 0) return remembered;
  const native = Number(select?.value || "");
  return Number.isFinite(native) && native > 0 ? native : 50;
}

function setRealPageSize(page: HTMLElement, rawValue: string) {
  const value = Math.max(1, Math.min(5000, Math.floor(Number(rawValue) || 1)));
  const select = realPager(page)?.querySelector<HTMLSelectElement>("select");
  if (!select) return;

  page.dataset.workspacePageSize = String(value);
  let option = Array.from(select.options).find(item => Number(item.value) === value);
  if (!option) {
    option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    option.dataset.customPageSize = "true";
    select.appendChild(option);
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, String(value));
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

  if (realSelect) {
    const native = Number(realSelect.value || "");
    const remembered = Number(page.dataset.workspacePageSize || "");
    if ((!remembered || remembered <= 0) && native > 0) page.dataset.workspacePageSize = String(native);
  }

  top.replaceChildren();
  if (range) top.appendChild(range.cloneNode(true));

  const label = document.createElement("label");
  label.append("Rows ");
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "5000";
  input.step = "1";
  input.inputMode = "numeric";
  input.className = "workspacePageSizeInput";
  input.setAttribute("aria-label", "Rows per page");
  input.value = String(currentPageSize(page, realSelect));
  const commit = () => {
    const value = Math.max(1, Math.min(5000, Math.floor(Number(input.value) || 1)));
    input.value = String(value);
    setRealPageSize(page, String(value));
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      input.blur();
    }
  });
  label.appendChild(input);
  top.appendChild(label);

  const addButton = (source: HTMLButtonElement | undefined, labelText: string) => {
    const proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = source?.className || "secondary";
    proxy.textContent = labelText;
    proxy.disabled = Boolean(source?.disabled);
    proxy.addEventListener("click", () => clickReal(page, labelText));
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
