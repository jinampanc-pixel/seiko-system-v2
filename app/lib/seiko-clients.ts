import type { ClientLibraryRecord } from "./business-library";

export type SeikoClientType = "institutional" | "custom_tailoring" | "retail";
export type SeikoClientRecord = ClientLibraryRecord & { type: SeikoClientType };

export const SEIKO_CLIENT_TYPES: { value: SeikoClientType; label: string }[] = [
  { value: "institutional", label: "Institutional" },
  { value: "custom_tailoring", label: "Custom tailoring" },
  { value: "retail", label: "Retail" },
];

export function newSeikoClient(): SeikoClientRecord {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name: "", type: "retail", contactPerson: "", phone: "", email: "", billingAddress: "", deliveryAddress: "", gstin: "", archived: false, sourceOrderIds: [], createdAt: now, updatedAt: now };
}

export function normalizeClientType(value: string): SeikoClientType {
  const key = value.trim().toLowerCase().replace(/[ /-]+/g, "_");
  if (key.includes("institution") || key.includes("school") || key.includes("corporate")) return "institutional";
  if (key.includes("tailor") || key.includes("custom")) return "custom_tailoring";
  return "retail";
}

export async function requestSeikoClients(body: object): Promise<{ clients: SeikoClientRecord[]; canManage: boolean }> {
  const response = await fetch("/api/erp/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || "Clients could not be loaded.");
  return result;
}

