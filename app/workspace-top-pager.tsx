"use client";

import { useEffect } from "react";

function buildTopPager(page: HTMLElement) {
  const bottom = page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)");
  const tableHelp = page.querySelector<HTMLElement>(":scope > .workspaceTableHelp");
  if (!bottom || !tableHelp) return;

  let top = page.querySelector<HTMLElement>(":scope > .workspacePagerTop");
  if (!top) {
    top = document.createElement("div");
    top.className = "workspacePager workspacePagerTop";
    tableHelp.insertAdjacentElement("beforebegin", top);
  }

  top.replaceChildren();

  Array.from(bottom.children).forEach((child, index) => {
    if (child instanceof HTMLButtonElement) {
      const proxy = child.cloneNode(true) as HTMLButtonElement;
      proxy.addEventListener("click", () => {
        const current = page.querySelectorAll<HTMLButtonElement>(":scope > .workspacePager:not(.workspacePagerTop) button")[index - 2];
        // Prefer matching by visible label because the row-size label/select is
        // also a child of the pager and shifts child indexes.
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

function syncWorkspacePagers() {
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(buildTopPager);
}

export function WorkspaceTopPager() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncWorkspacePagers();
      });
    };

    schedule();
    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        if (target.closest?.(".workspacePagerTop")) return false;
        return Boolean(target.closest?.(".workspacePage")) || Array.from(mutation.addedNodes).some(node => node instanceof HTMLElement && (node.matches?.(".workspacePage") || node.querySelector?.(".workspacePage")));
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("change", schedule, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
