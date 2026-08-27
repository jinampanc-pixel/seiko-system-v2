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

function buildTopPager(page: HTMLElement) {
  const bottom = page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)");
  const tools = page.querySelector<HTMLElement>(":scope > .workspaceTools");
  if (!bottom || !tools) return;

  let top = page.querySelector<HTMLElement>(".workspacePagerTop");
  if (!top) {
    top = document.createElement("div");
    top.className = "workspacePager workspacePagerTop";
    tools.appendChild(top);
  } else if (top.parentElement !== tools) {
    tools.appendChild(top);
  }

  top.replaceChildren();

  Array.from(bottom.children).forEach((child, index) => {
    if (child instanceof HTMLButtonElement) {
      const proxy = child.cloneNode(true) as HTMLButtonElement;
      proxy.addEventListener("click", () => {
        const current = page.querySelectorAll<HTMLButtonElement>(":scope > .workspacePager:not(.workspacePagerTop) button")[index - 2];
        const match = Array.from(page.querySelectorAll<HTMLButtonElement>(":scope > .workspacePager:not(.workspacePagerTop) button"))
          .find(button => button.textContent === proxy.textContent);
        (match || current)?.click();
      });
      top!.appendChild(proxy);
      return;
    }

    if (child instanceof HTMLLabelElement) {
      const proxy = child.cloneNode(true) as HTMLLabelElement;
      const proxySelect = proxy.querySelector<HTMLSelectElement>("select");
      proxySelect?.addEventListener("change", () => {
        const real = bottom.querySelector<HTMLSelectElement>("select");
        if (!real || !proxySelect) return;
        real.value = proxySelect.value;
        real.dispatchEvent(new Event("change", { bubbles: true }));
      });
      top!.appendChild(proxy);
      return;
    }

    top!.appendChild(child.cloneNode(true));
  });
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
    document.addEventListener("change", controller.schedule, true);
    return () => {
      document.removeEventListener("change", controller.schedule, true);
      controller.stop();
    };
  }, []);

  return null;
}
