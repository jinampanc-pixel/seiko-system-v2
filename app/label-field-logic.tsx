"use client";

import { useEffect } from "react";

const EMPTY_SENTINEL = "\u200B";

function orderIdentity(page: HTMLElement) {
  const eyebrow = page.querySelector<HTMLElement>(".labelTopbar .eyebrow")?.textContent || "";
  const match = eyebrow.match(/ORDER\s+([^·]+)/i);
  return (match?.[1] || "current").trim();
}

function classificationStorageKey(page: HTMLElement) {
  const params = new URLSearchParams(window.location.search);
  const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
  return `jinam:${business}:labels:classification:${orderIdentity(page)}`;
}

function fieldChoices(checklist: HTMLElement) {
  return Array.from(checklist.querySelectorAll<HTMLElement>(":scope > .fieldChoice"));
}

function visibleChoiceLabel(choice: HTMLElement) {
  return choice.querySelector<HTMLElement>("label:first-child span")?.textContent?.trim() || "";
}

function personDetailChoices(checklist: HTMLElement) {
  return fieldChoices(checklist)
    .map(choice => ({ choice, label: visibleChoiceLabel(choice) }))
    .filter(item => item.label.startsWith("Person detail · "))
    .map(item => ({ ...item, name: item.label.replace(/^Person detail ·\s*/, "").trim() }))
    .filter(item => item.name);
}

function setChoiceChecked(choice: HTMLElement, checked: boolean) {
  const input = choice.querySelector<HTMLInputElement>('label:first-child input[type="checkbox"]');
  if (!input || input.checked === checked) return;
  input.click();
}

function enhanceClassification(page: HTMLElement) {
  const checklist = page.querySelector<HTMLElement>(".simpleDesigner .fieldChecklist");
  if (!checklist) return;

  const choices = fieldChoices(checklist);
  const systemGroup = choices.find(choice => visibleChoiceLabel(choice) === "Group / label type" || visibleChoiceLabel(choice) === "Label type / position");
  if (systemGroup) {
    const label = systemGroup.querySelector<HTMLElement>("label:first-child span");
    if (label) label.textContent = "Label type / position";
    systemGroup.dataset.infoGroup = "Core information";
  }

  const people = personDetailChoices(checklist);
  let card = checklist.querySelector<HTMLElement>(":scope > .labelClassificationCard");
  if (!card) {
    card = document.createElement("div");
    card.className = "fieldChoice labelClassificationCard";
    card.dataset.infoGroup = "Core information";
    const personCard = choices.find(choice => visibleChoiceLabel(choice) === "Person / workpiece");
    if (personCard?.nextSibling) checklist.insertBefore(card, personCard.nextSibling);
    else checklist.prepend(card);
  }

  const saved = localStorage.getItem(classificationStorageKey(page)) || "";
  card.replaceChildren();
  const head = document.createElement("div");
  head.className = "labelClassificationHead";
  const title = document.createElement("b");
  title.textContent = "Classification / group";
  const hint = document.createElement("small");
  hint.textContent = "Choose which saved person field defines the group.";
  head.append(title, hint);
  card.appendChild(head);

  if (!people.length) {
    const empty = document.createElement("div");
    empty.className = "labelClassificationEmpty";
    empty.innerHTML = "<b>No classification field in this order.</b><span>Add a Person detail such as Class, Gender, House or Department in Order setup first.</span>";
    card.appendChild(empty);
    return;
  }

  const select = document.createElement("select");
  select.className = "labelClassificationSelect";
  select.setAttribute("aria-label", "Classification field for label grouping");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose classification field…";
  select.appendChild(placeholder);
  people.forEach(item => {
    const option = document.createElement("option");
    option.value = item.label;
    option.textContent = item.name;
    select.appendChild(option);
  });
  if (people.some(item => item.label === saved)) select.value = saved;
  select.addEventListener("change", () => {
    const next = select.value;
    if (!next) {
      localStorage.removeItem(classificationStorageKey(page));
      return;
    }
    localStorage.setItem(classificationStorageKey(page), next);
    const target = people.find(item => item.label === next);
    if (target) setChoiceChecked(target.choice, true);
  });
  card.appendChild(select);

  if (saved) {
    const active = people.find(item => item.label === saved);
    if (active) {
      const status = document.createElement("small");
      status.className = "labelClassificationStatus";
      status.textContent = `${active.name} is the classification field. Its saved value will be used on each label.`;
      card.appendChild(status);
    }
  }
}

function normalizePrintedNameInput(input: HTMLInputElement) {
  if (input.value === EMPTY_SENTINEL) input.value = "";
}

export function LabelFieldLogic() {
  useEffect(() => {
    let frame = 0;
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".labelDesignerPage").forEach(page => enhanceClassification(page));
      document.querySelectorAll<HTMLInputElement>('.labelDesignerPage input[aria-label^="Printed name for "]').forEach(normalizePrintedNameInput);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; enhance(); });
    };

    const captureInput = (event: Event) => {
      const input = (event.target as Element | null)?.closest<HTMLInputElement>('.labelDesignerPage input[aria-label^="Printed name for "]');
      if (!input) return;
      if (input.value === "") {
        input.value = EMPTY_SENTINEL;
      } else if (input.value.includes(EMPTY_SENTINEL)) {
        input.value = input.value.replaceAll(EMPTY_SENTINEL, "");
      }
    };
    const focus = (event: FocusEvent) => {
      const input = (event.target as Element | null)?.closest<HTMLInputElement>('.labelDesignerPage input[aria-label^="Printed name for "]');
      if (input) normalizePrintedNameInput(input);
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("input", captureInput, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("change", schedule, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("input", captureInput, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("change", schedule, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
