import { roundMoney } from "./seiko-billing";

export type SalesChannel = "shopify" | "amazon" | "marketplace" | "manual" | "b2b";
export type CustomerPaymentStatus = "unpaid" | "authorized" | "paid" | "part_refunded" | "refunded" | "cod_due" | "cod_collected";
export type SettlementStatus = "not_expected" | "pending" | "part_settled" | "settled" | "disputed";
export type MethFulfilmentStatus = "unfulfilled" | "awaiting_production" | "in_production" | "ready_to_pack" | "packed" | "shipped" | "out_for_delivery" | "delivered" | "rto" | "returned" | "cancelled";
export type SeikoProductionStatus = "pending" | "accepted" | "cutting" | "stitching" | "finishing" | "qc" | "completed" | "transferred" | "cancelled";
export type MethFulfilmentPolicy = "stock_first" | "decide";
export type MethRoutingDecision = "pending" | "stock_first" | "produce";

export type ChannelReference = {
  channel: SalesChannel;
  externalOrderId: string;
  externalOrderNumber?: string;
  externalCustomerId?: string;
  importedAt: string;
  rawFingerprint?: string;
};

export type SkuMapping = {
  id: string;
  methSku: string;
  productName: string;
  size?: string;
  colour?: string;
  shopifyVariantId?: string;
  amazonSellerSku?: string;
  amazonAsin?: string;
  seikoProductionSku: string;
  seikoSpecificationRef?: string;
  active: boolean;
  updatedAt: string;
};

export type MethOrderLine = {
  id: string;
  externalLineId?: string;
  methSku: string;
  productName: string;
  size?: string;
  colour?: string;
  quantity: number;
  unitSellingPrice: number;
  discount: number;
  taxAmount: number;
  finishedStockAllocated: number;
  productionRequired: number;
  seikoHandoffIds: string[];
};

export type MethChannelOrder = {
  id: string;
  orderNumber: string;
  channel: ChannelReference;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  billingAddress?: string;
  currency: "INR" | string;
  lines: MethOrderLine[];
  shippingCharged: number;
  orderDiscount: number;
  customerPaymentStatus: CustomerPaymentStatus;
  settlementStatus: SettlementStatus;
  fulfilmentPolicy?: MethFulfilmentPolicy;
  routingDecision?: MethRoutingDecision;
  fulfilmentStatus: MethFulfilmentStatus;
  placedAt: string;
  updatedAt: string;
};

export type MethFulfilmentPolicySettings = {
  id: "fulfilment-policy";
  defaultPolicy: MethFulfilmentPolicy;
  updatedAt: string;
  updatedBy?: string;
};

export type MethFinishedStockBalance = {
  methSku: string;
  onHand: number;
  reserved: number;
  available: number;
  updatedAt: string;
};

export type ManufacturingRate = {
  id: string;
  methSku: string;
  seikoProductionSku: string;
  rate: number;
  taxRate: number;
  unit: string;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  active: boolean;
};

