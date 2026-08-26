"use client";

import { useEffect } from "react";

function sourceMode() {
  return document.querySelector<HTMLElement>(".labelCreateApp")?.dataset.labelSource || "";
}

function tidyBackButton(page: HTMLElement) {
  const button = Array.from(page.querySelectorAll<HTMLButtonElement>(".labelTopbar button.secondary"))
    .find(item => item.textContent?.includes("Back to order"));
  if (button) button.textContent = "← Back to setup";
}

function compactInformation(page: HTMLElement) {
  const section = page.querySelector<HTMLElement>(".simpleDesigner");
  if (!section || section.dataset.compactReady === "true") return;
  section.dataset.compactReady = "true";
  section.classList.add("labelInfoCollapsed");

  const heading = section.querySelector<HTMLElement>(".simpleDesignerHead h3");
  if (heading) heading.textContent = "Label information";
  const note = section.querySelector<HTMLElement>(".simpleDesignerHead small");
  if (note) note.textContent = "Choose only the details that need to appear on this label.";

  const chosenCount = () => section.querySelectorAll<HTMLInputElement>('.fieldChecklist input[type="checkbox"]:checked').length;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "secondary labelInfoToggle";
  toggle.textContent = `Choose information · ${chosenCount()} selected`;
  toggle.addEventListener("click", () => {
    const collapsed = section.classList.toggle("labelInfoCollapsed");
    toggle.textContent = collapsed ? `Choose information · ${chosenCount()} selected` : "Done";
  });
  section.querySelector(".simpleDesignerHead")?.appendChild(toggle);
  section.addEventListener("change", () => {
    if (section.classList.contains("labelInfoCollapsed")) toggle.textContent = `Choose information · ${chosenCount()} selected`;
  });
}

function tidyRecordLabels(page: HTMLElement) {
  const mode = sourceMode();
  page.querySelectorAll<HTMLElement>(".recordList .record").forEach(record => {
    const title = record.querySelector<HTMLElement>("b");
    const meta = record.querySelector<HTMLElement>("small");
    if (!title || title.dataset.sourcePolished === mode) return;
    const raw = title.textContent?.trim() || "";
    const parts = raw.split(" — ").map(part => part.trim()).filter(Boolean);

    if (mode === "product" && parts.length >= 2 && parts[0] === parts[1]) {
      title.textContent = parts[0];
    } else if (mode === "person" && parts.length >= 2) {
      title.textContent = parts[0];
    } else if (mode === "order") {
      title.textContent = parts[0] || "Whole order";
    }

    if (mode === "product" && meta?.textContent?.startsWith("Product total")) {
      meta.textContent = meta.textContent.replace(/^Product total\s*·?\s*/, "");
    }
    title.dataset.sourcePolished = mode;
  });
}

function prioritizeCanvas(page: HTMLElement) {
  const grid = page.querySelector<HTMLElement>(".labelDesignerGrid");
  const canvas = grid?.querySelector<HTMLElement>(".labelCanvasPanel");
  if (!grid || !canvas) return;
  canvas.classList.add("labelCanvasPrimary");
}

function enhance() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => {
    tidyBackButton(page);
    compactInformation(page);
    tidyRecordLabels(page);
    prioritizeCanvas(page);
  });
}

export function LabelDesignerPolish() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };
    enhance();
    const observer = new MutationObserver(schedule);
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
