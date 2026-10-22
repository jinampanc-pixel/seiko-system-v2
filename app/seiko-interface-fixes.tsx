"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function pagerButton(root: HTMLElement, label: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.trim() === label);
}

function pagerSpan(root: HTMLElement, prefix: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(":scope > span"))
    .find(span => span.textContent?.trim().startsWith(prefix));
}

function syncWorkspacePagers() {
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => {
    const bottom = page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)");
    const top = page.querySelector<HTMLElement>(":scope > .workspaceTools .workspacePagerTop");
    if (!bottom || !top) return;

    for (const label of ["Previous", "Next"]) {
      const source = pagerButton(bottom, label);
      const proxy = pagerButton(top, label);
      if (source && proxy && proxy.disabled !== source.disabled) proxy.disabled = source.disabled;
    }

    for (const prefix of ["Showing ", "Page "]) {
      const source = pagerSpan(bottom, prefix);
      const proxy = pagerSpan(top, prefix);
      if (source && proxy && proxy.textContent !== source.textContent) proxy.textContent = source.textContent;
    }
  });
}

function enhance() {
  syncWorkspacePagers();
}

export function SeikoInterfaceFixes() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, {
      observer: { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled"] },
    });

    const clickCapture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      if (target.closest(".workspacePagerTop button")) {
        window.setTimeout(controller.schedule, 0);
      }
    };

    document.addEventListener("click", clickCapture, true);
    return () => {
      document.removeEventListener("click", clickCapture, true);
      controller.stop();
    };
  }, []);

  return null;
}
