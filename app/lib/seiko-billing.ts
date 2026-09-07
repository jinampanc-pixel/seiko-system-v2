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
  customerAddress?: string;
  customerContact?: string;
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
  const sgst = document.taxMode === "gst" && document.taxTreatment === "intra_state" ? roundMoney(tax / 2) : 0;
  const igst = document.taxMode === "gst" && document.taxTreatment === "inter_state" ? tax : 0;
  return { subtotal, tax, cgst, sgst, igst, total: roundMoney(subtotal + tax) };
}

export function paymentsForInvoice(payments: SeikoPaymentRecord[], invoiceId: string) {
  return payments.filter(payment => payment.invoiceId === invoiceId).reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
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
