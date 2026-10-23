import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { commerceOf, pricingQuote, pricingDelta, pricingLines, cents, validateCommerce } from "../../../lib/order-commerce";
import type { SeikoOrder } from "../../../lib/order-domain";
import { documentTotals, paymentsForInvoice, allocateOrderPayments, validateBillingDocument, type SeikoCommercialDocument, type SeikoPaymentRecord } from "../../../lib/seiko-billing";
import type { BillingProfile } from "../../../lib/billing-profile";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status});
type DocRow={id:string;data:string;sequence:number;cancelled:number};
const decode=(r:DocRow):SeikoCommercialDocument=>({...JSON.parse(r.data),id:r.id,number:`INV-${JSON.parse(r.data).issueDate.slice(0,4)}-${String(r.sequence).padStart(5,"0")}`,status:r.cancelled?"cancelled":"issued"});
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return fail("Invalid origin.",403);
 const actor=await authenticateActor(request);if(!actor)return fail("Sign in required.",401);
 if(!await authorizePermission(actor,"seiko","financials.view"))return fail("Billing access required.",403);
 let b:{operation?:string;orderId?:string;basis?:"eligible"|"delivered";token?:string;invoiceId?:string;reason?:string;date?:string;taxMode?:"gst"|"non_gst"};
 try{const reader=request.body?.getReader();let text="",bytes=0;const decoder=new TextDecoder();if(reader)for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>20000){await reader.cancel();return fail("Request too large.",413);}text+=decoder.decode(p.value,{stream:true});}b=JSON.parse(text);}catch{return fail("Invalid request.");}
 if(!["review","link","apply"].includes(b.operation||"")||typeof b.orderId!=="string"||!b.orderId||b.orderId.length>128||b.basis&&!['eligible','delivered'].includes(b.basis))return fail("Choose an order and billing basis.");
 const canManage=Boolean(await authorizePermission(actor,"seiko","billing.invoices.manage"));if(b.operation!=="review"&&!canManage)return fail("Invoice management permission required.",403);
 if(!env.DB)return fail("Shared storage unavailable.",503);const db=env.DB.withSession("first-primary");
 try{
 const row=await db.prepare("SELECT document_json FROM erp_orders WHERE id=? AND business_id='seiko' AND json_extract(document_json,'$.deletedAt') IS NULL").bind(b.orderId).first<{document_json:string}>();if(!row)return fail("Order unavailable.",404);
 const order=JSON.parse(row.document_json) as SeikoOrder;if(!commerceOf(order).rules.length)return fail("Save order pricing before reviewing billing.");const problem=validateCommerce(order);if(problem)return fail(problem);
 const rows:DocRow[]=(await db.prepare("SELECT sequence,id,data,cancelled FROM seiko_billing_documents WHERE json_extract(data,'$.orderId')=? AND json_extract(data,'$.kind')='invoice' AND cancelled=0 AND json_extract(data,'$.deletedAt') IS NULL ORDER BY sequence").bind(b.orderId).all<DocRow>()).results;
 const docs:SeikoCommercialDocument[]=rows.map(decode);const taxMode=docs[0]?.taxMode||b.taxMode||"non_gst";if(!["gst","non_gst"].includes(taxMode))return fail("Choose a valid tax register.");
 const quote=pricingQuote(order,b.basis||"eligible");quote.units=quote.units.map(u=>({...u,taxRate:taxMode==="gst"?u.taxRate:0,key:u.key.replace(/:tax[\d.]+$/,`:tax${taxMode==="gst"?u.taxRate:0}`)}));
 const booked=docs.flatMap(d=>[...(d.pricingSnapshot?.units||[]),...(d.credits||[]).flatMap(c=>c.units)]);
 const delta=pricingDelta(quote.units,booked);
 const lock=await db.prepare("SELECT version FROM seiko_order_billing_locks WHERE order_id=?").bind(b.orderId).first<{version:number}>();
 const token=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([row.document_json,rows,b.basis||"eligible",taxMode,lock?.version||0]))))).map(n=>n.toString(16).padStart(2,"0")).join("");
 const paymentRows:{sequence:number;data:string}[]=(await db.prepare("SELECT sequence,data FROM seiko_billing_payments WHERE json_extract(data,'$.orderId')=? OR invoice_id IN (SELECT id FROM seiko_billing_documents WHERE json_extract(data,'$.orderId')=?)").bind(b.orderId,b.orderId).all<{sequence:number;data:string}>()).results;
 const payments=allocateOrderPayments(docs,paymentRows.map(r=>({...JSON.parse(r.data),receiptNumber:`RCP-${JSON.parse(r.data).date.slice(0,4)}-${String(r.sequence).padStart(5,"0")}`} as SeikoPaymentRecord)));
 const totals={agreed:cents(quote.units.reduce((n,u)=>n+u.amount*(1+u.taxRate/100),0)),invoiced:cents(docs.reduce((n,d)=>n+documentTotals(d).originalTotal,0)),credits:cents(docs.reduce((n,d)=>n+documentTotals(d).creditTotal,0)),received:cents(payments.reduce((n,p)=>n+p.amount,0)),outstanding:cents(docs.reduce((n,d)=>n+Math.max(0,documentTotals(d).total-paymentsForInvoice(payments,d.id)),0)),customerCredit:cents(docs.reduce((n,d)=>n+Math.max(0,paymentsForInvoice(payments,d.id)-documentTotals(d).total),0))};
 if(b.operation==="review")return Response.json({ok:true,token,taxMode,quote,delta,documents:docs.map(d=>({id:d.id,number:d.number,total:documentTotals(d).total,mapped:Boolean(d.pricingSnapshot),credits:d.credits||[]})),totals,canManage},{headers:{"Cache-Control":"no-store"}});
 if(b.token!==token)return fail("Order or invoices changed. Review the current differences again.",409);
 if(!b.reason?.trim()||b.reason.length>2000)return fail("Record the reason for this billing review.");
 const claimToken=crypto.randomUUID();const claim=()=>db.prepare("INSERT INTO seiko_order_billing_locks(order_id,version,token) VALUES(?,1,?) ON CONFLICT(order_id) DO UPDATE SET version=version+1,token=excluded.token WHERE version=?").bind(b.orderId,claimToken,lock?.version||0);
 const owned="EXISTS(SELECT 1 FROM seiko_order_billing_locks WHERE order_id=? AND token=?)";
 const now=new Date().toISOString(),date=b.date||now.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return fail("Choose a valid adjustment date.");
 if(b.operation==="link"){
  const target=rows.find(r=>r.id===b.invoiceId),doc=target&&decode(target);if(!target||!doc||doc.pricingSnapshot)return fail("Select an unmapped invoice.");
  const available=pricingDelta(quote.units,booked).filter(u=>u.amount>0);const units=[...available];const residual=cents(documentTotals(doc).originalSubtotal-units.reduce((n,u)=>n+u.amount,0));
  const taxDifference=cents(documentTotals(doc).tax-units.reduce((n,u)=>n+u.amount*u.taxRate/100,0));
  if(doc.taxMode==="gst"&&(!residual&&Math.abs(taxDifference)>.01||residual&&(!Number.isFinite(taxDifference/residual)||taxDifference/residual<0||taxDifference/residual>1)))return fail("Match the historical GST rates and roster before linking this invoice. Its tax difference cannot be inferred safely.");
  if(residual)units.push({key:`legacy:${doc.id}`,ruleId:"legacy",recordId:"order",description:"Historical invoice difference to review",quantity:0,rate:residual,amount:residual,taxRate:doc.taxMode==="gst"?taxDifference/residual*100:0,hsnSac:""});
  const saved={...doc,number:"",pricingSnapshot:{orderUpdatedAt:order.updatedAt,basis:b.basis||"eligible",units,baseline:true},updatedAt:now,amendedAt:now,amendedBy:actor.email,revision:(doc.revision||0)+1,reference:[doc.reference,`Roster baseline: ${b.reason}`].filter(Boolean).join("\n")};
  const results=await db.batch([claim(),db.prepare(`UPDATE seiko_billing_documents SET data=? WHERE id=? AND data=? AND EXISTS(SELECT 1 FROM erp_orders WHERE id=? AND business_id='seiko' AND document_json=?) AND ${owned}`).bind(JSON.stringify(saved),target.id,target.data,b.orderId,row.document_json,b.orderId,claimToken)]);if(results.some((r:{meta?:{changes?:number}})=>!r.meta?.changes))return fail("Document changed. Review again.",409);
  return Response.json({ok:true,message:"Roster baseline linked. Original invoice values preserved; review the remaining difference before applying it."});
 }
 if(docs.some(d=>!d.pricingSnapshot))return fail("Link each existing invoice to a reviewed roster baseline before applying differences.",409);
 if(!delta.length)return fail("Nothing to adjust.");
 const negative=delta.filter(u=>u.amount<0),positive=delta.filter(u=>u.amount>0),zero=delta.filter(u=>u.amount===0);
 const creditBase=cents(-negative.reduce((n,u)=>n+u.amount,0));
 const updates:{id:string;before:string;next:string;paise:number}[]=[],creditUnits=new Map<string,typeof negative>();
 for(const unit of negative){let remaining=-unit.amount,quantity=unit.quantity;
  for(const doc of [...docs].reverse()){
   const bookedHere=[...(doc.pricingSnapshot?.units||[]),...(doc.credits||[]).flatMap(c=>c.units)].filter(u=>u.key===unit.key).reduce((n,u)=>n+u.amount,0);
   const already=(creditUnits.get(doc.id)||[]).filter(u=>u.key===unit.key).reduce((n,u)=>n-u.amount,0);
   const take=cents(Math.min(remaining,Math.max(0,bookedHere-already)));if(!take)continue;
   const partQuantity=cents(remaining===take?quantity:unit.quantity*take/(-unit.amount));
   creditUnits.set(doc.id,[...(creditUnits.get(doc.id)||[]),{...unit,amount:-take,quantity:partQuantity}]);remaining=cents(remaining-take);quantity=cents(quantity-partQuantity);if(!remaining)break;
  }
  if(remaining>.01)return fail("This reduction has no matching billed item. Review the historical invoice baseline.",409);
 }
 for(const r of rows){const d=decode(r),units=creditUnits.get(d.id);if(!units?.length)continue;const t=documentTotals(d),subtotal=cents(-units.reduce((n,u)=>n+u.amount,0));
  if(subtotal>t.subtotal+.01)return fail("Credit exceeds the remaining source invoice value.",409);
  const tax=cents(Math.abs(subtotal-t.subtotal)<.01?t.tax:Math.min(t.tax,-units.reduce((n,u)=>n+u.amount*u.taxRate/100,0)));
  const credit={id:crypto.randomUUID(),date,reason:b.reason,subtotal,tax,amount:cents(subtotal+tax),units,by:actor.email};
  const saved={...d,number:"",credits:[...(d.credits||[]),credit],updatedAt:now,revision:(d.revision||0)+1,amendedAt:now,amendedBy:actor.email};updates.push({id:d.id,before:r.data,next:JSON.stringify(saved),paise:Math.round(documentTotals(saved).total*100)});
 }
 let extra:SeikoCommercialDocument|undefined;
 if(positive.length||zero.length){
  const base=docs[0];const pref=await db.prepare("SELECT value_json FROM erp_preferences WHERE business_id='seiko' AND key='billing.profile.v1'").first<{value_json:string}>();const profile=pref?JSON.parse(pref.value_json) as BillingProfile:undefined;
  const units=[...positive,...zero];const normalUnits=positive.filter(u=>u.quantity>0&&cents(u.quantity*u.rate)===u.amount);const adjustments=positive.filter(u=>!normalUnits.includes(u));const lines=[...pricingLines(normalUnits),...adjustments.map((u,i)=>({id:`change-${i}`,description:u.description,quantity:1,unit:"adjustment",unitRate:u.amount,taxRate:u.taxRate,hsnSac:u.hsnSac}))];
  extra={id:crypto.randomUUID(),number:"",kind:"invoice",orderId:order.orderId,orderNo:order.details.orderNo,clientName:order.details.clientName,clientPhone:order.details.contactNumber,clientContactPerson:order.details.contactPerson,clientAddress:order.details.billTo,clientDeliveryAddress:order.details.shipTo,issueDate:date,dueOnReceipt:true,dueDate:date,taxMode,taxTreatment:base?.taxTreatment||"intra_state",placeOfSupply:base?.placeOfSupply,supplier:base?.supplier||profile?.supplier,showSignatory:false,showSignature:false,showStamp:false,showSigningDate:false,lines:lines.length?lines:[{id:"coverage",description:"Quantity reconciliation — no additional charge",quantity:1,unit:"review",unitRate:0,taxRate:0}],notes:b.reason,status:"issued",createdAt:now,updatedAt:now,supplementaryFor:base?.id,pricingSnapshot:{orderUpdatedAt:order.updatedAt,basis:b.basis||"eligible",units}};
  const invalid=validateBillingDocument(extra!);if(invalid)return fail(invalid);
 }
 // One guarded multi-row UPDATE prevents partial credits during concurrent edits.
 const expected=JSON.stringify(rows.map(r=>({id:r.id,data:r.data}))),next=JSON.stringify(updates);
 const allMatch="NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN seiko_billing_documents d ON d.id=json_extract(j.value,'$.id') WHERE d.id IS NULL OR d.cancelled<>0 OR d.data<>json_extract(j.value,'$.data'))";
 const statements=[claim()];
 if(updates.length)statements.push(db.prepare(`UPDATE seiko_billing_documents SET data=(SELECT json_extract(value,'$.next') FROM json_each(?) WHERE json_extract(value,'$.id')=seiko_billing_documents.id),total_paise=(SELECT json_extract(value,'$.paise') FROM json_each(?) WHERE json_extract(value,'$.id')=seiko_billing_documents.id) WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${allMatch} AND EXISTS(SELECT 1 FROM erp_orders WHERE id=? AND business_id='seiko' AND document_json=?) AND ${owned}`).bind(next,next,next,expected,b.orderId,row.document_json,b.orderId,claimToken));
 if(extra){const after=JSON.stringify(rows.map(r=>({id:r.id,data:updates.find(u=>u.id===r.id)?.next||r.data})));statements.push(db.prepare(`INSERT INTO seiko_billing_documents(id,data,total_paise,created_by) SELECT ?,?,?,? WHERE ${allMatch} AND EXISTS(SELECT 1 FROM erp_orders WHERE id=? AND business_id='seiko' AND document_json=?) AND ${owned}`).bind(extra.id,JSON.stringify(extra),Math.round(documentTotals(extra).total*100),actor.email,after,b.orderId,row.document_json,b.orderId,claimToken));}
 const results=await db.batch(statements);if(results.some((r:{meta?:{changes?:number}})=>!r.meta?.changes))return fail("Order or billing changed during review. Refresh before continuing.",409);
 return Response.json({ok:true,message:`Billing updated: ${extra?"linked supplementary invoice created; ":""}${creditBase?"credit adjustment recorded. Any excess payment remains customer credit for refund or allocation.":"no duplicate package charges."}`,invoiceId:extra?.id});
 }catch{return fail("Billing review could not be completed. Reload the review before retrying.",503);}
}
