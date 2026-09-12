"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerV2 .canvasElement").forEach(element => {
    element.setAttribute("role", "button");
    const text = element.textContent?.trim() || element.className.match(/element-(\w+)/)?.[1] || "label element";
    element.setAttribute("aria-label", `Label element: ${text}. Use arrow keys to move when layout editing is enabled.`);
  });
  document.querySelectorAll<HTMLElement>(".labelDesignerV2 .labelV2ResizeHandle").forEach(handle => {
    handle.setAttribute("role", "button");
    handle.setAttribute("tabindex", "-1");
    handle.setAttribute("aria-label", "Resize selected label element");
  });
}

export function LabelV2Accessibility() {
  useEffect(() => {
    const controller = startDomEnhancement(enhance, {
      observer: { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] },
    });
    return controller.stop;
  }, []);
  return null;
}
