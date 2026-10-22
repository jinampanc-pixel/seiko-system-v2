"use client";
import { useState } from "react";
import { emptyBillingProfile, type BillingProfile } from "./lib/billing-profile";

export type ProfileState = { profile: BillingProfile; version: number; canManage: boolean; isOwner: boolean; canSign?: boolean };
export const newProfileState = (): ProfileState => ({ profile: emptyBillingProfile(), version: 0, canManage: false, isOwner: false });
export async function requestBillingProfile(body: object): Promise<ProfileState> {
  const response=await fetch("/api/erp/billing-profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||"Billing settings unavailable.");return result;
}
export function BillingImageUpload({label,value,onChange}:{label:string;value?:string;onChange:(value:string)=>void}) {
  const [error,setError]=useState("");
  async function upload(file?:File) {
    setError("");if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024){setError("Choose a PNG, JPEG or WebP image up to 5 MB.");return;}
    try {
      let bitmap: ImageBitmap | HTMLImageElement;
      try { bitmap=await createImageBitmap(file); }
      catch {
        // Some JPEG encodings fail ImageBitmap while the browser image decoder supports them.
        const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
        bitmap=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("decode"));img.src=data;});
      }
      const canvas=document.createElement("canvas");
      const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext("2d");if(!context)throw new Error("canvas");context.drawImage(bitmap,0,0,canvas.width,canvas.height);if("close" in bitmap)bitmap.close();
      // PNG preserves transparency for signatures and avoids JPEG artefacts on QR modules.
      const image=canvas.toDataURL("image/png");if(image.length>220_000){setError("This image is too detailed. Crop the asset and upload a simpler image under 160 KB.");return;}
      onChange(image);
    }catch{setError("This file could not be decoded. Open it and save a fresh PNG or JPEG, then upload it again.");}
  }
  return <div className="billingAsset"><label>{label}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>{value&&<><img src={value} alt={`${label} preview`}/><button type="button" className="secondary" onClick={()=>onChange("")}>Remove {label.toLowerCase()}</button></>}{error&&<p role="alert">{error}</p>}</div>;
}
function Input({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;disabled?:boolean}){return <label>{label}<input value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/></label>;}
export function BillingProfileEditor({state,onClose,onSaved}:{state:ProfileState;onClose:()=>void;onSaved:(s:ProfileState)=>void}) {
  const [draft,setDraft]=useState(()=>structuredClone(state.profile));const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [managerText,setManagerText]=useState(state.profile.managerEmails.join('\n'));
  const [signerText,setSignerText]=useState((state.profile.signatoryEmails||[]).join('\n'));
  const supplier=(key:string,value:string)=>setDraft({...draft,supplier:{...draft.supplier,[key]:value}});
  async function save(){setBusy(true);setError("");try{onSaved(await requestBillingProfile({operation:"save",profile:{...draft,managerEmails:managerText.split(/[\n,;]/).map(v=>v.trim().toLowerCase()).filter(Boolean),signatoryEmails:signerText.split(/[\n,;]/).map(v=>v.trim().toLowerCase()).filter(Boolean)},version:state.version}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="phase2Scrim billingFormScrim"><form className="phase2Editor" role="dialog" aria-modal="true" aria-label="Billing settings and assets" onSubmit={e=>{e.preventDefault();void save();}}><header><h2>Billing settings & assets</h2><button type="button" onClick={onClose} disabled={busy}>Close</button></header><fieldset disabled={busy||!state.canManage} className="phase2EditorBody billingFormBody">
    <p className="billingFull">Changes apply to new documents. Issued documents retain their saved details until explicitly amended. Upload transparent signature and stamp images to blend with the cream document background.</p>
    <Input label="Business name" value={draft.supplier.name} onChange={v=>supplier("name",v)}/><Input label="Business phone" value={draft.supplier.phone} onChange={v=>supplier("phone",v)}/><Input label="Business address" value={draft.supplier.address} onChange={v=>supplier("address",v)}/><Input label="Supplier GSTIN (owner only)" value={draft.supplier.gstin} disabled={!state.isOwner} onChange={v=>supplier("gstin",v)}/>
    <BillingImageUpload label="Business logo" value={draft.supplier.logo} onChange={v=>supplier("logo",v)}/>
    <h3 className="billingFull">For bank transfer</h3>{([['Account name','accountName'],['Bank name','bankName'],['Account number','accountNumber'],['IFSC','ifsc']] as const).map(([label,key])=><Input key={key} label={label} value={draft.supplier[key]||""} onChange={v=>supplier(key,v)}/>)}
    <h3 className="billingFull">For UPI payment</h3><Input label="UPI ID" value={draft.supplier.upi||""} onChange={v=>supplier("upi",v)}/><BillingImageUpload label="Payment QR image" value={draft.supplier.paymentQr} onChange={v=>supplier("paymentQr",v)}/>
    <h3 className="billingFull">Saved signatories</h3>{draft.signatories.map((s,i)=><fieldset className="billingFull billingSignatory" key={s.id}><legend>{s.name||`Signatory ${i+1}`}</legend><Input label="Signatory name" value={s.name} onChange={v=>setDraft({...draft,signatories:draft.signatories.map(x=>x.id===s.id?{...x,name:v}:x)})}/><Input label="Designation" value={s.designation} onChange={v=>setDraft({...draft,signatories:draft.signatories.map(x=>x.id===s.id?{...x,designation:v}:x)})}/>{(['signature','stamp'] as const).map(key=><BillingImageUpload key={key} label={key==='signature'?'Signature image':'Stamp image'} value={s[key]} onChange={v=>setDraft({...draft,signatories:draft.signatories.map(x=>x.id===s.id?{...x,[key]:v}:x)})}/>)}<button type="button" className="secondary" onClick={()=>setDraft({...draft,signatories:draft.signatories.filter(x=>x.id!==s.id)})}>Remove signatory</button></fieldset>)}<button type="button" className="secondary" disabled={draft.signatories.length>=10} onClick={()=>setDraft({...draft,signatories:[...draft.signatories,{id:crypto.randomUUID(),name:"",designation:"",signature:"",stamp:""}]})}>+ Signatory</button>
    <label>Default payment period (days; 0 = due on receipt)<input type="number" min="0" max="365" value={draft.dueDays} onChange={e=>setDraft({...draft,dueDays:Number(e.target.value)})}/></label>
    <label className="billingFull">Invoice terms<textarea rows={5} value={draft.invoiceTerms} onChange={e=>setDraft({...draft,invoiceTerms:e.target.value})}/></label><label className="billingFull">Quotation terms<textarea rows={5} value={draft.quotationTerms} onChange={e=>setDraft({...draft,quotationTerms:e.target.value})}/></label>
    {state.isOwner&&<label className="billingFull">Billing-settings managers (email addresses, one per line)<textarea value={managerText} onChange={e=>setManagerText(e.target.value)}/><small>Existing SEIKO members with financial-view access only. Managers may maintain payment assets and signatories; only the owner can change supplier GSTIN or this access list.</small></label>}
    {state.isOwner&&<label className="billingFull">Additional users allowed to use saved signatures and stamps<textarea value={signerText} onChange={e=>setSignerText(e.target.value)}/><small>One existing member email per line. Owner and billing-settings managers already have access.</small></label>}
  </fieldset>{error&&<p role="alert" className="billingError">{error}</p>}<footer><button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>{state.canManage&&<button type="submit" className="primary" disabled={busy}>{busy?'Saving…':'Save settings'}</button>}</footer></form></div>;
}
