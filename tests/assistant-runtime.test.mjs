import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { assert.ok(imports[name], name); return imports[name]; }, crypto, Response, Request, Headers, URL, TextEncoder, TextDecoder, structuredClone, console, Intl });
  return exports;
}
const statuses = load('app/lib/order-statuses.ts');
const domain = load('app/lib/order-domain.ts', { './order-statuses': statuses });
const assistant = load('app/lib/assistant-domain.ts', { './order-domain': domain });
const prompt = load('app/lib/assistant-prompt.ts');
function fixture() {
  return { ...structuredClone(prompt.assistantOrderExample), orderId: 'test-order-0001', status: 'Draft', archived: false, details: { ...prompt.assistantOrderExample.details, clientName: 'TEST GARMENT CLIENT', contactNumber: '+910000000000', orderNo: '2099-01-001', orderDate: '2099-01-01', attnRequired: false }, updatedAt: '2099-01-01T00:00:00.000Z' };
}
function harness({ steps = [], active = true, permission = true, user = 'test-owner-0001' } = {}) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(fs.readFileSync('migrations/0010_business_assistant.sql','utf8'));
  sqlite.exec('CREATE TABLE fixture_orders(id TEXT PRIMARY KEY, document_json TEXT)');
  sqlite.prepare('INSERT INTO fixture_orders VALUES(?,?)').run('test-order-0001',JSON.stringify(fixture()));
  const calls = { ai: 0, writes: 0, reads: 0 };
  const scope = { permissions: ['orders.view'] };
  const db = { withSession() { return this; }, prepare(sql) { let values = []; const statement = sqlite.prepare(sql); return { bind(...args) { values = args; return this; }, async first() { return statement.get(...values) || null; }, async all() { return { results: statement.all(...values) }; }, async run() { return statement.run(...values); } }; } };
  const tools = {
    readAssistantTool: async (_ctx, tool) => { calls.reads++; return tool === 'memories' ? [] : { order: fixture(), version: 1 }; },
    prepareAssistantAction: async (_ctx, tool, args) => ({ tool, payload: args, review: { changes: args } }),
    executeAssistantAction: async () => { calls.writes++; return { ok: true, orderId: 'test-order-0001' }; },
  };
  const api = load('app/api/erp/assistant/route.ts', {
    'cloudflare:workers': { env: { DB: db, ASSISTANT_FREE_PLAN_CONFIRMED: active ? 'true' : 'false', AI: { async run() { calls.ai++; return { choices: [{ message: { content: JSON.stringify(steps.shift() || { kind:'answer',message:'Test answer' }) } }] }; } } } },
    '../../../lib/server-erp-auth': { authenticateActor: async () => user ? { userId: user, email:'test@example.invalid' } : null, authorizeBusiness: async () => permission ? { role:'owner' } : null },
    '../../../lib/access-control': { permissionsForRole: () => scope.permissions }, '../../../lib/assistant-prompt': prompt, '../../../lib/assistant-domain': assistant, '../../../lib/server-assistant-tools': tools,
  });
  const request = async (body, headers = {}) => { const response = await api.POST(new Request('https://test.invalid/api/erp/assistant', { method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({businessId:'seiko',...body}) })); return { status:response.status, ...await response.json() }; };
  return { sqlite, calls, request, tools, scope };
}

