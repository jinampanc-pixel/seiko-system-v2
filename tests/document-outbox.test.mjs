import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function runtime(file='app/lib/document-outbox.ts'){
 const values=new Map(),events=[];let failStorage=false,fetcher=async()=>Response.json({ok:false},{status:503});
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto,Date,Event,CustomEvent,AbortSignal,setTimeout,Response,TextEncoder,Uint8Array,navigator:{onLine:true},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(failStorage)throw Error('Full');values.set(k,v);}},window:{dispatchEvent:e=>events.push(e)},fetch:(...args)=>fetcher(...args),require:()=>({documentActor:()=> 'owner@example.invalid'})});
 return {api:exports,values,events,fetch:f=>fetcher=f,storageFail:v=>failStorage=v};
}
const draft={id:'draft-one',businessId:'seiko',kind:'production',title:'Cutting sheet',html:'<p>Exact saved copy</p>',body:{businessId:'seiko',operation:'save',handoff:{id:'draft-one'}}};
test('offline documents retain exact content and actor, and retry without creating a second document ID',async()=>{
 const r=runtime();r.api.setDocumentActor('owner@example.invalid');const saved=r.api.retainPendingDocument(draft);
 await r.api.syncPendingDocuments();assert.equal(r.api.pendingDocuments().length,1);assert.equal(r.api.pendingDocuments()[0].html,draft.html);assert.equal(saved.actor,'owner@example.invalid');
 let sent;r.fetch(async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({ok:true});});await r.api.syncPendingDocuments();assert.equal(sent.handoff.id,draft.id);assert.equal(sent.requestedBy,'owner@example.invalid');assert.equal(r.api.pendingDocuments().length,0);
});
test('an acknowledgement cannot discard a newer edit queued while saving',async()=>{
 const r=runtime();r.api.setDocumentActor('owner@example.invalid');r.api.retainPendingDocument(draft);let finish;
 r.fetch(()=>new Promise(resolve=>finish=resolve));const saving=r.api.syncPendingDocuments();r.api.retainPendingDocument({...draft,html:'Newer edited copy'});finish(Response.json({ok:true}));await saving;
 assert.equal(r.api.pendingDocuments().length,1);assert.equal(r.api.pendingDocuments()[0].html,'Newer edited copy');
});
test('pending documents remain scoped to their original signed-in user and storage failure remains visible',async()=>{
 const r=runtime();r.api.setDocumentActor('owner@example.invalid');r.storageFail(true);r.api.retainPendingDocument(draft);assert.equal(r.api.documentOutboxIsVolatile(),true);r.api.setDocumentActor('other@example.invalid');let calls=0;r.fetch(async()=>{calls++;return Response.json({ok:true});});await r.api.syncPendingDocuments();assert.equal(calls,0);assert.equal(r.api.pendingDocuments().length,1);
});
test('output logging completes locally without waiting for a network response, then retries the same event',async()=>{
 const r=runtime('app/lib/output-activity.ts');let finish,sent;r.fetch((_url,options)=>{sent=JSON.parse(options.body);return new Promise(resolve=>finish=resolve);});
 await r.api.recordOutput({businessId:'seiko',kind:'production',id:'draft-one'},'print-requested','Exact print copy');assert.equal(r.api.pendingOutputCount(),1);const eventId=sent.eventId;finish(Response.json({ok:false},{status:503}));await new Promise(resolve=>setTimeout(resolve,0));
 r.fetch(async(_url,options)=>{assert.equal(JSON.parse(options.body).eventId,eventId);return Response.json({ok:true});});await r.api.flushOutputActivity();assert.equal(r.api.pendingOutputCount(),0);
});
