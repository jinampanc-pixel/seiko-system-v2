"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionMenu } from './action-menu';
import { DocumentViewer } from './document-viewer';
import { PendingDocuments } from './pending-documents';
import { SavedOutputRecordDetails, useSavedOutputRecords } from './saved-output-record';
import { retainPendingDocument, syncPendingDocuments, pendingDocuments, retryPendingDocument } from './lib/document-outbox';
import { productionDocumentHtml, productionHandoffContent } from './lib/production-document';
import { productionDemand, productionRemaining, type ProductionHandoff, type ProductionLedger, type ProductionOrder } from './lib/production-handoffs';
import { uiStatusLabel } from './lib/ui-copy';

type Choice={orderId:string;orderNo:string;client:string;products:string};
type Summary={id:string;number:string;name:string;status:string;purpose:string;archivedAt?:string;deletedAt?:string};
type Shared={ok:boolean;message?:string;code?:string;version:number;orders:ProductionOrder[];ledger:ProductionLedger;choices?:Choice[];total?:number;productChoices?:{name:string;orders:number}[];handoffs?:Summary[];handoffTotal?:number};
const initial:Shared={ok:true,version:0,orders:[],ledger:{handoffs:[]}};
async function requestProduction(businessId:string,body:Record<string,unknown>):Promise<Shared>{
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetch('/api/erp/production',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({businessId,...body}),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(90000)});
  if(response.status===401||response.type==='opaqueredirect')throw Error('Sign in in another tab, then retry here.');
  let result:Shared;try{result=await response.json();}catch{throw Error('Shared storage did not confirm this action.');}
  if(!result.ok&&result.code==='SHEET_BUSY'&&body.operation==='list'&&attempt<3){await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));continue;}
  if(!response.ok||!result.ok)throw Error(result.message||'Production storage is unavailable.');
  return result;
 }
 throw Error('The order is still syncing. Try again shortly.');
}

