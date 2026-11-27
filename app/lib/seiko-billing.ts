import type { PricingSnapshot, PriceUnit } from "./order-commerce";
export type SeikoTaxMode = "gst" | "non_gst";
export type SeikoDocumentKind = "quotation" | "delivery_challan" | "invoice" | "payment_receipt";
export type SignatoryPlacement = { x: number; y: number; width: number; height: number };
export type SignatoryLayout = Record<"signature" | "stamp" | "name", SignatoryPlacement>;
export type BillingPrintPreferences = { fieldLabels?: Record<string, { label: string; showLabel: boolean }> };

export type SeikoBillingLine = {
  section?: { label:string; date?:string };
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  taxRate: number;
  hsnSac?: string;
  zeroPriceReason?:string;
};

export type SeikoCommercialDocument = {
  creationFingerprint?: string;
  pricingSnapshot?: PricingSnapshot;
  supplementaryFor?: string;
  credits?: {id:string;date:string;reason:string;subtotal:number;tax:number;amount:number;units:PriceUnit[];by:string}[];
  id: string;
  kind: SeikoDocumentKind;
  number: string;
  orderId: string;
  orderNo: string;
  clientName: string;
  clientId?: string;
  clientType?: string;
  clientContactPerson?: string;
  clientEmail?: string;
  issueDate: string;
  dueDate?: string;
  dueOnReceipt?: boolean;
  archivedAt?: string;
  deletedAt?: string;
  terms?: string;
  showTerms?: boolean;
  signatory?: { id: string; name: string; designation: string; signature?: string; stamp?: string; layout?: SignatoryLayout };
  showSignature?: boolean;
  showStamp?: boolean;
  showSigningDate?: boolean;
  signingDate?: string;
  showSignatory?: boolean;
  reference?: string;
  taxMode: SeikoTaxMode;
  taxTreatment: "intra_state" | "inter_state";
  lines: SeikoBillingLine[];
  notes: string;
  showNotes?: boolean;
  status: "draft" | "issued" | "cancelled" | "paid" | "part_paid";
  createdAt: string;
  updatedAt: string;
  clientPhone?: string;
  clientAddress?: string;
  clientGstin?: string;
  clientDeliveryAddress?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  supplyType?: "goods" | "services" | "mixed";
  showMonetaryValues?: boolean;
  dispatch?: { transporter?: string; vehicleNo?: string; eWayBillNo?: string; packages?: string; dispatchDate?: string; returnable?: boolean };
  eInvoiceIrn?: string;
  eInvoiceQr?: string;
  revision?: number;
  amendedAt?: string;
  amendedBy?: string;
  supplier?: {
    name: string; address: string; phone: string; gstin: string; bank: string;
    upi?: string; paymentQr?: string; showBank?: boolean; showUpi?: boolean; showQr?: boolean;
    accountName?: string; bankName?: string; accountNumber?: string; ifsc?: string; logo?: string;
  };
};

