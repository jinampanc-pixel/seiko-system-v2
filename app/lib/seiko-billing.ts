export type SeikoTaxMode = "gst" | "non_gst";
export type SeikoDocumentKind = "quotation" | "delivery_challan" | "invoice" | "payment_receipt";

export type SeikoBillingLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  taxRate: number;
};

export type SeikoCommercialDocument = {
  id: string;
  kind: SeikoDocumentKind;
  number: string;
  orderId: string;
  orderNo: string;
  clientName: string;
  issueDate: string;
  dueDate?: string;
  reference?: string;
  taxMode: SeikoTaxMode;
  taxTreatment: "intra_state" | "inter_state";
  lines: SeikoBillingLine[];
  notes: string;
  status: "draft" | "issued" | "cancelled" | "paid" | "part_paid";
  createdAt: string;
  updatedAt: string;
  clientPhone?: string;
  clientAddress?: string;
  clientGstin?: string;
  supplier?: { name: string; address: string; phone: string; gstin: string; bank: string };
};

export type SeikoPaymentRecord = {
  orderNo?: string;
  clientName?: string;
  clientPhone?: string;
  allocations?: { invoiceId: string; amount: number }[];
  id: string;
  invoiceId: string;
  orderId: string;
  receiptNumber: string;
  date: string;
  amount: number;
  mode: string;
  reference: string;
  notes: string;
  createdAt: string;
};

export type SeikoDocumentTemplate = {
  kind: SeikoDocumentKind;
  title: string;
  showBusinessIdentity: boolean;
  showCustomerBlock: boolean;
  showPaymentTerms: boolean;
  showBankDetails: boolean;
  showQrLink: boolean;
  showTerms: boolean;
  showAuthorizedSignatory: boolean;
  showCustomerAcknowledgement: boolean;
  terms: string[];
};

export type SeikoTemplateSet = Record<SeikoDocumentKind, SeikoDocumentTemplate>;

export function billingStoreKey(businessId: string) { return `jinam:${businessId}:billing:documents:v1`; }
export function paymentStoreKey(businessId: string) { return `jinam:${businessId}:billing:payments:v1`; }
export function templateStoreKey(businessId: string) { return `jinam:${businessId}:billing:templates:v1`; }

export const DEFAULT_SEIKO_TEMPLATES: SeikoTemplateSet = {
  quotation: baseTemplate("quotation", "Quotation"),
  delivery_challan: baseTemplate("delivery_challan", "Delivery Challan"),
  invoice: {
    ...baseTemplate("invoice", "Tax Invoice"),
    showPaymentTerms: true,
    showBankDetails: true,
    showQrLink: true,
    showTerms: true,
    showAuthorizedSignatory: true,
    showCustomerAcknowledgement: true,
  },
  payment_receipt: { ...baseTemplate("payment_receipt", "Payment Receipt"), showBankDetails: false },
};

function baseTemplate(kind: SeikoDocumentKind, title: string): SeikoDocumentTemplate {
  return { kind, title, showBusinessIdentity: true, showCustomerBlock: true, showPaymentTerms: false, showBankDetails: false, showQrLink: false, showTerms: false, showAuthorizedSignatory: true, showCustomerAcknowledgement: false, terms: [] };
}

export function lineSubtotal(line: SeikoBillingLine) {
  return roundMoney(Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitRate) || 0));
}

export function documentTotals(document: Pick<SeikoCommercialDocument, "taxMode" | "taxTreatment" | "lines">) {
  const subtotal = roundMoney(document.lines.reduce((sum, line) => sum + lineSubtotal(line), 0));
  const tax = document.taxMode === "gst" ? roundMoney(document.lines.reduce((sum, line) => sum + lineSubtotal(line) * Math.max(0, Number(line.taxRate) || 0) / 100, 0)) : 0;
  const cgst = document.taxMode === "gst" && document.taxTreatment === "intra_state" ? roundMoney(tax / 2) : 0;
  const sgst = document.taxMode === "gst" && document.taxTreatment === "intra_state" ? roundMoney(tax - cgst) : 0;
  const igst = document.taxMode === "gst" && document.taxTreatment === "inter_state" ? tax : 0;
  return { subtotal, tax, cgst, sgst, igst, total: roundMoney(subtotal + tax) };
}

export function paymentsForInvoice(payments: SeikoPaymentRecord[], invoiceId: string) {
  return roundMoney(payments.reduce((sum, payment) => sum + paymentAppliedToInvoice(payment, invoiceId), 0));
}

export function invoiceOutstanding(invoice: SeikoCommercialDocument, payments: SeikoPaymentRecord[]) {
  if (invoice.kind !== "invoice") return 0;
  return Math.max(0, roundMoney(documentTotals(invoice).total - paymentsForInvoice(payments, invoice.id)));
}

