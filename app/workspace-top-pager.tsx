"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function enhanceRowCount(page: HTMLElement) {
  const input = page.querySelector<HTMLInputElement>('.rowCountControl input[aria-label="Number of rows to add"]');
  if (!input || input.dataset.replaceOnFocus === "true") return;
  input.dataset.replaceOnFocus = "true";
  input.addEventListener("focus", () => requestAnimationFrame(() => input.select()));
}

function realPager(page: HTMLElement) { return page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)"); }
function clickReal(page: HTMLElement, label: string) {
  Array.from(realPager(page)?.querySelectorAll<HTMLButtonElement>("button") || []).find(item => item.textContent?.trim() === label)?.click();
}

function buildTopPager(page: HTMLElement) {
  const bottom = realPager(page), tools = page.querySelector<HTMLElement>(":scope > .workspaceTools");
  if (!bottom || !tools) return;
  let top = tools.querySelector<HTMLElement>(":scope > .workspacePagerTop");
  if (!top) { top = document.createElement("div"); top.className = "workspacePager workspacePagerTop"; top.setAttribute("aria-label", "Workspace pagination"); tools.appendChild(top); }
  if (top.matches(":focus-within")) return;
  const children = Array.from(bottom.children);
  const range = children.find(child => child instanceof HTMLSpanElement && /^Showing\s/i.test(child.textContent || ""));
  const pageStatus = children.find(child => child instanceof HTMLSpanElement && /^Page\s/i.test(child.textContent || ""));
  const native = bottom.querySelector<HTMLInputElement>('input[aria-label="Rows per page"]');
  const previous = Array.from(bottom.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "Previous");
  const next = Array.from(bottom.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "Next");
  top.replaceChildren();
  if (range) top.appendChild(range.cloneNode(true));
  const label = document.createElement("label"); label.append("Rows ");
  const input = document.createElement("input"); input.type = "text"; input.inputMode = "numeric"; input.className = "workspacePageSizeInput"; input.setAttribute("aria-label", "Rows per page"); input.value = native?.value || "50";
  const commit = () => {
    if (!native) return;
    const value = String(Math.max(1, Math.min(5000, Math.floor(Number(input.value) || 1))));
    input.value = value;
    setInputValue(native, value);
    native.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: input }));
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); commit(); input.blur(); } });
  label.appendChild(input); top.appendChild(label);
  const proxy = (source: HTMLButtonElement | undefined, text: string) => { const button=document.createElement("button"); button.type="button"; button.className=source?.className||"secondary"; button.textContent=text; button.disabled=Boolean(source?.disabled); button.addEventListener("click",()=>clickReal(page,text)); top!.appendChild(button); };
  proxy(previous,"Previous"); if (pageStatus) top.appendChild(pageStatus.cloneNode(true)); proxy(next,"Next");
}

function sync() { document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => { enhanceRowCount(page); buildTopPager(page); }); }
export function WorkspaceTopPager() {
  useEffect(() => {
    const controller = startDomEnhancement(sync, { observer: { childList:true, subtree:true, characterData:true }, shouldSchedule: mutations => mutations.some(mutation => !(mutation.target as HTMLElement).closest?.(".workspacePagerTop")) });
    return () => controller.stop();
  }, []);
  return null;
}
