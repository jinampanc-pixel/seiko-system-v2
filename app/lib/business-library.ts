import type { SeikoOrder } from "./order-domain";

export type LibraryKind = "clients" | "products" | "vendors";

export type ClientLibraryRecord = {
  id: string;
  name: string;
  type: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress: string;
  deliveryAddress: string;
  gstin: string;
  archived: boolean;
  sourceOrderIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProductLibraryRecord = {
  id: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  hsnSac: string;
  archived: boolean;
  sourceOrderIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type VendorLibraryRecord = {
  id: string;
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export function libraryStoreKey(businessId: string, kind: LibraryKind) {
  return `jinam:${businessId}:library:${kind}:v1`;
}

export function stableLibraryId(prefix: string, value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "record";
  let hash = 2166136261;
  for (const char of value.trim().toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${prefix}-${slug}-${(hash >>> 0).toString(36)}`;
}

export function mergeClientRecord(existing: ClientLibraryRecord | undefined, order: SeikoOrder): ClientLibraryRecord {
  const now = new Date().toISOString();
  const name = order.details.clientName.trim();
  return {
    id: existing?.id || stableLibraryId("client", name),
    name,
    type: order.details.clientType || existing?.type || "",
    contactPerson: order.details.contactPerson || existing?.contactPerson || "",
    phone: order.details.contactNumber || existing?.phone || "",
    email: existing?.email || "",
    billingAddress: order.details.billTo || existing?.billingAddress || "",
    deliveryAddress: order.details.shipTo || existing?.deliveryAddress || "",
    gstin: existing?.gstin || "",
    archived: existing?.archived ?? false,
    sourceOrderIds: [...new Set([...(existing?.sourceOrderIds || []), order.orderId])],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function mergeProductRecord(existing: ProductLibraryRecord | undefined, order: SeikoOrder, productName: string): ProductLibraryRecord {
  const now = new Date().toISOString();
  return {
    id: existing?.id || stableLibraryId("product", productName),
    name: productName.trim(),
    category: existing?.category || order.details.clientType || "",
    unit: existing?.unit || "pc",
    costPrice: existing?.costPrice || 0,
    sellingPrice: existing?.sellingPrice || 0,
    taxRate: existing?.taxRate || 0,
    hsnSac: existing?.hsnSac || "",
    archived: existing?.archived ?? false,
    sourceOrderIds: [...new Set([...(existing?.sourceOrderIds || []), order.orderId])],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function learnLibrariesFromOrders(orders: SeikoOrder[], clients: ClientLibraryRecord[], products: ProductLibraryRecord[]) {
  const clientMap = new Map(clients.map(record => [record.name.trim().toLowerCase(), record]));
  const productMap = new Map(products.map(record => [record.name.trim().toLowerCase(), record]));
  for (const order of orders) {
    if (order.details.clientName.trim()) {
      const key = order.details.clientName.trim().toLowerCase();
      clientMap.set(key, mergeClientRecord(clientMap.get(key), order));
    }
    for (const product of order.products) {
      if (!product.name.trim()) continue;
      const key = product.name.trim().toLowerCase();
      productMap.set(key, mergeProductRecord(productMap.get(key), order, product.name));
    }
  }
  return { clients: [...clientMap.values()], products: [...productMap.values()] };
}
