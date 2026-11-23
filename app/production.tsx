"use client";
import { TrashIcon } from "./ui-icons";
import { useState } from "react";

type Operation={id:string;name:string;payable:boolean;startRequired:boolean;rate:string;unit:"garment"|"piece"|"hour"};
type Policy={cutPlans:boolean;bundles:boolean;garmentCodes:boolean;workerStart:boolean;payroll:boolean};
const defaults:Policy={cutPlans:true,bundles:true,garmentCodes:true,workerStart:false,payroll:true};
const defaultOperations:Operation[]=[
 {id:"upper",name:"Join upper",payable:true,startRequired:false,rate:"",unit:"garment"},
 {id:"lower",name:"Join lower",payable:true,startRequired:false,rate:"",unit:"garment"},
 {id:"finish",name:"Border / finishing",payable:true,startRequired:false,rate:"",unit:"garment"},
];
const storageKey=(businessId:string)=>`jinam:${businessId}:production-policy-v1`;
function load<T>(key:string,fallback:T):T{if(typeof window==="undefined")return fallback;try{return JSON.parse(localStorage.getItem(key)||"null")||fallback}catch{return fallback}}

export function ProductionSetup({businessId,canManage}:{businessId:string;canManage:boolean}){
 const [initial]=useState(()=>load<{policy:Policy;operations:Operation[]}>(`${storageKey(businessId)}:setup`,{policy:load(storageKey(businessId),defaults),operations:load(`${storageKey(businessId)}:operations`,defaultOperations)}));
 const [policy,setPolicy]=useState<Policy>(initial.policy);
 const [operations,setOperations]=useState<Operation[]>(initial.operations);
 const [savedSnapshot,setSavedSnapshot]=useState(()=>JSON.stringify(initial));
 const [error,setError]=useState("");
 const dirty=JSON.stringify({policy,operations})!==savedSnapshot;
 const [saved,setSaved]=useState(false);
 const save=()=>{
  setError(""); setSaved(false);
  if(operations.some(operation=>!operation.name.trim())){setError("Name every operation before saving.");return;}
  if(operations.some(operation=>operation.rate!==""&&(!Number.isFinite(Number(operation.rate))||Number(operation.rate)<0))){setError("Rates must be zero or greater; leave a rate blank if it is not set.");return;}
  const snapshot=JSON.stringify({policy,operations});
  try{localStorage.setItem(`${storageKey(businessId)}:setup`,snapshot);setSavedSnapshot(snapshot);setSaved(true);}
  catch{setError("This browser could not save the setup. Your changes remain open; free browser storage and retry.");}
 };
 const update=(id:string,change:Partial<Operation>)=>setOperations(all=>all.map(item=>item.id===id?{...item,...change}:item));
 return <div className="page productionPage">
  <section className="productionIntro panel"><div><p className="eyebrow">PRODUCTION SETUP</p><h2>Production Setup</h2><p><b>Use only the steps you need.</b> Cut plans, bundles, garment codes and payroll can be used together or independently. Turning one off never deletes existing history.</p></div>{canManage&&<button className="primary" onClick={save}>{dirty?"Save Setup":saved?"Saved":"Save Setup"}</button>}</section>
  <p className="productionScope">Business planning defaults for {businessId.toUpperCase()} in this browser. These preferences do not currently change order processing or calculate payroll automatically.</p>
  {error&&<p className="productionSaveError" role="alert">{error}</p>}
  <p className="productionSaveStatus" role="status">{dirty?"Unsaved changes":saved?"Setup saved in this browser.":"No unsaved changes"}</p>
  <section className="identityFlow panel"><div><b>Optional Production Levels</b><span>Order</span><i>→</i><span className={policy.cutPlans?"on":""}>Cut Plan · {policy.cutPlans?"On":"Off"}</span><i>→</i><span className={policy.bundles?"on":""}>Bundle · {policy.bundles?"On":"Off"}</span><i>→</i><span className={policy.garmentCodes?"on":""}>Garment · {policy.garmentCodes?"On":"Off"}</span><i>→</i><span>Package</span></div><p>A record may enter at any level. The system does not require every earlier level.</p></section>
  <div className="productionColumns"><section className="panel"><div className="sectionTitle"><div><h3>Workflow Options</h3><p>Recommended defaults can be changed later.</p></div></div><div className="policyList"><PolicyToggle label="Use Cut Plans" help="Plan fabric, colour, sizes, quantities and plies." checked={policy.cutPlans} disabled={!canManage} onChange={value=>setPolicy({...policy,cutPlans:value})}/><PolicyToggle label="Use Bundle Tickets" help="Track grouped cut components before individual garments." checked={policy.bundles} disabled={!canManage} onChange={value=>setPolicy({...policy,bundles:value})}/><PolicyToggle label="Create Garment Codes" help="One permanent identity can collect every later event." checked={policy.garmentCodes} disabled={!canManage} onChange={value=>setPolicy({...policy,garmentCodes:value})}/><PolicyToggle label="Allow Optional Start Scans" help="Operations normally need only a Complete scan." checked={policy.workerStart} disabled={!canManage} onChange={value=>setPolicy({...policy,workerStart:value})}/><PolicyToggle label="Calculate Payroll Credits" help="Only payable completed operations create credit." checked={policy.payroll} disabled={!canManage} onChange={value=>setPolicy({...policy,payroll:value})}/></div></section>
  <section className="panel"><div className="sectionTitle"><div><h3>Operations and Rates</h3><p>The same garment code may record work, trace progress or both.</p></div>{canManage&&<button className="secondary" onClick={()=>setOperations(all=>[...all,{id:crypto.randomUUID(),name:"",payable:false,startRequired:false,rate:"",unit:"garment"}])}>+ Operation</button>}</div><p id="productionRateHelp" className="productionRateHelp">{!canManage?"You have view-only access to this setup.":!policy.payroll?"Enable Calculate payroll credits to edit Pay, rates and units.":"Select Pay for an operation to enable its rate. Blank means not set; 0 means a zero rate. Hourly credits need recorded hours and are not calculated automatically."}</p><div className="operationRateHead"><span>Operation</span><span>Pay</span><span>Rate ₹</span><span>Per</span><span></span></div>{operations.map(operation=><div className="operationRate" key={operation.id}><input aria-label="Operation Name" value={operation.name} disabled={!canManage} onChange={e=>update(operation.id,{name:e.target.value})}/><label title="Credit Payroll When Completed"><input aria-label={`${operation.name} Payable`} aria-describedby="productionRateHelp" type="checkbox" checked={operation.payable} disabled={!canManage||!policy.payroll} onChange={e=>update(operation.id,{payable:e.target.checked})}/><span>Pay</span></label><input aria-label={`${operation.name} Rate`} type="number" min="0" placeholder="Not Set" step="0.01" aria-describedby="productionRateHelp" value={operation.rate} disabled={!canManage||!operation.payable||!policy.payroll} onChange={e=>update(operation.id,{rate:e.target.value})}/><select aria-label={`${operation.name} Rate Unit`} value={operation.unit} disabled={!canManage||!operation.payable||!policy.payroll} onChange={e=>update(operation.id,{unit:e.target.value as Operation["unit"]})}><option value="garment">Per Garment</option><option value="piece">Per Piece</option><option value="hour">Per Hour</option></select>{canManage&&<button className="iconRemove" aria-label={`Remove ${operation.name||"operation"}`} onClick={()=>setOperations(all=>all.filter(item=>item.id!==operation.id))}><TrashIcon/></button>}</div>)}</section></div>
  <section className="scanMeaning panel"><div><p className="eyebrow">ONE CODE, DIFFERENT ACTIONS</p><h3>The Selected Scan Mode Decides What Happens</h3></div><div><b>View History</b><span>No Production or Payroll Change</span></div><div><b>Complete Operation</b><span>Adds Worker and Stage Event; Credits Pay Only When Enabled</span></div><div><b>Move / Inspect / Pack</b><span>Adds the Relevant Trace Event Without Payroll</span></div></section>
 </div>
}
function PolicyToggle({label,help,checked,disabled,onChange}:{label:string;help:string;checked:boolean;disabled:boolean;onChange:(value:boolean)=>void}){return <label className="policyToggle"><input aria-label={label} type="checkbox" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span><b>{label}</b><small>{help}</small></span></label>}
