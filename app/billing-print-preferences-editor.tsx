"use client";
import type { BillingPrintPreferences } from "./lib/seiko-billing";
const fields = [
  ["contact","Contact Person",true],["address","Address",false],["deliveryAddress","Deliver to",true],
  ["phone","Phone",true],["email","Email",true],["gstin","GSTIN",true],
  ["supplierAddress","Business Address",false],["supplierGstin","Supplier GSTIN",true],
  ["date","Date",true],["dueDate","Payment Due",true],["order","Order",true],
  ["accountName","Account Name",true],["bankName","Bank",true],["accountNumber","Account Number",true],["ifsc","IFSC",true],
  ["upi","UPI ID",true],["signingDate","Signed",true],
] as const;
export function BillingPrintPreferencesEditor({value,onChange}:{value?:BillingPrintPreferences;onChange:(value:BillingPrintPreferences)=>void}) {
  return <details className="billingFull"><summary>Document Detail Labels</summary>
    <p>Choose which field names appear beside the details on invoices, quotations, challans and receipts. Values remain visible. These display settings apply when viewing or printing existing documents too.</p>
    <div className="billingDetailLabels">{fields.map(([key,label,showLabel])=>{
      const current=value?.fieldLabels?.[key]||{label,showLabel};
      const update=(next:typeof current)=>onChange({...value,fieldLabels:{...value?.fieldLabels,[key]:next}});
      return <div key={key}><label className="phase2Check"><input type="checkbox" aria-label={`Show ${label} Label`} checked={current.showLabel} onChange={e=>update({...current,showLabel:e.target.checked})}/>Show {label} Label</label><label>Printed Label<input aria-label={`${label} Printed Label`} maxLength={80} value={current.label} onChange={e=>update({...current,label:e.target.value})}/></label></div>;
    })}</div>
  </details>;
}