export type SeikoPaymentRecord = {
  refundOf?:string; refundReceiptNumber?:string; refundedAmount?:number; refundedBy?:string;
  linkedAt?:string; linkedBy?:string; originalPayer?:string; originalPhone?:string;
  updatedAt?: string;
  revision?: number;
  amendedAt?: string;
  amendedBy?: string;
  appearance?: Pick<SeikoCommercialDocument, "supplier" | "signatory" | "showSignatory" | "showSignature" | "showStamp" | "showSigningDate" | "signingDate">;
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
  showNotes?: boolean;
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

export function documentTotals(document: Pick<SeikoCommercialDocument, "taxMode" | "taxTreatment" | "lines" | "credits">) {
  const originalSubtotal = roundMoney(document.lines.reduce((sum, line) => sum + lineSubtotal(line), 0));
  const originalTax = document.taxMode === "gst" ? roundMoney(document.lines.reduce((sum, line) => sum + lineSubtotal(line) * Math.max(0, Number(line.taxRate) || 0) / 100, 0)) : 0;
  const creditTotal=roundMoney((document.credits||[]).reduce((n,c)=>n+c.amount,0));
  const subtotal=roundMoney(originalSubtotal-(document.credits||[]).reduce((n,c)=>n+c.subtotal,0));
  const tax=roundMoney(originalTax-(document.credits||[]).reduce((n,c)=>n+c.tax,0));
  const cgst = document.taxMode === "gst" && document.taxTreatment === "intra_state" ? roundMoney(tax / 2) : 0;
  const sgst = document.taxMode === "gst" && document.taxTreatment === "intra_state" ? roundMoney(tax - cgst) : 0;
  const igst = document.taxMode === "gst" && document.taxTreatment === "inter_state" ? tax : 0;
  return { originalSubtotal, originalTotal:roundMoney(originalSubtotal+originalTax), creditTotal, subtotal, tax, cgst, sgst, igst, total: roundMoney(subtotal + tax) };
}

export function paymentsForInvoice(payments: SeikoPaymentRecord[], invoiceId: string) {
  return payments.reduce((sum, payment) => sum + Math.round(paymentAppliedToInvoice(payment, invoiceId)*100), 0)/100;
}

export function invoiceOutstanding(invoice: SeikoCommercialDocument, payments: SeikoPaymentRecord[]) {
  if (invoice.kind !== "invoice" || invoice.status === "cancelled" || invoice.deletedAt) return 0;
  return Math.max(0, roundMoney(documentTotals(invoice).total - paymentsForInvoice(payments, invoice.id)));
}

export function nextDocumentNumber(kind: SeikoDocumentKind, existing: SeikoCommercialDocument[]) {
  const prefix: Record<SeikoDocumentKind, string> = { quotation: "QTN", delivery_challan: "DC", invoice: "INV", payment_receipt: "RCP" };
  const year = new Date().getFullYear();
  const sequence = existing.filter(document => document.kind === kind).length + 1;
  return `${prefix[kind]}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(value) || 0);
}

export function amountInWords(value: number) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const under1000 = (n: number) => `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred ` : ""}${n % 100 < 20 ? ones[n % 100] : `${tens[Math.floor((n % 100) / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`}`.trim();
  const totalPaise = Math.round(Math.abs(value) * 100);
  let rupees = Math.floor(totalPaise / 100); const paise = totalPaise % 100; const parts: string[] = [];
  for (const [size, label] of [[10_000_000, "Crore"], [100_000, "Lakh"], [1_000, "Thousand"]] as const) if (rupees >= size) { parts.push(`${under1000(Math.floor(rupees / size))} ${label}`); rupees %= size; }
  if (rupees) parts.push(under1000(rupees));
  return `Indian Rupees ${parts.join(" ") || "Zero"}${paise ? ` and ${under1000(paise)} Paise` : ""} Only`;
}

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
  if (document.kind === "invoice" && document.dueOnReceipt === false && !document.dueDate) return "Choose a payment due date or due on receipt.";
  if (document.showSigningDate && (!document.signingDate || !validBillingDate(document.signingDate))) return "Choose a valid signing date.";
  if (document.showSignature && !document.signatory?.signature) return "Choose a saved signatory with a signature image.";
  if (document.showStamp && !document.signatory?.stamp) return "Choose a saved signatory with a stamp image.";
  if (document.terms && (typeof document.terms !== "string" || document.terms.length > 8000)) return "Terms must be under 8,000 characters.";
  if (!["gst", "non_gst"].includes(document.taxMode) || !["intra_state", "inter_state"].includes(document.taxTreatment)) return "Choose a valid tax treatment.";
  if (document.taxMode === "gst" && (!document.supplier.address?.trim() || !document.supplier.gstin?.trim())) return "GST documents require the supplier address and GSTIN.";
  if (document.taxMode === "gst" && !document.clientAddress?.trim()) return "GST documents require the recipient billing address.";
  if (document.taxMode === "gst" && document.taxTreatment === "inter_state" && !document.placeOfSupply?.trim()) return "Enter the place of supply for an interstate GST document.";
  if (!Array.isArray(document.lines) || !document.lines.length || document.lines.length > 200) return "Add between 1 and 200 item lines.";
  if (document.lines.some(line => !line.description?.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitRate) || line.unitRate < 0 || !Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 100)) return "Each item needs a description, positive quantity and valid rate/tax.";
  if(["invoice","quotation"].includes(document.kind)&&document.lines.some(line=>line.unitRate===0&&(typeof line.zeroPriceReason!=="string"||!line.zeroPriceReason.trim()||line.zeroPriceReason.length>2000)))return "Every zero-price item needs a recorded approval reason.";
  if (document.lines.some(line=>line.section&&(typeof line.section.label!=="string"||!line.section.label.trim()||line.section.label.length>120||line.section.date!==undefined&&!validBillingDate(line.section.date)))) return "Use a section label up to 120 characters and a valid optional date.";
  if (document.taxMode === "gst" && document.lines.some(line => !line.hsnSac?.trim())) return "Every GST item needs an HSN/SAC code.";
  if (!Number.isFinite(documentTotals(document).total) || documentTotals(document).total > 1_000_000_000) return "Invoice total is too large.";
  return "";
}

export function validBillingDate(value: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function billingToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}

// Order money is applied oldest-invoice-first in integer paise. Original receipts
// remain immutable; allocations are a derived view, never additional payments.
export function paymentAppliedToInvoice(payment: SeikoPaymentRecord, invoiceId: string) {
  return payment.invoiceId === invoiceId ? payment.amount : (payment.allocations || []).filter(item => item.invoiceId === invoiceId).reduce((sum, item) => sum + item.amount, 0);
}
export function allocateOrderPayments(documents: SeikoCommercialDocument[], payments: SeikoPaymentRecord[]) {
  const refunded=new Map<string,number>();
  for(const p of payments)if(p.refundOf&&p.amount<0)refunded.set(p.refundOf,(refunded.get(p.refundOf)||0)+Math.round(-p.amount*100));
  const ordered = [...documents].filter(d => d.kind === "invoice" && d.status !== "cancelled" && !d.deletedAt).sort((a,b) => a.issueDate.localeCompare(b.issueDate) || (a.createdAt || "").localeCompare(b.createdAt || "") || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  const direct=new Map<string,number>(),byOrder=new Map<string,SeikoCommercialDocument[]>(),cursor=new Map<string,number>();
  for(const p of payments)if(p.invoiceId)direct.set(p.invoiceId,(direct.get(p.invoiceId)||0)+Math.round(p.amount*100));
  for(const d of ordered){const group=byOrder.get(d.orderId)||[];group.push(d);byOrder.set(d.orderId,group);}
  const remaining = new Map(ordered.map(d => [d.id, Math.max(0, Math.round(documentTotals(d).total * 100) - (direct.get(d.id)||0))]));
  const allocations = new Map<string, { invoiceId: string; amount: number }[]>();
  for (const payment of [...payments].sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.receiptNumber.localeCompare(b.receiptNumber) || a.id.localeCompare(b.id))) {
    if (payment.refundOf || payment.invoiceId || !payment.orderId) continue;
    let available = Math.max(0,Math.round(payment.amount * 100)-(refunded.get(payment.id)||0)); const applied = [];
    const group=byOrder.get(payment.orderId)||[];
    for (let index=cursor.get(payment.orderId)||0;index<group.length&&available>0;index++) {
      const invoice=group[index];
      const amount = Math.min(available, remaining.get(invoice.id) || 0);
      if (amount > 0) { applied.push({ invoiceId: invoice.id, amount: amount / 100 }); remaining.set(invoice.id, remaining.get(invoice.id)! - amount); available -= amount; }
      cursor.set(payment.orderId,remaining.get(invoice.id)?index:index+1);
    }
    allocations.set(payment.id, applied);
  }
  return payments.map(p => {const next={...p,allocations:allocations.get(p.id)||[]};delete next.refundedAmount;if(refunded.has(p.id))next.refundedAmount=(refunded.get(p.id)||0)/100;return next;});
}
export function unappliedOrderPayment(payment: SeikoPaymentRecord) {
  return payment.invoiceId || payment.refundOf ? 0 : Math.max(0,Math.round(payment.amount*100)-Math.round((payment.refundedAmount||0)*100)-(payment.allocations||[]).reduce((sum,a)=>sum+Math.round(a.amount*100),0))/100;
}
export function refundablePaymentAmount(payment:SeikoPaymentRecord,documents:SeikoCommercialDocument[],payments:SeikoPaymentRecord[]){
  if(payment.refundOf||payment.amount<=0)return 0;
  const allocated=allocateOrderPayments(documents,payments),current=allocated.find(p=>p.id===payment.id);if(!current)return 0;
  const retained=Math.max(0,roundMoney(current.amount-(current.refundedAmount||0)));
  if(!current.invoiceId)return current.orderId?Math.min(retained,unappliedOrderPayment(current)):retained;
  const invoice=documents.find(d=>d.id===current.invoiceId);if(!invoice)return 0;
  const owed=invoice.status==="cancelled"||invoice.deletedAt?0:documentTotals(invoice).total;
  return Math.min(retained,Math.max(0,roundMoney(paymentsForInvoice(allocated,invoice.id)-owed)));
}
/** Fail closed on damaged money records instead of treating missing/invalid values as zero. */
export function billingIntegrityIssues(documents:SeikoCommercialDocument[],payments:SeikoPaymentRecord[]):string[]{
  const issues:string[]=[],money=(n:number)=>Number.isFinite(n)&&Math.abs(n)<=1e9&&roundMoney(n)===n;
  const docsById=new Map(documents.map(d=>[d.id,d])),paymentsById=new Map(payments.map(p=>[p.id,p])),refundTotals=new Map<string,number>();
  for(const p of payments)if(p.refundOf)refundTotals.set(p.refundOf,(refundTotals.get(p.refundOf)||0)+Math.round(-p.amount*100));
  if(new Set(documents.map(d=>d.id)).size!==documents.length||new Set(payments.map(p=>p.id)).size!==payments.length)issues.push("Duplicate financial record identity");
  for(const doc of documents){
    const t=documentTotals(doc);
    if(!money(t.total)||t.total<0||!Array.isArray(doc.lines)||doc.lines.some(l=>!l||!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.unitRate)||l.unitRate<0||!Number.isFinite(l.taxRate)||l.taxRate<0||l.taxRate>100))issues.push("Invalid document amounts: "+doc.id);
    if((doc.credits||[]).some(c=>!money(c.amount)||!money(c.subtotal)||!money(c.tax)||c.amount<0||c.subtotal<0||c.tax<0||roundMoney(c.subtotal+c.tax)!==c.amount))issues.push("Invalid credit amounts: "+doc.id);
    if(doc.pricingSnapshot&&roundMoney(doc.pricingSnapshot.units.reduce((n,u)=>n+u.amount,0))!==t.originalSubtotal)issues.push("Invoice pricing snapshot does not reconcile: "+doc.id);
  }
  for(const p of payments){
    if(!money(p.amount)||p.amount===0||(p.refundOf?p.amount>=0:p.amount<=0))issues.push("Invalid receipt amount: "+p.id);
    const invoice=docsById.get(p.invoiceId);
    if(p.invoiceId&&(!invoice||invoice.kind!=="invoice"||p.orderId&&(invoice.orderId||"")!==p.orderId))issues.push("Receipt invoice link does not reconcile: "+p.id);
    if(p.refundOf){const source=paymentsById.get(p.refundOf);if(!source||source.refundOf||source.amount<=0||source.invoiceId!==p.invoiceId||(source.orderId||"")!==(p.orderId||"")||p.date<source.date)issues.push("Invalid refund source: "+p.id);}
    else if((refundTotals.get(p.id)||0)>Math.round(p.amount*100))issues.push("Refunds exceed the original receipt: "+p.id);
  }
  const allocated=allocateOrderPayments(documents,payments),received=payments.reduce((n,p)=>n+Math.round(p.amount*100),0);
  const applied=allocated.reduce((n,p)=>n+(p.invoiceId?Math.round(p.amount*100):(p.allocations||[]).reduce((sum,a)=>sum+Math.round(a.amount*100),0)),0);
  const remaining=allocated.reduce((n,p)=>n+Math.round(unappliedOrderPayment(p)*100),0);
  if(![received,applied,remaining].every(Number.isSafeInteger))issues.push("Financial totals exceed the safe currency range");
  if(received!==applied+remaining)issues.push("Collected, allocated, refunded and remaining money do not reconcile");
  return issues;
}
export function storedBillingIntegrityIssues(documentRows:{sequence:number;id:string;data:string;cancelled:number;total_paise:number}[],paymentRows:{sequence:number;id:string;data:string;amount_paise:number}[]):string[]{
  const documents=documentRows.map(row=>{const value=JSON.parse(row.data) as SeikoCommercialDocument;return {...value,id:row.id,number:value.number||String(row.sequence),status:row.cancelled?"cancelled" as const:"issued" as const};});
  const payments=paymentRows.map(row=>({...JSON.parse(row.data) as SeikoPaymentRecord,id:row.id,receiptNumber:String(row.sequence)}));
  const issues=billingIntegrityIssues(documents,payments);
  documentRows.forEach((row,i)=>{if(JSON.parse(row.data).id!==row.id||!Number.isSafeInteger(row.total_paise)||Math.round(documentTotals(documents[i]).total*100)!==row.total_paise)issues.push("Stored invoice identity or total does not reconcile: "+row.id);});
  paymentRows.forEach((row,i)=>{if(JSON.parse(row.data).id!==row.id||!Number.isSafeInteger(row.amount_paise)||Math.round(payments[i].amount*100)!==row.amount_paise)issues.push("Stored receipt identity or amount does not reconcile: "+row.id);});
  return issues;
}
export function orderReceiptDocument(payment: SeikoPaymentRecord): SeikoCommercialDocument {
  return { ...payment.appearance, id: "receipt:" + payment.id, kind: "payment_receipt", number: payment.receiptNumber, orderId: payment.orderId, orderNo: payment.orderNo || payment.orderId, clientName: payment.clientName || "Payment", clientPhone: payment.clientPhone || "", issueDate: payment.date, taxMode: "non_gst", taxTreatment: "intra_state", lines: [], notes: "", status: "issued", createdAt: payment.createdAt, updatedAt: payment.createdAt };
}

/** Display-only labels; persisted billing status codes stay unchanged. */
export function billingStatusLabel(value:string){return value.replace(/_/g," ").replace(/\b[a-z]/g,letter=>letter.toUpperCase());}