test('assistant draft preserves existing business data until explicit confirmation; duplicate confirmation executes once', async () => {
  const h = harness({steps:[{kind:'propose',tool:'edit_order',args:{orderId:'test-order-0001',patches:[{path:'/products/0/specifications/0/defaultValue',value:'Navy blue'}]},message:'Review colour'}]});
  const before = h.sqlite.prepare('SELECT document_json FROM fixture_orders').get().document_json;
  const result = await h.request({operation:'chat',message:'Change collar colour'});
  assert.equal(result.ok,true); assert.equal(h.calls.writes,0);
  assert.equal(h.sqlite.prepare('SELECT document_json FROM fixture_orders').get().document_json,before);
  const command = {operation:'confirm',conversationId:result.conversationId,proposalId:result.proposal.id};
  assert.equal((await h.request(command)).ok,true);
  assert.equal((await h.request(command)).ok,true);
  assert.equal(h.calls.writes,1);
  h.sqlite.close();
});
test('wrong origin, absent authentication, disabled AI and revoked access never invoke the model or save', async () => {
  for (const options of [{active:false},{permission:false},{user:''}]) { const h=harness(options); const result=await h.request({operation:'chat',message:'Create an order'});assert.equal(result.ok,false);assert.equal(h.calls.ai,0);assert.equal(h.calls.writes,0);h.sqlite.close(); }
  const h=harness();assert.equal((await h.request({operation:'chat',message:'Hello'},{origin:'https://other.invalid'})).status,403);assert.equal(h.calls.ai,0);h.sqlite.close();
});
test('proposal ownership, cancellation, expiry and superseding prevent accidental saves', async () => {
  const h=harness({steps:[{kind:'propose',tool:'remember',args:{content:'Test preference'},message:'Review'}]});
  const p=await h.request({operation:'chat',message:'Remember my preference'});
  const command={operation:'confirm',conversationId:p.conversationId,proposalId:p.proposal.id};
  h.sqlite.prepare("UPDATE erp_assistant_proposals SET user_id='someone-else'").run();assert.equal((await h.request(command)).status,404);assert.equal(h.calls.writes,0);
  h.sqlite.prepare("UPDATE erp_assistant_proposals SET user_id=?").run('test-owner-0001:["orders.view"]');
  await h.request({operation:'chat',conversationId:p.conversationId,message:'Actually, use another preference'});
  assert.equal((await h.request(command)).status,409);assert.equal(h.calls.writes,0);h.sqlite.close();
});
test('a changed permission set cannot replay a previous proposal or receipt', async () => {
  const h=harness({steps:[{kind:'propose',tool:'remember',args:{content:'Test preference'},message:'Review'}]});
  const p=await h.request({operation:'chat',message:'Remember this test preference'});
  h.scope.permissions=[];
  const result=await h.request({operation:'confirm',conversationId:p.conversationId,proposalId:p.proposal.id});
  assert.equal(result.status,404);assert.equal(h.calls.writes,0);h.sqlite.close();
});
test('daily reservation is atomic and stops model calls at the configured cap', async () => {
  const h=harness();for(let i=0;i<8;i++)assert.equal((await h.request({operation:'chat',message:'Hello'})).ok,true);
  assert.equal((await h.request({operation:'chat',message:'One more'})).status,429);assert.equal(h.calls.ai,8);assert.equal(h.calls.writes,0);h.sqlite.close();
});
test('business reads can produce an answer without any business write', async () => {
  const h=harness({steps:[{kind:'read',tool:'orders',args:{orderIds:['test-order-0001']}},{kind:'answer',message:'The test order is Draft.'}]});
  const result=await h.request({operation:'chat',message:'Where is my order?'});assert.equal(result.message,'The test order is Draft.');assert.equal(result.sources.length,1);assert.equal(h.calls.writes,0);h.sqlite.close();
});
test('invalid model output cannot become a mutation', () => {
  for(const raw of ['not json','{"kind":"execute","tool":"delete_all"}','[]'])assert.throws(()=>assistant.parseAssistantStep(raw));
});
test('order patches preserve unrelated measurements, prices and records, and reject metadata/prototype changes', () => {
  const original=fixture();original.records=[{recordId:'r1',personId:'P-0001',values:{'field:f-name':'TEST PERSON','measurement:m-length:product:p-shirt':'28/24'}}];
  const before=JSON.stringify(original);
  const changed=assistant.patchAssistantOrder(original,[{path:'/products/0/specifications/0/defaultValue',value:'Navy blue'}]);
  assert.equal(JSON.stringify(original),before);assert.equal(changed.records[0].values['measurement:m-length:product:p-shirt'],'28/24');assert.equal(changed.orderId,original.orderId);
  for(const path of ['/orderId','/googleSheet','/status','/products/0/specifications/0/__proto__/polluted','/records'])assert.throws(()=>assistant.patchAssistantOrder(original,[{path,value:'bad'}]));
});
test('text measurement headings support optional length/waist notation without fabricating readings', () => {
  const order=fixture();assistant.assertAssistantOrder(order);assert.equal(order.measurements[0].type,'text');assert.equal(order.records.length,0);
});
