"use client";
import { useMemo, useState } from 'react';
import type { SeikoOrder } from './lib/order-domain';
import type { PriceUnit } from './lib/order-commerce';
import { billingRecordGroups } from './lib/billing-record-groups';
import { formatInr } from './lib/seiko-billing';
export function BillingRecordBreakdown({order,units,title,collapsed=false,excluded=false}:{order:SeikoOrder;units:PriceUnit[];title:string;collapsed?:boolean;excluded?:boolean}){
 const [query,setQuery]=useState(''),[rule,setRule]=useState(''),[page,setPage]=useState(0);
 const groups=useMemo(()=>billingRecordGroups(order,units),[order,units]);
 const choices=[...new Map(groups.map(g=>[g.ruleId,g.price])).entries()];
 const filtered=groups.filter(g=>(!rule||g.ruleId===rule)&&[g.label,g.details,g.price,...g.recordIds].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/10)),current=Math.min(page,pages-1),visible=filtered.slice(current*10,current*10+10);
 const content=<div className="billingRecordsBody"><div className="billingRecordsTools"><label>Find Records<input aria-label={`${title} Search`} placeholder="Name, class, size or record ID" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><label>{excluded?"Reason":"Price Group"}<select aria-label={`${title} Price Group`} value={rule} onChange={e=>{setRule(e.target.value);setPage(0);}}><option value="">{excluded?"All Reasons":"All Price Groups"}</option>{choices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div><div className="serviceTable"><table><caption>{filtered.length} matching groups · identical unnamed entries are combined</caption><thead><tr><th>Person / Group</th><th>{excluded?"Reason":"Price Group"}</th>{excluded?<th>Records</th>:<><th>Quantity</th><th>Rate</th><th>Amount</th></>}</tr></thead><tbody>{visible.map(g=><tr key={g.id}><th scope="row">{g.label}{g.details&&<small>{g.details}</small>}<details className="billingRecordsIds"><summary>Record References ({g.recordIds.length})</summary><div>{g.recordIds.map(id=><small key={id}>{order.records.find(r=>r.recordId===id)?.personId||id}</small>)}</div></details></th><td>{g.price}</td>{excluded?<td>{g.recordIds.length}</td>:<><td>{g.quantity} {g.unit}</td><td>{formatInr(g.rate)}</td><td>{formatInr(g.amount)}</td></>}</tr>)}</tbody></table></div>{!filtered.length&&<p>No matching records.</p>}{pages>1&&<div className="billingRecordsPages"><span>Page {current+1} Of {pages}</span><button type="button" className="secondary" disabled={current===0} onClick={()=>setPage(current-1)}>Previous Records</button><button type="button" className="secondary" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next Records</button></div>}</div>;
 return collapsed?<details className="billingRecords"><summary>{title}</summary>{content}</details>:<section className="billingRecords" aria-label={title}>{content}</section>;
}
