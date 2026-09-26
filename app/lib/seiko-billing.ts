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
  return roundMoney(payments.filter(payment => payment.invoiceId === invoiceId).reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0));
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
