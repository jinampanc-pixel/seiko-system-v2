"use client";
import { prepareBillingImage } from "./lib/browser-image";
import { useState } from "react";
import { BillingPrintPreferencesEditor } from "./billing-print-preferences-editor";
import { SignatoryLayoutEditor } from "./signatory-layout-editor";
import { emptyBillingProfile, type BillingProfile } from "./lib/billing-profile";

export type ProfileState = { profile: BillingProfile; version: number; canManage: boolean; isOwner: boolean; canSign?: boolean };
export const newProfileState = (): ProfileState => ({ profile: emptyBillingProfile(), version: 0, canManage: false, isOwner: false });
export async function requestBillingProfile(body: object): Promise<ProfileState> {
  const response=await fetch("/api/erp/billing-profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||"Billing settings unavailable.");if("operation" in body&&body.operation==="save")window.dispatchEvent(new Event("seiko:billing-profile-updated"));return result;
}
export function BillingImageUpload({label,value,onChange,onBusyChange}:{label:string;value?:string;onChange:(value:string)=>void;onBusyChange?:(busy:boolean)=>void}) {
  const [error,setError]=useState("");const [uploading,setUploading]=useState(false);
  async function upload(file?:File) {
    setError("");if(!file)return;setUploading(true);onBusyChange?.(true);
    try {
      const image=await prepareBillingImage(file);
      const response=await fetch('/api/erp/billing-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'upload',image})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||'The asset could not be uploaded. Retry when connected.');
      onChange(result.url);
    }catch(cause){setError(cause instanceof Error?cause.message:'The asset could not be uploaded.');}
    finally{setUploading(false);onBusyChange?.(false);}
  }
  return <div className="billingAsset"><label>{label}<input disabled={uploading} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>{uploading&&<p role="status">Preparing and uploading image…</p>}{value&&<><img src={value} alt={`${label} preview`}/><button type="button" disabled={uploading} className="secondary" onClick={()=>onChange("")}>Remove {label.toLowerCase()}</button></>}{error&&<p role="alert">{error}</p>}</div>;
}

function Input({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;disabled?:boolean}){return <label>{label}<input value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/></label>;}
export function BillingProfileEditor({state,onClose,onSaved}:{state:ProfileState;onClose:()=>void;onSaved:(s:ProfileState)=>void}) {
  const [draft,setDraft]=useState(()=>structuredClone(state.profile));const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [assetUploads,setAssetUploads]=useState(0);
  const assetBusy=(active:boolean)=>setAssetUploads(count=>Math.max(0,count+(active?1:-1)));
  const [managerText,setManagerText]=useState(state.profile.managerEmails.join('\n'));
  const [signerText,setSignerText]=useState((state.profile.signatoryEmails||[]).join('\n'));
  const supplier=(key:string,value:string)=>setDraft(current=>({...current,supplier:{...current.supplier,[key]:value,...(key==="paymentQr"?{showQr:Boolean(value)}:{})}}));
  async function save(){if(assetUploads)return;setBusy(true);setError("");try{onSaved(await requestBillingProfile({operation:"save",profile:{...draft,managerEmails:managerText.split(/[\n,;]/).map(v=>v.trim().toLowerCase()).filter(Boolean),signatoryEmails:signerText.split(/[\n,;]/).map(v=>v.trim().toLowerCase()).filter(Boolean)},version:state.version}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="phase2Scrim billingFormScrim"><form className="phase2Editor" role="dialog" aria-modal="true" aria-label="Billing settings and assets" onSubmit={e=>{e.preventDefault();void save();}}><header><h2>Billing settings & assets</h2><button type="button" onClick={onClose} disabled={busy}>Close</button></header><fieldset disabled={busy||assetUploads>0||!state.canManage} className="phase2EditorBody billingFormBody">
    <p className="billingFull">Changes apply to new documents. Issued documents retain their saved details until explicitly amended. Upload transparent signature and stamp images to blend with the cream document background.</p>
    <Input label="Business name" value={draft.supplier.name} onChange={v=>supplier("name",v)}/><Input label="Business phone" value={draft.supplier.phone} onChange={v=>supplier("phone",v)}/><Input label="Business address" value={draft.supplier.address} onChange={v=>supplier("address",v)}/><Input label="Supplier GSTIN (owner only)" value={draft.supplier.gstin} disabled={!state.isOwner} onChange={v=>supplier("gstin",v)}/>
    <BillingImageUpload onBusyChange={assetBusy} label="Business logo" value={draft.supplier.logo} onChange={v=>supplier("logo",v)}/>
    <h3 className="billingFull">For bank transfer</h3>{([['Account name','accountName'],['Bank name','bankName'],['Account number','accountNumber'],['IFSC','ifsc']] as const).map(([label,key])=><Input key={key} label={label} value={draft.supplier[key]||""} onChange={v=>supplier(key,v)}/>)}
    <h3 className="billingFull">For UPI payment</h3><Input label="UPI ID" value={draft.supplier.upi||""} onChange={v=>supplier("upi",v)}/><BillingImageUpload onBusyChange={assetBusy} label="Payment QR image" value={draft.supplier.paymentQr} onChange={v=>supplier("paymentQr",v)}/>
    <h3 className="billingFull">Saved signatories</h3>{draft.signatories.map((s,i)=><fieldset className="billingFull billingSignatory" key={s.id}><legend>{s.name||`Signatory ${i+1}`}</legend><Input label="Signatory name" value={s.name} onChange={v=>setDraft({...draft,signatories:draft.signatories.map(x=>x.id===s.id?{...x,name:v}:x)})}/><Input label="Designation" value={s.designation} onChange={v=>setDraft({...draft,signatories:draft.signatories.map(x=>x.id===s.id?{...x,designation:v}:x)})}/>{(['signature','stamp'] as const).map(key=><BillingImageUpload key={key} onBusyChange={assetBusy} label={key==='signature'?'Signature image':'Stamp image'} value={s[key]} onChange={v=>setDraft(current=>({...current,signatories:current.signatories.map(x=>x.id===s.id?{...x,[key]:v}:x)}))}/>)}<SignatoryLayoutEditor signatory={s} onChange={layout=>setDraft(current=>({...current,signatories:current.signatories.map(x=>x.id===s.id?{...x,layout}:x)}))}/><button type="button" className="secondary" onClick={()=>setDraft({...draft,signatories:draft.signatories.filter(x=>x.id!==s.id)})}>Remove signatory</button></fieldset>)}<button type="button" className="secondary" disabled={draft.signatories.length>=10} onClick={()=>setDraft({...draft,signatories:[...draft.signatories,{id:crypto.randomUUID(),name:"",designation:"",signature:"",stamp:""}]})}>+ Signatory</button>
    <BillingPrintPreferencesEditor value={draft.printPreferences} onChange={printPreferences=>setDraft(current=>({...current,printPreferences}))}/><label>Default payment period (days; 0 = due on receipt)<input type="number" min="0" max="365" value={draft.dueDays} onChange={e=>setDraft({...draft,dueDays:Number(e.target.value)})}/></label>
    <label className="billingFull">Invoice terms<textarea rows={5} value={draft.invoiceTerms} onChange={e=>setDraft({...draft,invoiceTerms:e.target.value})}/></label><label className="billingFull">Quotation terms<textarea rows={5} value={draft.quotationTerms} onChange={e=>setDraft({...draft,quotationTerms:e.target.value})}/></label>
    {state.isOwner&&<label className="billingFull">Billing-settings managers (email addresses, one per line)<textarea value={managerText} onChange={e=>setManagerText(e.target.value)}/><small>Existing SEIKO members with financial-view access only. Managers may maintain payment assets and signatories; only the owner can change supplier GSTIN or this access list.</small></label>}
    {state.isOwner&&<label className="billingFull">Additional users allowed to use saved signatures and stamps<textarea value={signerText} onChange={e=>setSignerText(e.target.value)}/><small>One existing member email per line. Owner and billing-settings managers already have access.</small></label>}
  </fieldset>{error&&<p role="alert" className="billingError">{error}</p>}<footer><button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>{state.canManage&&<button type="submit" className="primary" disabled={busy||assetUploads>0}>{assetUploads?'Uploading…':busy?'Saving…':'Save settings'}</button>}</footer></form></div>;
}