export type ProductionHandoff = {
  id: string;
  traceId: string;
  methOrderId: string;
  methOrderNumber: string;
  methOrderLineId: string;
  methSku: string;
  seikoProductionSku: string;
  productName: string;
  size?: string;
  colour?: string;
  specificationRef?: string;
  quantityRequested: number;
  quantityAccepted: number;
  quantityCompleted: number;
  quantityChargeable: number;
  manufacturingRateId: string;
  agreedUnitRate: number;
  agreedTaxRate: number;
  promisedDate?: string;
  priority: "normal" | "priority" | "urgent";
  seikoStatus: SeikoProductionStatus;
  methStatus: MethFulfilmentStatus;
  intercompanyTransactionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type IntercompanyTransaction = {
  id: string;
  traceId: string;
  handoffId: string;
  sellerBusinessId: "seiko";
  buyerBusinessId: "meth";
  sellerDocumentId?: string;
  sellerInvoiceNumber?: string;
  grossAmount: number;
  taxableAmount: number;
  taxAmount: number;
  paidAmount: number;
  creditAmount: number;
  outstandingAmount: number;
  status: "draft" | "due" | "part_paid" | "paid" | "credited" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type IntercompanyPayment = {
  id: string;
  transactionId: string;
  amount: number;
  paidAt: string;
  mode: string;
  reference?: string;
  createdAt: string;
};

export type ChannelSettlement = {
  id: string;
  methOrderId: string;
  channel: SalesChannel;
  customerPaidAmount: number;
  marketplaceFees: number;
  paymentGatewayFees: number;
  shippingDeductions: number;
  refunds: number;
  otherAdjustments: number;
  settledAmount: number;
  bankReference?: string;
  settlementDate?: string;
  status: SettlementStatus;
};

export type ShipmentRecord = {
  id: string;
  methOrderId: string;
  carrier: string;
  awb: string;
  trackingUrl?: string;
  shipmentCost: number;
  paymentMode: "prepaid" | "cod";
  status: "label_created" | "handed_over" | "shipped" | "out_for_delivery" | "delivered" | "rto" | "returned";
  attempts: number;
  updatedAt: string;
};

export type ReturnClaim = {
  id: string;
  methOrderId: string;
  methOrderLineId: string;
  quantity: number;
  reason: string;
  customerRefundAmount: number;
  productionDefect: boolean;
  seikoClaimStatus: "not_applicable" | "pending" | "approved_credit" | "approved_remake" | "rejected";
  seikoCreditAmount: number;
  createdAt: string;
};

export type BusinessLegalProfile = {
  businessId: "seiko" | "meth";
  legalName: string;
  gstin: string;
  registeredAddress: string;
  stateCode: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  ifsc: string;
  invoicePrefix: string;
  gstRegistered: boolean;
  einvoiceApplicable?: boolean;
  updatedAt: string;
};

export function methStoreKey(name: "orders" | "sku-mappings" | "rates" | "handoffs" | "settlements" | "shipments" | "returns") {
  return `jinam:meth:commerce:${name}:v1`;
}
export function intercompanyStoreKey(name: "transactions" | "payments") { return `jinam:intercompany:seiko-meth:${name}:v1`; }
export function legalProfileStoreKey(businessId: "seiko" | "meth") { return `jinam:${businessId}:legal-profile:v1`; }

export function normalizeChannelOrder(input: Omit<MethChannelOrder, "id" | "orderNumber" | "updatedAt"> & { id?: string; orderNumber?: string }): MethChannelOrder {
  const external = input.channel.externalOrderId.trim();
  const channel = input.channel.channel;
  const id = input.id || stableId(`meth-order:${channel}:${external}`);
  const fulfilmentPolicy = input.fulfilmentPolicy || "stock_first";
  const routingDecision = input.routingDecision || (fulfilmentPolicy === "decide" ? "pending" : "stock_first");
  const lines = input.lines.map(line => {
    const quantity = positive(line.quantity);
    if (routingDecision === "pending") return { ...line, quantity, finishedStockAllocated: 0, productionRequired: 0 };
    if (routingDecision === "produce") return { ...line, quantity, finishedStockAllocated: 0, productionRequired: quantity };
    const finishedStockAllocated = Math.min(quantity, positive(line.finishedStockAllocated));
    return { ...line, quantity, finishedStockAllocated, productionRequired: Math.max(0, quantity - finishedStockAllocated) };
  });
  const productionRequired = lines.reduce((sum, line) => sum + line.productionRequired, 0);
  const fulfilmentStatus: MethFulfilmentStatus = routingDecision === "pending"
    ? "unfulfilled"
    : productionRequired > 0
      ? "awaiting_production"
      : input.fulfilmentStatus;
  return {
    ...input,
    id,
    orderNumber: input.orderNumber || `MTH-${new Date(input.placedAt).getFullYear()}-${stableId(external).slice(-6).toUpperCase()}`,
    fulfilmentPolicy,
    routingDecision,
    lines,
    fulfilmentStatus,
    updatedAt: new Date().toISOString(),
  };
}

export function allocateStock(quantityOrdered: number, finishedStockAvailable: number) {
  const ordered = positive(quantityOrdered);
  const stock = Math.min(ordered, positive(finishedStockAvailable));
  return { finishedStockAllocated: stock, productionRequired: ordered - stock };
}

export function routeOrderFulfilment(order: MethChannelOrder, decision: Exclude<MethRoutingDecision, "pending">, finishedStockBySku: Record<string, number> = {}) {
  const lines = order.lines.map(line => {
    if (decision === "produce") return { ...line, finishedStockAllocated: 0, productionRequired: positive(line.quantity) };
    const available = Object.prototype.hasOwnProperty.call(finishedStockBySku, line.methSku)
      ? positive(finishedStockBySku[line.methSku])
      : positive(line.finishedStockAllocated);
    const allocation = allocateStock(line.quantity, available);
    return { ...line, ...allocation };
  });
  const productionRequired = lines.reduce((sum, line) => sum + line.productionRequired, 0);
  return {
    ...order,
    routingDecision: decision,
    lines,
    fulfilmentStatus: productionRequired > 0 ? "awaiting_production" as const : "ready_to_pack" as const,
    updatedAt: new Date().toISOString(),
  };
}

export function activeRateForSku(rates: ManufacturingRate[], methSku: string, onDate = new Date().toISOString().slice(0, 10)) {
  return rates.filter(rate => rate.active && rate.methSku === methSku && rate.effectiveFrom <= onDate && (!rate.effectiveTo || rate.effectiveTo >= onDate)).sort((a, b) => b.version - a.version)[0];
}

export function createProductionHandoff(order: MethChannelOrder, line: MethOrderLine, mapping: SkuMapping, rate: ManufacturingRate): ProductionHandoff {
  if (line.productionRequired <= 0) throw new Error("No production shortage exists for this line");
  if (mapping.methSku !== line.methSku || rate.methSku !== line.methSku) throw new Error("SKU mapping and manufacturing rate must match the MeTh order line");
  const now = new Date().toISOString();
  const traceId = stableId(`handoff:${order.id}:${line.id}:${now}`);
  return {
    id: `PH-${traceId.slice(-10).toUpperCase()}`,
    traceId,
    methOrderId: order.id,
    methOrderNumber: order.orderNumber,
    methOrderLineId: line.id,
    methSku: line.methSku,
    seikoProductionSku: mapping.seikoProductionSku,
    productName: line.productName,
    size: line.size,
    colour: line.colour,
    specificationRef: mapping.seikoSpecificationRef,
    quantityRequested: line.productionRequired,
    quantityAccepted: 0,
    quantityCompleted: 0,
    quantityChargeable: 0,
    manufacturingRateId: rate.id,
    agreedUnitRate: rate.rate,
    agreedTaxRate: rate.taxRate,
    priority: "normal",
    seikoStatus: "pending",
    methStatus: "awaiting_production",
    createdAt: now,
    updatedAt: now,
  };
}

export function translateSeikoStatus(status: SeikoProductionStatus): MethFulfilmentStatus {
  if (status === "completed" || status === "transferred") return "ready_to_pack";
  if (["accepted", "cutting", "stitching", "finishing", "qc"].includes(status)) return "in_production";
  if (status === "cancelled") return "cancelled";
  return "awaiting_production";
}

export function updateHandoffQuantities(handoff: ProductionHandoff, accepted: number, completed: number, chargeable: number) {
  const quantityAccepted = Math.min(handoff.quantityRequested, positive(accepted));
  const quantityCompleted = Math.min(quantityAccepted, positive(completed));
  const quantityChargeable = Math.min(quantityCompleted, positive(chargeable));
  return { ...handoff, quantityAccepted, quantityCompleted, quantityChargeable, updatedAt: new Date().toISOString() };
}

export function createIntercompanyTransaction(handoff: ProductionHandoff): IntercompanyTransaction {
  if (handoff.quantityChargeable <= 0) throw new Error("Chargeable quantity must be greater than zero");
  const taxableAmount = roundMoney(handoff.quantityChargeable * handoff.agreedUnitRate);
  const taxAmount = roundMoney(taxableAmount * handoff.agreedTaxRate / 100);
  const grossAmount = roundMoney(taxableAmount + taxAmount);
  const id = `IBT-${stableId(`ibt:${handoff.traceId}`).slice(-10).toUpperCase()}`;
  return { id, traceId: handoff.traceId, handoffId: handoff.id, sellerBusinessId: "seiko", buyerBusinessId: "meth", grossAmount, taxableAmount, taxAmount, paidAmount: 0, creditAmount: 0, outstandingAmount: grossAmount, status: "due", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export function settleIntercompanyTransaction(transaction: IntercompanyTransaction, payments: IntercompanyPayment[], credits = transaction.creditAmount) {
  const paidAmount = roundMoney(payments.filter(payment => payment.transactionId === transaction.id).reduce((sum, payment) => sum + positive(payment.amount), 0));
  const creditAmount = Math.min(transaction.grossAmount, positive(credits));
  const outstandingAmount = Math.max(0, roundMoney(transaction.grossAmount - paidAmount - creditAmount));
  const status: IntercompanyTransaction["status"] = outstandingAmount === 0 ? (creditAmount >= transaction.grossAmount ? "credited" : "paid") : paidAmount > 0 || creditAmount > 0 ? "part_paid" : "due";
  return { ...transaction, paidAmount, creditAmount, outstandingAmount, status, updatedAt: new Date().toISOString() };
}

export function productionUnitCost(transaction: IntercompanyTransaction, chargeableQuantity: number) {
  return chargeableQuantity > 0 ? roundMoney(transaction.grossAmount / chargeableQuantity) : 0;
}

export function settlementNet(settlement: Omit<ChannelSettlement, "settledAmount">) {
  return roundMoney(positive(settlement.customerPaidAmount) - positive(settlement.marketplaceFees) - positive(settlement.paymentGatewayFees) - positive(settlement.shippingDeductions) - positive(settlement.refunds) + Number(settlement.otherAdjustments || 0));
}

export function returnAffectsSeikoCost(claim: ReturnClaim) {
  return claim.productionDefect && ["approved_credit", "approved_remake"].includes(claim.seikoClaimStatus);
}

function positive(value: number) { return Math.max(0, Number(value) || 0); }
function stableId(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash >>> 0).toString(36).padStart(7, "0");
}