export function nextDocumentNumber(kind: SeikoDocumentKind, existing: SeikoCommercialDocument[]) {
  const prefix: Record<SeikoDocumentKind, string> = { quotation: "QTN", delivery_challan: "DC", invoice: "INV", payment_receipt: "RCP" };
  const year = new Date().getFullYear();
  const sequence = existing.filter(document => document.kind === kind).length + 1;
  return `${prefix[kind]}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function billingStatus(document: SeikoCommercialDocument, payments: SeikoPaymentRecord[]) {
  if (document.status === "cancelled" || document.kind !== "invoice") return document.status;
  return invoiceOutstanding(document, payments) === 0 ? "paid" : paymentsForInvoice(payments, document.id) > 0 ? "part_paid" : "issued";
}

export function validateBillingDocument(document: SeikoCommercialDocument): string {
  if (!["invoice", "quotation", "delivery_challan"].includes(document.kind)) return "Choose an invoice, quotation or challan.";
  if (!document.clientName?.trim() || !document.clientPhone?.trim()) return "Client name and phone are required.";
  if (!document.supplier?.name?.trim()) return "Supplier name is required.";
  if (!validBillingDate(document.issueDate)) return "Choose a valid invoice date.";
  if (document.dueDate && (!validBillingDate(document.dueDate) || document.dueDate < document.issueDate)) return "Due date must be on or after the invoice date.";
  if (!["gst", "non_gst"].includes(document.taxMode) || !["intra_state", "inter_state"].includes(document.taxTreatment)) return "Choose a valid tax treatment.";
  if (!Array.isArray(document.lines) || !document.lines.length || document.lines.length > 200) return "Add between 1 and 200 item lines.";
  if (document.lines.some(line => !line.description?.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitRate) || line.unitRate < 0 || !Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 100)) return "Each item needs a description, positive quantity and valid rate/tax.";
  if (documentTotals(document).total > 1_000_000_000) return "Invoice total is too large.";
  return "";
}

export function validBillingDate(value: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// Order money is applied oldest-invoice-first in integer paise. Original receipts
// remain immutable; allocations are a derived view, never additional payments.
export function paymentAppliedToInvoice(payment: SeikoPaymentRecord, invoiceId: string) {
  return payment.invoiceId === invoiceId ? payment.amount : (payment.allocations || []).filter(item => item.invoiceId === invoiceId).reduce((sum, item) => sum + item.amount, 0);
}
export function allocateOrderPayments(documents: SeikoCommercialDocument[], payments: SeikoPaymentRecord[]) {
  const ordered = [...documents].filter(d => d.kind === "invoice" && d.status !== "cancelled").sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  const remaining = new Map(ordered.map(d => [d.id, Math.max(0, Math.round(documentTotals(d).total * 100) - payments.filter(p => p.invoiceId === d.id).reduce((sum,p) => sum + Math.round(p.amount * 100), 0))]));
  const allocations = new Map<string, { invoiceId: string; amount: number }[]>();
  for (const payment of [...payments].sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.receiptNumber.localeCompare(b.receiptNumber) || a.id.localeCompare(b.id))) {
    if (payment.invoiceId || !payment.orderId) continue;
    let available = Math.round(payment.amount * 100); const applied = [];
    for (const invoice of ordered.filter(d => d.orderId === payment.orderId)) {
      const amount = Math.min(available, remaining.get(invoice.id) || 0);
      if (amount > 0) { applied.push({ invoiceId: invoice.id, amount: amount / 100 }); remaining.set(invoice.id, remaining.get(invoice.id)! - amount); available -= amount; }
    }
    allocations.set(payment.id, applied);
  }
  return payments.map(p => ({ ...p, allocations: allocations.get(p.id) || [] }));
}
export function unappliedOrderPayment(payment: SeikoPaymentRecord) {
  return payment.invoiceId ? 0 : Math.max(0, roundMoney(payment.amount - (payment.allocations || []).reduce((sum,a) => sum + a.amount, 0)));
}
export function orderReceiptDocument(payment: SeikoPaymentRecord): SeikoCommercialDocument {
  return { id: "receipt:" + payment.id, kind: "payment_receipt", number: payment.receiptNumber, orderId: payment.orderId, orderNo: payment.orderNo || payment.orderId, clientName: payment.clientName || "Order payment", clientPhone: payment.clientPhone || "", issueDate: payment.date, taxMode: "non_gst", taxTreatment: "intra_state", lines: [], notes: "", status: "issued", createdAt: payment.createdAt, updatedAt: payment.createdAt };
}
