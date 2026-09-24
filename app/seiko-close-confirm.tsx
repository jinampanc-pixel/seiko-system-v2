"use client";

import { useEffect } from "react";

function toast(message: string) {
  document.querySelector(".seikoOperationalToast")?.remove();
  const node = document.createElement("div");
  node.className = "seikoOperationalToast";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 3600);
}

function confirmAction(button: HTMLButtonElement, options: { title: string; message: string; action: string; danger?: boolean; bypass: string }) {
  document.querySelector(".seikoConfirmLayer")?.remove();
  const layer = document.createElement("div");
  layer.className = "seikoConfirmLayer";
  layer.tabIndex = -1;
  layer.innerHTML = '<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="seiko-confirm-title"><h3 id="seiko-confirm-title"></h3><p></p><div><button type="button" class="secondary keep">Keep editing</button><button type="button" class="primary confirm"></button></div></section>';
  layer.querySelector("h3")!.textContent = options.title;
  layer.querySelector("p")!.textContent = options.message;
  const keep = layer.querySelector<HTMLButtonElement>(".keep")!;
  const confirm = layer.querySelector<HTMLButtonElement>(".confirm")!;
  confirm.textContent = options.action;
  if (options.danger) confirm.classList.add("dangerAction");
  const close = () => layer.remove();
  keep.addEventListener("click", close);
  layer.addEventListener("click", event => { if (event.target === layer) close(); });
  layer.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  confirm.addEventListener("click", () => {
    close();
    button.dataset[options.bypass] = "true";
    button.click();
  });
  document.body.appendChild(layer);
  queueMicrotask(() => keep.focus());
}

function askDiscard(button: HTMLButtonElement) {
  document.querySelector(".seikoDiscardConfirmLayer")?.remove();
  const layer = document.createElement("div");
  layer.className = "seikoConfirmLayer seikoDiscardConfirmLayer";
  layer.innerHTML = '<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="seiko-discard-title"><h3 id="seiko-discard-title">Discard unsaved changes?</h3><p>Your last saved revision will remain safe. Changes made since that save will be discarded.</p><div><button type="button" class="secondary keep">Keep editing</button><button type="button" class="primary dangerAction discard">Discard changes</button></div></section>';
  const keep = layer.querySelector<HTMLButtonElement>(".keep")!;
  const discard = layer.querySelector<HTMLButtonElement>(".discard")!;
  const close = () => layer.remove();
  keep.addEventListener("click", close);
  layer.addEventListener("click", event => { if (event.target === layer) close(); });
  layer.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  discard.addEventListener("click", () => {
    close();
    button.dataset.discardConfirmBypass = "true";
    const originalConfirm = window.confirm;
    // The owning Orders component still guards its close callback with confirm().
    // Allow that already-approved callback once, then restore the browser API.
    window.confirm = () => true;
    button.click();
    queueMicrotask(() => { window.confirm = originalConfirm; });
  });
  document.body.appendChild(layer);
  queueMicrotask(() => keep.focus());
}

export function SeikoCloseConfirm() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const quickSave = target.closest<HTMLButtonElement>(".workspacePage .workspaceQuickSave");
      if (quickSave) {
        window.setTimeout(() => toast("Changes saved."), 40);
        return;
      }

      const saveClose = target.closest<HTMLButtonElement>(".workspacePage .orderMenuPrimary");
      if (saveClose) {
        if (saveClose.dataset.saveCloseConfirmBypass === "true") {
          delete saveClose.dataset.saveCloseConfirmBypass;
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        confirmAction(saveClose, {
          title: "Save and close this order?",
          message: "The current workspace changes will be saved as a new revision before returning to Orders.",
          action: "Save & close",
          bypass: "saveCloseConfirmBypass",
        });
        return;
      }

      const discard = target.closest<HTMLButtonElement>(".workspacePage .orderMenuDanger");
      if (!discard) return;
      if (discard.dataset.discardConfirmBypass === "true") {
        delete discard.dataset.discardConfirmBypass;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      askDiscard(discard);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