export function Production({businessId,canManage,initialOrderId,onHome}:{backLabel?:string;businessId:string;canManage:boolean;initialOrderId?:string;onHome:()=>void}){
 const [shared,setShared]=useState(initial),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [creating,setCreating]=useState(Boolean(initialOrderId)),[selected,setSelected]=useState<string[]>(initialOrderId?[initialOrderId]:[]);
 const [showOrders,setShowOrders]=useState(!initialOrderId);
 const [query,setQuery]=useState(''),[page,setPage]=useState(1),[excluded,setExcluded]=useState<string[]>([]);
 const [createBy,setCreateBy]=useState('orders'),[productFilter,setProductFilter]=useState('');
 const [openId,setOpenId]=useState(''),[localHandoff,setLocalHandoff]=useState<ProductionHandoff|null>(null);
 const [documentFromCreation,setDocumentFromCreation]=useState(false);
 const [handoffSearch,setHandoffSearch]=useState(''),[handoffStatus,setHandoffStatus]=useState('Active'),[handoffPage,setHandoffPage]=useState(1);
 const [revision,setRevision]=useState(0),[pendingProblem,setPendingProblem]=useState(''),[submitting,setSubmitting]=useState(false);
 const epoch=useRef(0),submission=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const active=localHandoff||shared.ledger.handoffs.find(item=>item.id===openId)||null;
 const viewing=Boolean(openId||localHandoff);
 const history=useSavedOutputRecords(businessId,'production',(shared.handoffs||[]).map(item=>item.id));
 const selectionKey=selected.join('|');
 useEffect(()=>{
  const current=++epoch.current;setBusy(true);setError('');
  const timer=setTimeout(()=>{
   const body=openId?{operation:'get',id:openId}:{operation:'list',includeSources:creating,orderIds:creating?selected:[],search:query,page,product:createBy==='product'?productFilter:'',handoffSearch,handoffStatus,handoffPage};
   void requestProduction(businessId,body).then(result=>{if(current===epoch.current&&alive.current){setShared(result);if(openId)setLocalHandoff(null);}}).catch(cause=>{if(current===epoch.current&&alive.current)setError((cause as Error).message);}).finally(()=>{if(current===epoch.current&&alive.current)setBusy(false);});
  },openId?0:200);
  return()=>{clearTimeout(timer);if(epoch.current===current)epoch.current++;};
 // Selection values identify a read; a new read invalidates every older response.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[businessId,creating,selectionKey,query,page,createBy,productFilter,openId,handoffSearch,handoffStatus,handoffPage,revision]);
 useEffect(()=>{
  const saved=(event:Event)=>{
   const detail=(event as CustomEvent).detail;if(detail?.kind!=='production'||detail.businessId!==businessId)return;
   if(detail.id===localHandoff?.id){setOpenId(detail.id);setCreating(false);}else if(!viewing)setRevision(value=>value+1);
  };
  window.addEventListener('jinam:document-saved',saved);return()=>window.removeEventListener('jinam:document-saved',saved);
 },[businessId,localHandoff?.id,viewing]);
 useEffect(()=>{
  const update=()=>setPendingProblem(pendingDocuments().find(row=>row.businessId===businessId&&row.kind==='production'&&row.id===active?.id)?.problem||'');
  update();window.addEventListener('jinam:pending-documents',update);return()=>window.removeEventListener('jinam:pending-documents',update);
 },[businessId,active?.id]);
 const demand=useMemo(()=>productionDemand(shared.orders),[shared.orders]);
 const products=useMemo(()=>{
  const groups=new Map<string,typeof demand>();
  for(const row of demand){if(!selected.includes(row.orderId)||createBy==='product'&&row.product.toLocaleLowerCase()!==productFilter.toLocaleLowerCase())continue;groups.set(row.product,[...groups.get(row.product)||[],row]);}
  return [...groups].map(([name,rows])=>({name,rows,quantity:rows.reduce((sum,row)=>sum+productionRemaining(shared.ledger,row),0),unresolved:rows.filter(row=>row.unresolved&&productionRemaining(shared.ledger,row)>0).length}));
 },[demand,selected,createBy,productFilter,shared.ledger]);
 const included=products.filter(product=>!excluded.includes(product.name)&&product.quantity>0);
 const canCreate=!busy&&!submitting&&canManage&&included.length>0&&included.every(product=>!product.unresolved);
 const html=useMemo(()=>active?productionDocumentHtml(productionHandoffContent(active,businessId)):'',[active,businessId]);
 const submit=async(handoff:ProductionHandoff)=>{
  if(submission.current)return;submission.current=true;setSubmitting(true);setError('');
  try{
   const release=handoff.purpose!=='reference';
   const document=productionDocumentHtml(productionHandoffContent(handoff,businessId));
   retainPendingDocument({id:handoff.id,businessId,kind:'production',title:handoff.name,html:document,body:{businessId,operation:'save',expectedVersion:shared.version,orderIds:[],release,handoff}});
   // The durable local copy opens immediately; network saving never gates printing.
   setLocalHandoff(handoff);setOpenId('');void syncPendingDocuments();
  }catch(cause){setError((cause as Error).message);}finally{submission.current=false;setSubmitting(false);}
 };
 const create=()=>{
  if(!canCreate)return;
  setDocumentFromCreation(true);
  const allocations=included.flatMap(product=>product.rows.filter(row=>!row.unresolved&&productionRemaining(shared.ledger,row)>0).map(row=>({...row,quantity:productionRemaining(shared.ledger,row),lay:'',stack:''})));
  const clients=[...new Set(allocations.map(row=>row.client))].join(' + ');
  void submit({id:crypto.randomUUID(),number:'New draft',name:(clients||'Production Handoff').slice(0,120),status:'Draft',purpose:'normal',reason:'',allocations,lays:[],events:[],history:[],createdAt:new Date().toISOString()});
 };
 const fileAction=async(item:Summary,operation:string)=>{
  if(operation==='delete'&&!window.confirm('Move this handoff to Trash? Its production quantities and history remain preserved.'))return;
  setBusy(true);setError('');try{await requestProduction(businessId,{operation,id:item.id,expectedVersion:shared.version});setRevision(value=>value+1);}catch(cause){setError((cause as Error).message);setBusy(false);}
 };
 const changeSelection=(id:string,checked:boolean)=>{setBusy(true);setSelected(current=>checked?[...new Set([...current,id])]:current.filter(value=>value!==id));};
 const back=()=>{if(viewing){setOpenId('');setLocalHandoff(null);setCreating(documentFromCreation);setError('');return;}if(creating){if(initialOrderId){onHome();return;}setCreating(false);setSelected([]);setError('');return;}onHome();};
 return <section className={'page productionWorkspace productionSimpleFlow'+(active?' hasOpenDocument':'')}>
  <button type="button" className="secondary appBackControl productionNoPrint" onClick={back}>← Back</button>
  <header className="productionWorkspaceHead"><h1>{active?active.number==='New draft'?'Production Handoff':active.number:creating?'Create Handoff':'Production Handoffs'}</h1>{!viewing&&<button type="button" className="secondary productionNoPrint" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Refresh</button>}</header>
  {error&&<p role="alert" className="productionSaveError">{error}</p>}
  {viewing&&!active&&<p role="status">Opening Handoff…</p>}
  {!viewing&&!creating&&<section className="panel productionNoPrint"><PendingDocuments businessId={businessId} kind="production"/><div className="productionSavedListHead"><h2>Saved Handoffs</h2><button type="button" className="primary" disabled={!canManage} onClick={()=>{setSelected([]);setExcluded([]);setQuery('');setPage(1);setCreateBy('orders');setProductFilter('');setBusy(true);setShowOrders(true);setCreating(true);}}>New Handoff</button></div>
   <div className="productionSearchFilters"><label>Find Handoff<input value={handoffSearch} onChange={event=>{setHandoffSearch(event.target.value);setHandoffPage(1);}}/></label><label>Handoff List<select aria-label="Handoff List" value={handoffStatus} onChange={event=>{setHandoffStatus(event.target.value);setHandoffPage(1);}}>{['Active','History','Archived','Trash','All'].map(value=><option key={value}>{value}</option>)}</select></label></div>
   {history.error&&<p role="alert">{history.error}</p>}{(shared.handoffs||[]).map(item=><div className="productionSavedRow" key={item.id}><button type="button" className="productionTextButton" disabled={busy} onClick={()=>{setDocumentFromCreation(false);setShared(value=>({...value,ledger:{handoffs:[]}}));setOpenId(item.id);}}><b>{item.number} · {item.name}</b></button><span>{uiStatusLabel(item.status)}</span>{canManage&&<ActionMenu label={`Actions for ${item.number}`}>{item.deletedAt?<button type="button" onClick={()=>void fileAction(item,'recover')}>Restore Document</button>:<><button type="button" onClick={()=>void fileAction(item,item.archivedAt?'restore':'archive')}>{item.archivedAt?'Restore Document':'Archive Document'}</button><button type="button" onClick={()=>void fileAction(item,'delete')}>Move to Trash</button></>}</ActionMenu>}<SavedOutputRecordDetails businessId={businessId} kind="production" id={item.id} record={history.records[item.id]}/></div>)}
   {!shared.handoffs?.length&&<p role="status">{busy?'Loading Handoffs…':'No Handoffs'}</p>}<div className="productionActions"><span>{shared.handoffTotal||0} Handoffs</span><button type="button" className="secondary" disabled={busy||handoffPage<=1} onClick={()=>setHandoffPage(value=>value-1)}>Previous Handoffs</button><button type="button" className="secondary" disabled={busy||handoffPage*25>=(shared.handoffTotal||0)} onClick={()=>setHandoffPage(value=>value+1)}>Next Handoffs</button></div>
  </section>}
  {!viewing&&creating&&<section className="panel productionNoPrint">
   {!showOrders&&<div className="productionActions"><b>{shared.orders.map(source=>source.order.details.clientName).join(' + ')}</b><button type="button" className="secondary" onClick={()=>setShowOrders(true)}>Change Orders</button></div>}{showOrders&&<>
   <div className="productionSearchFilters"><label>Create By<select aria-label="Create Handoff By" value={createBy} onChange={event=>{setCreateBy(event.target.value);setProductFilter('');setSelected([]);setBusy(true);}}><option value="orders">Orders</option><option value="product">Product</option></select></label>{createBy==='product'&&<label>Product<select aria-label="Handoff Product" value={productFilter} onChange={event=>{setProductFilter(event.target.value);setSelected([]);setBusy(true);}}><option value="">Select Product</option>{shared.productChoices?.map(product=><option key={product.name} value={product.name}>{product.name}</option>)}</select></label>}<label>Find Order by Any Detail<input value={query} onChange={event=>{setQuery(event.target.value);setPage(1);setBusy(true);}}/></label></div>
   <div className="productionSelectedOrders">{selected.map(id=><button type="button" className="secondary" key={id} aria-label={`Remove Selected ${shared.orders.find(source=>source.order.orderId===id)?.order.details.orderNo||id}`} onClick={()=>changeSelection(id,false)}>{shared.orders.find(source=>source.order.orderId===id)?.order.details.clientName||'Selected Order'} ×</button>)}</div>
   <div className="productionOrderList">{(shared.choices||[]).map(order=><label key={order.orderId}><input type="checkbox" aria-label={`${order.orderNo} · ${order.client}`} checked={selected.includes(order.orderId)} disabled={!canManage||!selected.includes(order.orderId)&&selected.length>=25} onChange={event=>changeSelection(order.orderId,event.target.checked)}/><span><b>{order.orderNo} · {order.client}</b><small>{order.products}</small></span></label>)}</div>
   {(shared.total||0)>10&&<div className="productionActions"><span>{shared.total} Orders · Page {page}</span><button type="button" className="secondary" disabled={busy||page<=1} onClick={()=>setPage(value=>value-1)}>Previous Orders</button><button type="button" className="secondary" disabled={busy||page*10>=(shared.total||0)} onClick={()=>setPage(value=>value+1)}>Next Orders</button></div>}
   </>}
   {selected.length>0&&<div className="productionSelectProducts"><h2>Select Products</h2>{busy?<p role="status">Loading Products…</p>:<><label className="productionSelectAll"><input type="checkbox" aria-label="Include All Products" checked={products.some(product=>product.quantity>0)&&products.filter(product=>product.quantity>0).every(product=>!excluded.includes(product.name))} onChange={event=>setExcluded(event.target.checked?[]:products.map(product=>product.name))}/>All Products</label><div className="productionProductTabs">{products.map(product=><label className="productionProductChoice" key={product.name}><input type="checkbox" aria-label={`Include Product ${product.name}`} disabled={!product.quantity||!canManage} checked={product.quantity>0&&!excluded.includes(product.name)} onChange={event=>setExcluded(current=>event.target.checked?current.filter(name=>name!==product.name):[...current,product.name])}/><span><b>{product.name}</b><small>{product.quantity} Pieces{product.unresolved?` · ${product.unresolved} Sizes Need Details`:''}</small><small>{[...new Set(product.rows.map(row=>row.specifications).filter(Boolean))].join(' / ')}</small></span></label>)}</div>{!products.length&&<p>No Products</p>}</>}
    <button type="button" className="primary" disabled={!canCreate} onClick={create}>Create Handoff</button>
   </div>}
  </section>}
  {active&&<><section className="productionDocumentView productionNoPrint" aria-label="Production Document">{pendingProblem&&<p role="alert" className="productionSaveError">{pendingProblem} <button type="button" onClick={()=>retryPendingDocument(active.id,businessId)}>Retry Save</button></p>}<DocumentViewer key={active.id} compactActions html={html} title="Production Handoff" filename={active.number==='New draft'?'production-handoff':active.number} activity={{businessId,kind:'production',id:active.id}} previewOnly={!localHandoff&&active.status==='Draft'&&active.purpose!=='reference'} controls={!localHandoff&&active.status==='Draft'&&active.purpose!=='reference'?<button type="button" className="primary" disabled={busy||submitting||!canManage} onClick={()=>void submit(active)}>Create Handoff</button>:undefined}/></section><section className="productionPrintSheet" dangerouslySetInnerHTML={{__html:productionHandoffContent(active,businessId)}}/></>}
 </section>;
}
