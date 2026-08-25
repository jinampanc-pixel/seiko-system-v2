import { quantityForRecord } from "./order-domain";

/** One physical garment keeps one identity through every production operation. */
export type GarmentIdentity = {
  id: string;
  businessId: string;
  orderId: string;
  productId: string;
  personId?: string;
  scanToken: string;
};

export type PlannedPackageIdentity = {
  id: string;
  businessId: string;
  orderId: string;
  personId?: string;
  scanToken: string;
  status: "planned" | "packing" | "verified" | "sealed" | "dispatched" | "delivered";
};

export type OrderGeneratedArtifacts = {
  businessId: string;
  orderId: string;
  generatedAt: string;
  garments: GarmentIdentity[];
  packages: PlannedPackageIdentity[];
  drafts: { productionReport: true; packingPlan: true; invoice: true; labels: true };
};

export function generatedArtifactStoreKey(businessId: string) {
  return `jinam:${businessId}:generated-order-artifacts-v1`;
}

export function garmentScanToken(orderId: string, recordId: string, productId: string, unit: number) {
  return `garment:${orderId}:${recordId}:${productId}:${unit}`;
}

export function loadOrderArtifacts(businessId: string, orderId: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(generatedArtifactStoreKey(businessId)) || "[]") as OrderGeneratedArtifacts[];
    return saved.find(item => item.orderId === orderId);
  } catch { return undefined; }
}

/** Saving an order creates identities and document drafts; it does not mark physical work as started. */
export function generateOrderArtifacts(businessId: string, order: import("./order-domain").SeikoOrder): OrderGeneratedArtifacts {
  const garments: GarmentIdentity[] = [];
  const activeRecords = order.records.filter(record => !record.held);
  const records: import("./order-domain").OrderRecord[] = order.records.length ? activeRecords : [{ recordId: "order", personId: "", values: {} }];
  for (const record of records) for (const product of order.products.filter(item => item.name.trim())) {
    const quantity = quantityForRecord(product, record, record.recordId === records[0].recordId);
    for (let unit = 1; unit <= Math.max(0, quantity); unit++) garments.push({
      id: `${order.orderId}:${record.recordId}:${product.id}:${unit}`,
      businessId, orderId: order.orderId, productId: product.id,
      personId: record.personId || undefined,
      scanToken: garmentScanToken(order.orderId, record.recordId, product.id, unit),
    });
  }
  const packages = activeRecords.map(record => ({
    id: `${order.orderId}:package:${record.recordId}`, businessId, orderId: order.orderId,
    personId: record.personId, scanToken: `package:${order.orderId}:${record.recordId}`, status: "planned" as const,
  }));
  const artifacts: OrderGeneratedArtifacts = { businessId, orderId: order.orderId, generatedAt: new Date().toISOString(), garments, packages, drafts: { productionReport: true, packingPlan: true, invoice: true, labels: true } };
  if (typeof window !== "undefined") {
    const key = generatedArtifactStoreKey(businessId);
    let saved: OrderGeneratedArtifacts[] = [];
    try { saved = JSON.parse(localStorage.getItem(key) || "[]") as OrderGeneratedArtifacts[]; } catch { saved = []; }
    const previous = saved.find(item => item.orderId === order.orderId);
    artifacts.packages = artifacts.packages.map(item => ({ ...item, status: previous?.packages.find(old => old.id === item.id)?.status || item.status }));
    localStorage.setItem(key, JSON.stringify([artifacts, ...saved.filter(item => item.orderId !== order.orderId)]));
  }
  return artifacts;
}

/** Rates belong to the operation, not to the label or garment. */
export type OperationRate = {
  id: string;
  businessId: string;
  productId?: string;
  operationId: string;
  amount: number;
  unit: "per_garment" | "per_piece" | "per_hour";
  effectiveFrom: string;
  effectiveTo?: string;
};

/** Every worker scan appends credit; it never replaces an earlier worker's work. */
export type WorkerOperationScan = {
  id: string;
  businessId: string;
  garmentId: string;
  operationId: string;
  workerId: string;
  action: "start" | "complete" | "undo";
  at: string;
  rateId?: string;
  creditedAmount?: number;
  reason?: string;
};

export type GarmentProductionHistory = {
  garment: GarmentIdentity;
  scans: WorkerOperationScan[];
};

export type ProductionPolicy = {
  useCutPlans?: boolean;
  useBundles?: boolean;
  useGarmentCodes?: boolean;
  allowStartScans?: boolean;
  calculatePayroll?: boolean;
};

export type ProductionIdentity = {
  id: string;
  businessId: string;
  kind: "order" | "cut_plan" | "lay" | "bundle" | "garment" | "package" | "carton";
  parentId?: string;
  scanToken?: string;
};

/** Every identity level is optional; parent links are used when available. */
export function createProductionIdentity(identity: ProductionIdentity) {
  if (!identity.id || !identity.businessId) throw new Error("Identity and business are required.");
  return identity;
}

export function payrollCredit(scan: WorkerOperationScan, rate?: OperationRate, enabled = true) {
  if (!enabled || scan.action !== "complete" || !rate) return 0;
  return rate.unit === "per_hour" ? 0 : rate.amount;
}

export function addWorkerScan(history: GarmentProductionHistory, scan: WorkerOperationScan) {
  if (scan.garmentId !== history.garment.id || scan.businessId !== history.garment.businessId) {
    throw new Error("Scan does not belong to this garment and business.");
  }
  if (history.scans.some(item => item.id === scan.id)) return history;
  return { ...history, scans: [...history.scans, scan] };
}

export function completedCredits(history: GarmentProductionHistory) {
  const undone = new Set(history.scans.filter(scan => scan.action === "undo").map(scan => scan.reason).filter(Boolean));
  return history.scans.filter(scan => scan.action === "complete" && !undone.has(scan.id));
}
