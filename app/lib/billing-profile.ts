import type { SeikoCommercialDocument } from "./seiko-billing";

export type BillingProfile = {
  supplier: NonNullable<SeikoCommercialDocument["supplier"]>;
  signatories: NonNullable<SeikoCommercialDocument["signatory"]>[];
  managerEmails: string[];
  signatoryEmails?: string[];
  invoiceTerms: string;
  quotationTerms: string;
  dueDays: number;
};
export const emptyBillingProfile = (): BillingProfile => ({
  supplier: { name: "SEIKO Tailors", address: "", phone: "", gstin: "", bank: "", accountName: "", bankName: "", accountNumber: "", ifsc: "", upi: "", paymentQr: "", showBank: false, showUpi: false, showQr: false },
  signatories: [], managerEmails: [], signatoryEmails: [], dueDays: 0,
  invoiceTerms: "Payment is due by the date stated on this invoice. Advances and part payments are acknowledged by separate receipts and adjusted against this invoice.\nRequest alterations within 10 calendar days of delivery; garments must be unworn and unwashed except for fitting. Corrections to our workmanship or departures from approved measurements are at no charge; other changes are quoted separately.\nIndian law applies. Competent courts at Vyara, Tapi, Gujarat may hear disputes where legally competent. Statutory consumer remedies and jurisdiction remain unaffected.",
  quotationTerms: "",
});
export function validBillingImage(value?: string) {
  return !value || /^\/api\/erp\/billing-profile\?asset=[a-f0-9-]{36}$/.test(value) || (value.length <= 220_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}
export function validateBillingProfile(value: BillingProfile): string {
  if (!value || !value.supplier || typeof value.supplier.name !== "string" || !value.supplier.name.trim()) return "Enter the business name.";
  if (!Array.isArray(value.signatories) || value.signatories.length > 10 || !Array.isArray(value.managerEmails) || value.managerEmails.length > 30) return "Too many signatories or managers.";
  if (!Number.isInteger(value.dueDays) || value.dueDays < 0 || value.dueDays > 365) return "Payment period must be 0 to 365 days.";
  if ([value.invoiceTerms, value.quotationTerms].some(v => typeof v !== "string" || v.length > 8000)) return "Terms must be under 8,000 characters.";
  if (value.managerEmails.some(v => typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) return "Enter valid manager email addresses.";
  if (value.signatoryEmails && (!Array.isArray(value.signatoryEmails) || value.signatoryEmails.length > 30 || value.signatoryEmails.some(v => typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))) return "Enter valid signatory-user email addresses.";
  if (Object.values(value.supplier).some(v => typeof v !== "string" && typeof v !== "boolean")) return "Invalid business details.";
  if (Object.entries(value.supplier).some(([k,v]) => typeof v === "string" && !["paymentQr","logo"].includes(k) && v.length > 4000)) return "Business details are too long.";
  if (!validBillingImage(value.supplier.logo)) return "Upload a valid business logo.";
  if (!validBillingImage(value.supplier.paymentQr)) return "Upload a valid payment QR image.";
  if (new Set(value.signatories.map(s => s.id)).size !== value.signatories.length) return "Signatory IDs must be unique.";
  for (const s of value.signatories) {
    if (!s || !/^[a-zA-Z0-9-]{8,80}$/.test(s.id) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 150 || typeof s.designation !== "string" || s.designation.length > 150 || !validBillingImage(s.signature) || !validBillingImage(s.stamp)) return "Each signatory needs a name and valid signature/stamp images.";
  }
  return "";
}
// Display flags may vary per document; account/GST/signature identities may not be forged by a billing clerk.
export function profileSnapshotAllowed(doc: SeikoCommercialDocument, profile: BillingProfile | null, original?: SeikoCommercialDocument) {
  const identity = (s: SeikoCommercialDocument["supplier"]) => JSON.stringify(Object.fromEntries(Object.entries(s || {}).filter(([k]) => !["showBank","showUpi","showQr"].includes(k)).sort(([a],[b]) => a.localeCompare(b))));
  const allowedSupplier = identity(doc.supplier) === identity(original?.supplier) || identity(doc.supplier) === identity(profile?.supplier);
  const sign = doc.signatory;
  const allowedSign = !sign || JSON.stringify(sign) === JSON.stringify(original?.signatory) || profile?.signatories.some(s => JSON.stringify(s) === JSON.stringify(sign));
  return Boolean(allowedSupplier && allowedSign);
}
