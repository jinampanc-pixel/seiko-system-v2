"use client";
import type { BillingPrintPreferences } from "./lib/seiko-billing";
const fields = [
  ["contact","Contact person",true],["address","Address",false],["deliveryAddress","Deliver to",true],
  ["phone","Phone",true],["email","Email",true],["gstin","GSTIN",true],
  ["supplierAddress","Business address",false],["supplierGstin","Supplier GSTIN",true],
  ["date","Date",true],["dueDate","Payment due",true],["order","Order",true],
  ["accountName","Account name",true],["bankName","Bank",true],["accountNumber","Account number",true],["ifsc","IFSC",true],
  ["upi","UPI ID",true],["signingDate","Signed",true],
] as const;
export function BillingPrintPreferencesEditor({value,onChange}:{value?:BillingPrintPreferences;onChange:(value:BillingPrintPreferences)=>void}) {
  return <details className="billingFull"><summary>Document detail labels</summary>
    <p>Choose which field names appear beside the details on invoices, quotations, challans and receipts. Values remain visible. These display settings apply when viewing or printing existing documents too.</p>
    <div className="billingDetailLabels">{fields.map(([key,label,showLabel])=>{
      const current=value?.fieldLabels?.[key]||{label,showLabel};
      const update=(next:typeof current)=>onChange({...value,fieldLabels:{...value?.fieldLabels,[key]:next}});
      return <div key={key}><label className="phase2Check"><input type="checkbox" aria-label={`Show ${label} label`} checked={current.showLabel} onChange={e=>update({...current,showLabel:e.target.checked})}/>Show {label} label</label><label>Printed label<input aria-label={`${label} printed label`} maxLength={80} value={current.label} onChange={e=>update({...current,label:e.target.value})}/></label></div>;
    })}</div>
  </details>;
}
