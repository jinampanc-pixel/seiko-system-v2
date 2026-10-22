import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const path of fs.readdirSync('migrations').sort())sql.exec(fs.readFileSync('migrations/'+path,'utf8'));
 let allowed=true,failChunk=false;
 const db={withSession(){return this;},prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...v){args=v;return this;},async run(){if(failChunk&&String(args[1]).endsWith('.0001'))throw new Error('storage failure');return {meta:{changes:Number(stmt.run(...args).changes)}};},async first(){return stmt.get(...args)||null;}};}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/erp/artwork/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>({'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':{authenticateActor:async()=>({userId:'owner',email:'owner@example.invalid'}),authorizePermission:async()=>allowed?{role:'owner'}:null}})[name],crypto,URL,Request,Response,Uint8Array,ReadableStream,atob,btoa});
 const upload=(bytes=new Uint8Array(700000).fill(65),business='seiko')=>exports.POST(new Request('https://test.invalid/api/erp/artwork?business='+business+'&name=reference.pdf',{method:'POST',headers:{'content-type':'application/pdf'},body:bytes}));
 return {sql,api:exports,upload,deny:()=>{allowed=false;},fail:()=>{failChunk=true;}};
}
test('shared artwork preserves original bytes across chunks, scopes business and denies unauthorised access',async()=>{
 const f=fixture();try{
  const bytes=new Uint8Array(700000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  const result=await (await f.upload(bytes)).json();assert.equal(result.ok,true);assert.equal(result.size,bytes.length);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM erp_preferences WHERE key LIKE 'order.asset.%'").get().n,4);
  const url='https://test.invalid/api/erp/artwork?business=seiko&id='+result.storageKey.slice(7);
  const response=await f.api.GET(new Request(url));assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  assert.equal((await f.api.GET(new Request(url.replace('business=seiko','business=other')))).status,404);
  f.deny();assert.equal((await f.api.GET(new Request(url))).status,403);assert.equal((await f.upload()).status,403);
 }finally{f.sql.close();}
});
test('a failed shared-artwork upload removes incomplete chunks and reports failure',async()=>{
 const f=fixture();try{f.fail();assert.equal((await f.upload()).status,503);assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM erp_preferences WHERE key LIKE 'order.asset.%'").get().n,0);}finally{f.sql.close();}
});
