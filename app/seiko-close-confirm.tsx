"use client";

import { useEffect } from "react";

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
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".workspacePage .orderMenuDanger");
      if (!button) return;
      if (button.dataset.discardConfirmBypass === "true") {
        delete button.dataset.discardConfirmBypass;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      askDiscard(button);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
