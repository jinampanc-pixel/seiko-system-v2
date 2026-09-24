"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";
import { libraryStoreKey, type ClientLibraryRecord } from "./lib/business-library";

function readClients() {
  try { return JSON.parse(localStorage.getItem(libraryStoreKey("seiko", "clients")) || "[]") as ClientLibraryRecord[]; } catch { return []; }
}

function setInput(input: HTMLInputElement | undefined, value: string) {
  if (!input || !value) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function inputByLabel(root: ParentNode, labelText: string) {
  return Array.from(root.querySelectorAll<HTMLLabelElement>("label")).find(label => label.textContent?.toLowerCase().includes(labelText.toLowerCase()))?.querySelector<HTMLInputElement>("input") || undefined;
}

export function SeikoLibraryAutofill() {
  useEffect(() => {
    const controller = startDomEnhancement(() => {
      const root = document.querySelector<HTMLElement>(".orderSetup .clientDetails");
      if (!root) return;
      const clientInput = inputByLabel(root, "Client name");
      if (!clientInput) return;
      const clients = readClients().filter(item => !item.archived);
      clientInput.setAttribute("list", "seiko-client-library-options");
      let datalist = document.getElementById("seiko-client-library-options") as HTMLDataListElement | null;
      if (!datalist) { datalist = document.createElement("datalist"); datalist.id = "seiko-client-library-options"; document.body.appendChild(datalist); }
      const signature = clients.map(client => `${client.id}:${client.updatedAt}`).join("|");
      if (datalist.dataset.signature !== signature) {
        datalist.dataset.signature = signature;
        datalist.replaceChildren(...clients.map(client => { const option = document.createElement("option"); option.value = client.name; option.label = [client.type, client.phone].filter(Boolean).join(" · "); return option; }));
      }
      if (clientInput.dataset.libraryAutofillBound === "true") return;
      clientInput.dataset.libraryAutofillBound = "true";
      clientInput.addEventListener("change", () => {
        const record = readClients().find(item => !item.archived && item.name.trim().toLowerCase() === clientInput.value.trim().toLowerCase());
        if (!record) return;
        setInput(inputByLabel(root, "Contact person"), record.contactPerson);
        setInput(inputByLabel(root, "Phone number"), record.phone);
        setInput(inputByLabel(root, "Delivery address"), record.deliveryAddress);
        setInput(inputByLabel(root, "Billing address"), record.billingAddress);
      });
    });
    return () => controller.stop();
  }, []);
  return null;
}
