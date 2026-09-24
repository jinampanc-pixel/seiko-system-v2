import type { VeynCommercialRecord, VeynParty } from "./veyn-commercial";

export type VeynRequirementStatus =
  | "Draft"
  | "Ready to quote"
  | "Quoted"
  | "Confirmed"
  | "Part delivered"
  | "Delivered"
  | "Invoiced"
  | "Closed";

export type VeynRequirementLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  specification: string;
  estimatedRate: number;
};

export type VeynRequirement = {
  kind: "veyn-requirement-v1";
  orderId: string;
  status: VeynRequirementStatus;
  archived: boolean;
  updatedAt?: string;
  details: {
    orderNo: string;
    orderDate: string;
    institutionName: string;
    institutionType: string;
    contactPerson: string;
    phone: string;
    email: string;
    gstin: string;
    billTo: string;
    deliverTo: string;
    reference: string;
    requiredBy: string;
    remarks: string;
  };
  lines: VeynRequirementLine[];
  commercial: VeynCommercialRecord;
};

export type VeynRequirementEnvelope = {
  order: VeynRequirement;
  version: number;
  updatedAt: string;
  updatedBy: string;
};

type ApiResult<T> = {
  ok?: boolean;
  code?: string;
  message?: string;
  data?: T;
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function makeVeynNumber(prefix: "REQ" | "QTN" | "PO" | "DC" | "INV"): string {
  const date = todayIso().replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
  return `VY-${prefix}-${date}-${suffix}`;
}

export function blankCommercialRecord(orderId: string): VeynCommercialRecord {
  return {
    orderId,
    status: "draft",
    quotations: [],
    purchaseOrders: [],
    deliveryChallans: [],
    invoices: [],
  };
}

export function blankVeynRequirement(): VeynRequirement {
  const orderId = crypto.randomUUID();
  return {
    kind: "veyn-requirement-v1",
    orderId,
    status: "Draft",
    archived: false,
    details: {
      orderNo: makeVeynNumber("REQ"),
      orderDate: todayIso(),
      institutionName: "",
      institutionType: "Hospital",
      contactPerson: "",
      phone: "",
      email: "",
      gstin: "",
      billTo: "",
      deliverTo: "",
      reference: "",
      requiredBy: "",
      remarks: "",
    },
    lines: [blankRequirementLine()],
    commercial: blankCommercialRecord(orderId),
  };
}

export function blankRequirementLine(): VeynRequirementLine {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "Nos",
    specification: "",
    estimatedRate: 0,
  };
}

export function partyFromRequirement(order: VeynRequirement, delivery = false): VeynParty {
  const address = delivery ? order.details.deliverTo : order.details.billTo;
  return {
    name: order.details.institutionName,
    attention: order.details.contactPerson || undefined,
    addressLines: address.split("\n").map(line => line.trim()).filter(Boolean),
    phone: order.details.phone || undefined,
    email: order.details.email || undefined,
    gstin: order.details.gstin || undefined,
  };
}

export async function listVeynRequirements(businessId: string): Promise<VeynRequirementEnvelope[]> {
  const response = await fetch("/api/erp/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "list", businessId }),
  });
  const result = await response.json() as ApiResult<{ orders?: Array<{ order?: unknown; version?: number; updatedAt?: string; updatedBy?: string }> }>;
  if (!response.ok || !result.ok) throw new Error(result.message || "VÉYN requirements could not be loaded.");

  return (result.data?.orders || []).flatMap(item => {
    const candidate = item.order as Partial<VeynRequirement> | undefined;
    if (!candidate || candidate.kind !== "veyn-requirement-v1" || !candidate.orderId || !candidate.details?.orderNo) return [];
    const order = {
      ...candidate,
      commercial: candidate.commercial || blankCommercialRecord(candidate.orderId),
      lines: Array.isArray(candidate.lines) ? candidate.lines : [],
    } as VeynRequirement;
    return [{
      order,
      version: Number(item.version) || 1,
      updatedAt: item.updatedAt || order.updatedAt || "",
      updatedBy: item.updatedBy || "",
    }];
  });
}

export async function saveVeynRequirement(
  businessId: string,
  order: VeynRequirement,
  expectedVersion: number | null,
): Promise<VeynRequirementEnvelope> {
  const response = await fetch("/api/erp/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "upsert", businessId, order, expectedVersion }),
  });
  const result = await response.json() as ApiResult<{ order?: VeynRequirement; version?: number; updatedAt?: string; updatedBy?: string }>;
  if (!response.ok || !result.ok || !result.data?.order) {
    throw new Error(result.message || "The VÉYN requirement could not be saved.");
  }
  return {
    order: result.data.order,
    version: Number(result.data.version) || 1,
    updatedAt: result.data.updatedAt || result.data.order.updatedAt || "",
    updatedBy: result.data.updatedBy || "",
  };
}
