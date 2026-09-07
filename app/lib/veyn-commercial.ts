export type VeynCommercialStatus = "draft" | "issued" | "accepted" | "part-delivered" | "delivered" | "invoiced" | "closed" | "cancelled";

export type VeynParty = {
  name: string;
  attention?: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  gstin?: string;
};

export type VeynCommercialLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
};

export type VeynQuotation = {
  id: string;
  orderId: string;
  quotationNumber: string;
  issueDate: string;
  validTill?: string;
  reference?: string;
  customer: VeynParty;
  lines: VeynCommercialLine[];
  terms: string[];
  status: "draft" | "issued" | "accepted" | "revised" | "expired" | "cancelled";
  revision: number;
  acceptedAt?: string;
  acceptedBy?: string;
};

/**
 * The PO stage is linked to the accepted commercial terms rather than copying
 * another disconnected item table. `customerPoNumber` can hold an external PO
 * supplied by the client when one exists; otherwise the accepted quotation is
 * the commercial authority for supply.
 */
export type VeynPurchaseOrder = {
  id: string;
  orderId: string;
  quotationId: string;
  poNumber: string;
  customerPoNumber?: string;
  acceptedQuotationRevision: number;
  acceptedAt: string;
  status: "open" | "part-delivered" | "delivered" | "cancelled";
};

export type VeynDeliveryLine = {
  lineId: string;
  ordered: number;
  delivered: number;
};

export type VeynDeliveryChallan = {
  id: string;
  orderId: string;
  quotationId: string;
  purchaseOrderId: string;
  challanNumber: string;
  issueDate: string;
  reference: string;
  deliverTo: VeynParty;
  lines: VeynDeliveryLine[];
  statusNote?: string;
  receivedBy?: string;
  receivedAt?: string;
  status: "draft" | "issued" | "received" | "cancelled";
};

/**
 * The invoice intentionally links back to the commercial chain. Visual/tax
 * fields stay separate from the quotation/DC template until the invoice layout
 * is formally locked.
 */
export type VeynInvoice = {
  id: string;
  orderId: string;
  quotationId: string;
  purchaseOrderId: string;
  challanIds: string[];
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  lines: VeynCommercialLine[];
  status: "draft" | "issued" | "part-paid" | "paid" | "cancelled";
};

export type VeynCommercialRecord = {
  orderId: string;
  status: VeynCommercialStatus;
  quotations: VeynQuotation[];
  purchaseOrders: VeynPurchaseOrder[];
  deliveryChallans: VeynDeliveryChallan[];
  invoices: VeynInvoice[];
};

export function lineAmount(line: Pick<VeynCommercialLine, "quantity" | "unitRate">): number {
  return roundMoney(line.quantity * line.unitRate);
}

export function quotationTotal(quotation: Pick<VeynQuotation, "lines">): number {
  return roundMoney(quotation.lines.reduce((total, line) => total + lineAmount(line), 0));
}

export function pendingQuantity(line: VeynDeliveryLine): number {
  return Math.max(0, roundQuantity(line.ordered - line.delivered));
}

export function deliveryComplete(lines: VeynDeliveryLine[]): boolean {
  return lines.length > 0 && lines.every(line => pendingQuantity(line) === 0);
}

export function currentAcceptedQuotation(record: VeynCommercialRecord): VeynQuotation | undefined {
  return [...record.quotations]
    .filter(quotation => quotation.status === "accepted")
    .sort((left, right) => right.revision - left.revision)[0];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
