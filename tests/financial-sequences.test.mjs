import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

// Expected values below use their own integer-paise and physical-stock model.
// Application pricing, totals, allocation and integrity helpers are subjects,
// never the oracle for expected answers.
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require(name) { assert.ok(imports[name], `Unmocked import ${name}`); return imports[name]; }, crypto, Request, Response, URL, TextEncoder, TextDecoder, Uint8Array });
  return exports;
}
const statuses = load('app/lib/order-statuses.ts');
const domain = load('app/lib/order-domain.ts', { './order-statuses': statuses });
const packing = load('app/lib/packing-label-model.ts', { './order-domain': domain });
const commerce = load('app/lib/order-commerce.ts', { './order-domain': domain, './packing-label-model': packing });
const billing = load('app/lib/seiko-billing.ts');
const profile = load('app/lib/billing-profile.ts');
const brief = load('app/lib/invoice-order-brief.ts', { './order-commerce': commerce, './order-domain': domain, './seiko-billing': billing });
const paise = n => Math.round(n * 100);
const rng = seed => () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

function runtime() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
  let race;
  const db = { withSession() { return this; }, prepare(sql) {
    const statement = sqlite.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; }, async run() {
      if (race && /^(UPDATE|INSERT INTO seiko_billing_payments)/.test(sql)) { const action = race; race = null; action(); }
      const result = statement.run(...args); return { ...result, meta: { changes: Number(result.changes) } };
    } };
  }, async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const auth = { authenticateActor: async () => ({ userId: 'sequence-owner', email: 'sequence@example.invalid' }), authorizePermission: async () => ({ role: 'owner' }) };
  const common = { 'cloudflare:workers': { env: { DB: db } }, '../../../lib/server-erp-auth': auth, '../../../lib/order-commerce': commerce, '../../../lib/seiko-billing': billing, '../../../lib/billing-profile': profile, '../../../lib/invoice-order-brief': brief, '../../../lib/order-statuses': statuses };
  const routes = Object.fromEntries(['orders', 'billing', 'order-billing'].map(name => [name, load(`app/api/erp/${name}/route.ts`, common)]));
  sqlite.prepare("INSERT INTO erp_preferences(business_id,key,value_json,version,updated_at,updated_by_user_id,updated_by_email) VALUES('seiko','billing.profile.v1',?,1,'now','sequence-owner','sequence@example.invalid')").run(JSON.stringify({ supplier: { name: 'SEIKO', address: 'Test Address', phone: '9999999999', gstin: '24AAAAA0000A1Z5', bank: '', showBank: false }, signatories: [], managerEmails: [] }));
  async function call(route, body) {
    const response = await routes[route].POST(new Request(`https://example.invalid/api/erp/${route}`, { method: 'POST', body: JSON.stringify({ businessId: 'seiko', ...body }) }));
    return { status: response.status, ...await response.json() };
  }
  return { sqlite, call, originalLines: new Map(), setRace(action) { race = action; }, close() { sqlite.close(); } };
}

function fixture(id, pair, tax) {
  const products = ['shirt', 'pant'].map(productId => ({ id: productId, name: productId, quantityMode: 'per_person', defaultQuantity: 0, orderTotal: 0, specifications: [{ id: `${productId}-size`, name: 'Size', mode: 'same_for_all', defaultValue: 'M', required: false }] }));
  const rules = products.map((p, index) => ({ id: p.id, name: p.name, mode: 'product', rate: index ? 215.37 : 143.29, taxRate: tax, hsnSac: '6205', fieldId: '', match: '', contents: [{ productId: p.id, quantity: 1 }] }));
  if (pair) rules.unshift({ id: 'pair', name: 'Sports Pair', mode: 'package', packageCharge: pair === 'person' ? 'person' : 'set', rate: 320.19, taxRate: tax, hsnSac: '6205', fieldId: '', match: '', contents: products.map(p => ({ productId: p.id, quantity: 1 })) });
  return { orderId: id, status: 'Active', archived: false, details: { orderNo: id.toUpperCase(), clientName: `Synthetic ${id}`, contactNumber: '9999999999', billTo: 'Test Address', shipTo: '', contactPerson: 'Fixture' }, fields: [{ id: 'name', name: 'Name', required: true }], products, measurements: [], records: Array.from({ length: 3 }, (_, i) => ({ recordId: `person-${i}`, personId: `P${i}`, values: { 'field:name': `Synthetic ${i}`, 'product:shirt:qty_override': 2, 'product:pant:qty_override': 2 } })), revisions: [], commerce: { quantityBasis: 'ordered', rules, people: {}, deliveries: [], issues: [] } };
}

function garmentOracle(order, deliveredOnly = false) {
  const physical = new Map(), expectedUnits = new Map();
  for (const move of order.commerce.deliveries) {
    const key = `${move.recordId}/${move.productId}`;
    physical.set(key, (physical.get(key) || 0) + (move.kind === 'return' ? -move.quantity : move.quantity));
    assert.ok(physical.get(key) >= 0, 'a garment cannot be returned before supply');
  }
  for (const person of order.records) {
    const cancelled = order.status === 'Cancelled' || order.commerce.people[person.recordId]?.state === 'cancelled';
    const q = id => Math.max(cancelled ? 0 : person.values[`product:${id}:qty_override`], physical.get(`${person.recordId}/${id}`) || 0);
    const s = q('shirt'), p = q('pant'), pair = order.commerce.rules.find(r => r.id === 'pair'), perPerson = pair?.packageCharge === 'person', sets = pair ? Math.min(s, p) : 0;
    for (const rule of order.commerce.rules) {
      let count = perPerson ? rule.id === 'pair' ? Number(s + p > 0) : 0 : rule.id === 'pair' ? sets : q(rule.id) - sets;
      if (deliveredOnly) count = perPerson ? count && (physical.get(`${person.recordId}/shirt`) || 0) >= s && (physical.get(`${person.recordId}/pant`) || 0) >= p ? count : 0 : rule.id === 'pair' ? Math.min(sets, physical.get(`${person.recordId}/shirt`) || 0, physical.get(`${person.recordId}/pant`) || 0) : Math.min(count, Math.max(0, (physical.get(`${person.recordId}/${rule.id}`) || 0) - sets));
      if (count) expectedUnits.set(`${person.recordId}/${rule.id}`, { count, rate: paise(rule.rate), tax: rule.taxRate });
    }
  }
  return { physical, expectedUnits, subtotal: [...expectedUnits.values()].reduce((n, u) => n + u.count * u.rate, 0) };
}

function invoiceOracle(doc) {
  const subtotal = doc.lines.reduce((n, line) => n + Math.round(line.quantity * paise(line.unitRate)), 0);
  const tax = doc.taxMode === 'gst' ? Math.round(doc.lines.reduce((n, line) => n + Math.round(line.quantity * paise(line.unitRate)) * line.taxRate / 100, 0)) : 0;
  return subtotal + tax - (doc.credits || []).reduce((n, credit) => n + paise(credit.amount), 0);
}

function moneyOracle(documents, payments) {
  const remaining = new Map(documents.filter(d => d.kind === 'invoice' && d.status !== 'cancelled' && !d.deletedAt).map(d => [d.id, invoiceOracle(d)]));
  const applied = new Map(), refunds = new Map(), allocation = new Map();
  for (const p of payments) if (p.refundOf) refunds.set(p.refundOf, (refunds.get(p.refundOf) || 0) - paise(p.amount));
  for (const p of payments) if (p.invoiceId) { applied.set(p.invoiceId, (applied.get(p.invoiceId) || 0) + paise(p.amount)); }
  for (const [id, amount] of applied) if (remaining.has(id)) remaining.set(id, Math.max(0, remaining.get(id) - amount));
  const ordered = [...documents].filter(d => remaining.has(d.id)).sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
  let unused = 0;
  for (const p of [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.receiptNumber.localeCompare(b.receiptNumber) || a.id.localeCompare(b.id))) {
    if (p.invoiceId || p.refundOf) continue;
    let balance = paise(p.amount) - (refunds.get(p.id) || 0);
    const allocations = [];
    if (p.orderId) for (const doc of ordered.filter(d => d.orderId === p.orderId)) {
      const take = Math.min(balance, remaining.get(doc.id));
      if (take) { allocations.push([doc.id, take]); applied.set(doc.id, (applied.get(doc.id) || 0) + take); remaining.set(doc.id, remaining.get(doc.id) - take); balance -= take; }
    }
    allocation.set(p.id, allocations); unused += balance;
  }
  // Direct receipt credits remain on their own invoice until explicitly refunded.
  const net = payments.reduce((n, p) => n + paise(p.amount), 0);
  assert.equal(net, unused + [...applied.values()].reduce((n, q) => n + q, 0), 'cash must be wholly applied or retained');
  return { applied, refunds, allocation, unused, net };
}

async function assertLedger(r, expectedCash) {
  const ledger = await r.call('billing', { operation: 'list' }); assert.equal(ledger.status, 200, JSON.stringify(ledger));
  const rawDocs = r.sqlite.prepare('SELECT sequence,id,data,cancelled,total_paise FROM seiko_billing_documents').all();
  const rawPays = r.sqlite.prepare('SELECT sequence,id,data,amount_paise FROM seiko_billing_payments').all();
  const oracle = moneyOracle(ledger.documents, ledger.payments);
  assert.equal(oracle.net, expectedCash);
  for (const row of rawDocs) {
    const doc = JSON.parse(row.data);
    assert.equal(row.total_paise, invoiceOracle(doc), `stored invoice ${row.id}`);
    if (r.originalLines.has(row.id)) assert.deepEqual(doc.lines, r.originalLines.get(row.id), 'reconciliation must preserve issued invoice lines');
    else r.originalLines.set(row.id, doc.lines);
  }
  for (const row of rawPays) assert.equal(row.amount_paise, paise(JSON.parse(row.data).amount));
  for (const p of ledger.payments) {
    assert.equal(paise(p.refundedAmount || 0), oracle.refunds.get(p.id) || 0);
    assert.deepEqual((p.allocations || []).map(a => [a.invoiceId, paise(a.amount)]), oracle.allocation.get(p.id) || []);
  }
  for (const doc of ledger.documents) {
    assert.equal(paise(billing.paymentsForInvoice(ledger.payments, doc.id)), oracle.applied.get(doc.id) || 0);
    assert.equal(paise(billing.invoiceOutstanding(doc, ledger.payments)), doc.status === 'cancelled' || doc.deletedAt ? 0 : Math.max(0, invoiceOracle(doc) - (oracle.applied.get(doc.id) || 0)));
  }
  assert.equal(billing.storedBillingIntegrityIssues(rawDocs, rawPays).length, 0);
  return { ...ledger, oracle };
}

test('seeded service end-to-end sequences reconcile garments and cash after every operation', async () => {
  const coverage = new Map(), exercised = { delivery: 0, return: 0, replacement: 0, refund: 0, linkOrder: 0, linkInvoice: 0, amend: 0 };
  for (const seed of [17, 83, 101, 509, 2027, 4051, 8191, 65537]) {
    const r = runtime(), random = rng(seed), pick = n => Math.floor(random() * n), history = [];
    const pair = seed % 3 === 2;
    const orders = [fixture('sequence-alpha', pair, 0), fixture('sequence-beta', !pair, 0), fixture('sequence-gamma', 'person', 0)];
    let serial = 0, cash = 0;
    async function save(order) {
      const row = r.sqlite.prepare('SELECT version FROM erp_orders WHERE id=?').get(order.orderId);
      const result = await r.call('orders', { operation: 'upsert', order, expectedVersion: row?.version });
      assert.equal(result.status, 200, JSON.stringify(result)); Object.assign(order, result.data.order);
    }
    async function reconcile(order) {
      const oracle = garmentOracle(order), review = await r.call('order-billing', { operation: 'review', orderId: order.orderId });
      assert.equal(review.status, 200, JSON.stringify(review)); assert.equal(paise(review.quote.total), oracle.subtotal);
      assert.equal(review.quote.unpriced.length, 0);
      const actual = new Map(review.quote.units.map(u => [`${u.recordId}/${u.ruleId}`, { count: u.quantity, rate: paise(u.rate), tax: u.taxRate }]));
      assert.deepEqual(actual, oracle.expectedUnits);
      const delivered = garmentOracle(order, true);
      assert.equal(paise(commerce.pricingQuote(order, 'delivered').total), delivered.subtotal);
      for (const [key, qty] of oracle.physical) { const [person, product] = key.split('/'); assert.equal(commerce.deliveredQuantity(order, person, product), qty); }
      if (review.delta.length) {
        const result = await r.call('order-billing', { operation: 'apply', orderId: order.orderId, token: review.token, reason: `Synthetic sequence ${seed}`, date: '2026-09-26' }); assert.equal(result.status, 200, JSON.stringify(result));
      }
      const clean = await r.call('order-billing', { operation: 'review', orderId: order.orderId }); assert.equal(clean.delta.length, 0);
      assert.equal(paise(clean.totals.invoiced) - paise(clean.totals.credits), oracle.subtotal);
      const ledger = await r.call('billing', { operation: 'list' }), money = moneyOracle(ledger.documents, ledger.payments);
      const booked = new Map();
      for (const doc of ledger.documents.filter(d => d.orderId === order.orderId)) for (const unit of [...doc.pricingSnapshot.units, ...(doc.credits || []).flatMap(c => c.units)]) {
        const key = `${unit.recordId}/${unit.ruleId}`, old = booked.get(key) || { count: 0, amount: 0 };
        booked.set(key, { count: old.count + Math.round(unit.quantity * 100), amount: old.amount + paise(unit.amount) });
      }
      for (const key of new Set([...booked.keys(), ...oracle.expectedUnits.keys()])) {
        const expected = oracle.expectedUnits.get(key);
        assert.equal(booked.get(key)?.count || 0, (expected?.count || 0) * 100, 'net invoiced garment/set count');
        assert.equal(booked.get(key)?.amount || 0, expected ? expected.count * expected.rate : 0, 'net invoiced garment/set principal');
      }
      const excess = ledger.documents.filter(d => d.orderId === order.orderId).reduce((n, d) => n + Math.max(0, (money.applied.get(d.id) || 0) - invoiceOracle(d)), 0);
      const advance = ledger.payments.filter(p => p.orderId === order.orderId && !p.invoiceId && !p.refundOf).reduce((n, p) => n + paise(p.amount) - (money.refunds.get(p.id) || 0) - (money.allocation.get(p.id) || []).reduce((v, a) => v + a[1], 0), 0);
      assert.equal(paise(clean.totals.customerCredit), excess + advance, 'order credit must include unused collected advances');
    }
    try {
      for (const order of orders) { await save(order); await reconcile(order); }
      for (let step = 0; step < 160; step++) {
        const order = orders[pick(orders.length)], person = order.records[pick(order.records.length)], product = pick(2) ? 'shirt' : 'pant';
        const action = pick(14), id = `seed-${seed}-action-${serial++}`, physical = garmentOracle(order).physical.get(`${person.recordId}/${product}`) || 0;
        history.push({ step, action, order: order.orderId, person: person.recordId, product }); coverage.set(action, (coverage.get(action) || 0) + 1);
        let ledger = await assertLedger(r, cash);
        if (action === 0) { person.values[`product:${product}:qty_override`] = pick(5); await save(order); }
        else if (action === 1) { order.commerce.rules[pick(order.commerce.rules.length)].rate = (10000 + pick(40000)) / 100; await save(order); }
        else if (action === 2) {
          const state = ['active', 'cancelled', 'hold'][pick(3)]; order.commerce.people[person.recordId] = { state, reason: 'Synthetic state change' }; await save(order);
        } else if (action === 3 || action === 4) {
          const qty = person.values[`product:${product}:qty_override`], state = order.commerce.people[person.recordId]?.state;
          if (action === 3 && order.status !== 'Cancelled' && !['cancelled', 'hold'].includes(state) && qty > physical) order.commerce.deliveries.push({ id, recordId: person.recordId, productId: product, quantity: 1 + pick(qty - physical), kind: 'delivery', date: '2026-09-26', reference: id });
          else if (action === 4 && physical) order.commerce.deliveries.push({ id, recordId: person.recordId, productId: product, quantity: 1 + pick(physical), kind: 'return', date: '2026-09-26', reference: id });
          await save(order);
        } else if (action === 5 || action === 6) {
          const amount = 1 + pick(50000), quick = action === 5;
          const request = { operation: 'payment', payment: { id, invoiceId: '', orderId: quick ? '' : order.orderId, clientName: 'Synthetic Payer', clientPhone: '9999999999', amount: amount / 100, date: '2026-09-26', mode: 'UPI', reference: id, notes: '' } };
          const result = await r.call('billing', request);
          if (!quick && order.status === 'Cancelled') assert.equal(result.status, 400, JSON.stringify(result));
          else {
            assert.equal(result.status, 200, JSON.stringify(result)); cash += amount;
            assert.equal((await r.call('billing', request)).status, 200, 'same payment retry');
            assert.equal((await r.call('billing', { ...request, payment: { ...request.payment, amount: (amount + 1) / 100 } })).status, 409, 'changed payment retry');
          }
        } else if (action === 7) {
          const candidates = ledger.payments.filter(p => !p.invoiceId && !p.orderId && !p.refundOf && !ledger.oracle.refunds.has(p.id));
          if (candidates.length) {
            const source = candidates[pick(candidates.length)], direct = pick(2), doc = ledger.documents.find(d => d.orderId === order.orderId && invoiceOracle(d) - (ledger.oracle.applied.get(d.id) || 0) >= paise(source.amount));
            const target = direct && doc ? { invoiceId: doc.id } : { orderId: order.orderId };
            const result = await r.call('billing', { operation: 'link_payment', id: source.id, ...target, expectedRevision: source.revision || 0, expectedUpdatedAt: source.updatedAt });
            if (target.orderId && order.status === 'Cancelled') assert.equal(result.status, 409, JSON.stringify(result));
            else { assert.equal(result.status, 200, JSON.stringify(result)); const saved = result.payments.find(p => p.id === source.id); assert.equal(saved.amount, source.amount); assert.equal(saved.receiptNumber, source.receiptNumber); assert.equal(saved.originalPayer, source.clientName); }
          }
        } else if (action === 8) {
          const candidates = ledger.payments.filter(p => !p.refundOf && p.amount > 0);
          if (candidates.length) {
            const source = candidates[pick(candidates.length)], retained = paise(source.amount) - (ledger.oracle.refunds.get(source.id) || 0);
            const refundable = source.invoiceId ? Math.min(retained, Math.max(0, (ledger.oracle.applied.get(source.invoiceId) || 0) - invoiceOracle(ledger.documents.find(d => d.id === source.invoiceId)))) : retained - (ledger.oracle.allocation.get(source.id) || []).reduce((n, a) => n + a[1], 0);
            const amount = refundable ? 1 + pick(refundable) : 1;
            const request = { operation: 'refund', payment: { id, refundOf: source.id, amount: amount / 100, date: '2026-09-26', mode: 'UPI', reference: id, notes: 'Synthetic money returned' } };
            const result = await r.call('billing', request); assert.equal(result.status, refundable ? 200 : 409, JSON.stringify(result));
            if (refundable) { cash -= amount; assert.equal((await r.call('billing', request)).status, 200); }
          }
        } else if (action === 9) {
          const candidates = ledger.documents.filter(d => d.orderId === order.orderId && invoiceOracle(d) > (ledger.oracle.applied.get(d.id) || 0));
          if (candidates.length) {
            const doc = candidates[pick(candidates.length)], amount = 1 + pick(invoiceOracle(doc) - (ledger.oracle.applied.get(doc.id) || 0));
            const result = await r.call('billing', { operation: 'payment', payment: { id, invoiceId: doc.id, amount: amount / 100, date: '2026-09-26', mode: 'Cash', reference: id, notes: '' } }); assert.equal(result.status, 200, JSON.stringify(result)); cash += amount;
          }
        } else if (action === 10) {
          const prior = order.commerce.deliveries.filter(d => d.recordId === person.recordId && d.productId === product);
          const returned = prior.reduce((n, d) => n + (d.kind === 'return' ? d.quantity : d.kind === 'replacement' ? -d.quantity : 0), 0);
          const eligible = order.status !== 'Cancelled' && !['cancelled', 'hold'].includes(order.commerce.people[person.recordId]?.state);
          if (returned > 0 && eligible && person.values[`product:${product}:qty_override`] > physical) {
            const issueId = `${id}-issue`;
            order.commerce.issues.push({ id: issueId, recordId: person.recordId, productId: product, type: 'wrong_item', description: 'Synthetic returned garment', owner: 'Test Tailor', promisedDate: '', status: 'open', chargeable: false, extraCharge: 0, history: [{ at: '2026-09-26T12:00:00Z', status: 'open', note: 'Recorded return' }] });
            order.commerce.deliveries.push({ id, recordId: person.recordId, productId: product, quantity: 1, kind: 'replacement', issueId, date: '2026-09-26', reference: id }); await save(order);
          }
        } else if (action === 11) {
          const candidates = ledger.payments.filter(p => !p.refundOf && !p.invoiceId && !ledger.oracle.refunds.has(p.id));
          if (candidates.length) {
            const source = candidates[pick(candidates.length)], amount = 1 + pick(50000);
            const result = await r.call('billing', { operation: 'amend_payment', payment: { ...source, amount: amount / 100, notes: 'Synthetic receipt correction' } });
            assert.equal(result.status, 200, JSON.stringify(result)); cash += amount - paise(source.amount);
          }
        } else if (action === 12) {
          const source = ledger.payments.find(p => !p.refundOf);
          if (source) {
            const before = r.sqlite.prepare('SELECT id,data,amount_paise FROM seiko_billing_payments ORDER BY id').all();
            assert.equal((await r.call('billing', { operation: 'refund', payment: { id, refundOf: source.id, amount: source.amount + 1, date: '2026-09-26', mode: 'Cash', notes: 'Invalid excess refund' } })).status, 409);
            assert.deepEqual(r.sqlite.prepare('SELECT id,data,amount_paise FROM seiko_billing_payments ORDER BY id').all(), before);
          }
        } else { order.status = order.status === 'Cancelled' ? 'Active' : 'Cancelled'; await save(order); }
        await reconcile(order); ledger = await assertLedger(r, cash);
        // Re-reading and reallocating must not change any stored money.
        assert.equal((await assertLedger(r, cash)).oracle.net, ledger.oracle.net);
      }
      for (const order of orders) for (const d of order.commerce.deliveries) exercised[d.kind]++;
      const final = await assertLedger(r, cash);
      for (const p of final.payments) {
        if (p.refundOf) exercised.refund++;
        if (p.linkedAt) exercised[p.invoiceId ? 'linkInvoice' : 'linkOrder']++;
        if (p.amendedAt) exercised.amend++;
      }
    } catch (error) { error.message += `\nReplay seed=${seed}; last actions=${JSON.stringify(history.slice(-12))}`; throw error; }
    finally { r.close(); }
  }
  assert.equal(coverage.size, 14, 'all action categories exercised');
  for (const [kind, count] of Object.entries(exercised)) assert.ok(count > 0, `successfully exercised ${kind}`);
});

test('quick-payment linking can retry after a lost response and never changes receipt value or number', async () => {
  const r = runtime(); try {
    const order = fixture('sequence-link', false, 0);
    assert.equal((await r.call('orders', { operation: 'upsert', order })).status, 200);
    const created = await r.call('billing', { operation: 'payment', payment: { id: 'link-retry-source', invoiceId: '', clientName: 'Synthetic Walk-in', amount: 123.45, date: '2026-09-26', mode: 'Cash', reference: '', notes: '' } });
    assert.equal(created.status, 200); const source = created.payments[0];
    const request = { operation: 'link_payment', id: source.id, orderId: order.orderId, expectedRevision: source.revision || 0, expectedUpdatedAt: source.updatedAt };
    assert.equal((await r.call('billing', request)).status, 200);
    const retry = await r.call('billing', request); assert.equal(retry.status, 200, JSON.stringify(retry));
    assert.equal(retry.payments.length, 1); assert.equal(retry.payments[0].amount, 123.45); assert.equal(retry.payments[0].receiptNumber, source.receiptNumber);
    assert.equal((await r.call('billing', { ...request, orderId: 'different-order' })).status, 409);
    assert.equal(r.sqlite.prepare("SELECT count(*) n FROM erp_audit_events WHERE action='link'").get().n, 1);
  } finally { r.close(); }
});

test('saved delivery history can be billed after cancellation without authorizing new over-supply or excessive returns', async () => {
  const r = runtime(); try {
    let order = fixture('sequence-history', false, 0), version;
    const save = async value => r.call('orders', { operation: 'upsert', order: value, expectedVersion: version });
    let saved = await save(order); assert.equal(saved.status, 200); order = saved.data.order; version = saved.data.version;
    const move = (id, kind, quantity) => ({ id, kind, quantity, recordId: 'person-0', productId: 'shirt', date: '2026-09-26', reference: id });
    let invalid = structuredClone(order); invalid.commerce.deliveries.push(move('too-many', 'delivery', 3)); assert.equal((await save(invalid)).status, 400);
    order.commerce.deliveries.push(move('original-supply', 'delivery', 2)); saved = await save(order); assert.equal(saved.status, 200); order = saved.data.order; version = saved.data.version;
    order.status = 'Cancelled'; order.records[0].values['product:shirt:qty_override'] = 0;
    saved = await save(order); assert.equal(saved.status, 200); order = saved.data.order; version = saved.data.version;
    let review = await r.call('order-billing', { operation: 'review', orderId: order.orderId }); assert.equal(review.status, 200); assert.equal(paise(review.quote.total), 2 * 14329);
    invalid = structuredClone(order); invalid.commerce.deliveries.push(move('after-cancel', 'delivery', 1)); assert.equal((await save(invalid)).status, 400);
    invalid = structuredClone(order); invalid.commerce.deliveries.push(move('too-many-returns', 'return', 3)); assert.equal((await save(invalid)).status, 400);
    order.commerce.deliveries.push(move('one-return', 'return', 1)); saved = await save(order); assert.equal(saved.status, 200);
    review = await r.call('order-billing', { operation: 'review', orderId: order.orderId }); assert.equal(review.status, 200); assert.equal(paise(review.quote.total), 14329);
    assert.equal((await r.call('order-billing', { operation: 'apply', orderId: order.orderId, token: review.token, reason: 'One retained garment remains payable', date: '2026-09-26' })).status, 200);
    const ledger = await assertLedger(r, 0); assert.equal(ledger.documents.reduce((n, d) => n + invoiceOracle(d), 0), 14329);
  } finally { r.close(); }
});

test('GST reconciliation preserves exact document tax and bounded credits through long price and quantity changes', async () => {
  for (const tax of [5, 12, 18]) {
    const r = runtime(), random = rng(1009 + tax), order = fixture('sequence-tax', true, tax);
    try {
      for (let step = 0; step < 90; step++) {
        const person = order.records[Math.floor(random() * order.records.length)];
        person.values[`product:${random() < .5 ? 'shirt' : 'pant'}:qty_override`] = Math.floor(random() * 5);
        if (step % 3 === 0) order.commerce.rules[Math.floor(random() * order.commerce.rules.length)].rate = (100 + Math.floor(random() * 50000)) / 100;
        if (step % 7 === 0) order.commerce.rules[Math.floor(random() * order.commerce.rules.length)].taxRate = [5, 12, 18][Math.floor(random() * 3)];
        const row = r.sqlite.prepare('SELECT version FROM erp_orders WHERE id=?').get(order.orderId);
        const saved = await r.call('orders', { operation: 'upsert', order, expectedVersion: row?.version }); assert.equal(saved.status, 200, JSON.stringify(saved)); Object.assign(order, saved.data.order);
        const review = await r.call('order-billing', { operation: 'review', orderId: order.orderId, taxMode: 'gst' }); assert.equal(review.status, 200, JSON.stringify(review));
        const oracle = garmentOracle(order); assert.equal(paise(review.quote.total), oracle.subtotal);
        if (review.delta.length) {
          const result = await r.call('order-billing', { operation: 'apply', orderId: order.orderId, taxMode: 'gst', token: review.token, reason: `Tax fixture ${tax}/${step}`, date: '2026-09-26' }); assert.equal(result.status, 200, `tax=${tax} step=${step} ${JSON.stringify(result)}`);
        }
        const ledger = await assertLedger(r, 0);
        let netSubtotal = 0;
        for (const doc of ledger.documents) {
          const originalSubtotal = doc.lines.reduce((n, l) => n + Math.round(l.quantity * paise(l.unitRate)), 0);
          const originalTax = Math.round(doc.lines.reduce((n, line) => n + Math.round(line.quantity * paise(line.unitRate)) * line.taxRate / 100, 0));
          const creditedTax = (doc.credits || []).reduce((n, c) => n + paise(c.tax), 0);
          assert.ok(creditedTax <= originalTax, `tax credit exceeds source ${tax}/${step}`);
          netSubtotal += originalSubtotal - (doc.credits || []).reduce((n, c) => n + paise(c.subtotal), 0);
        }
        assert.equal(netSubtotal, oracle.subtotal, `GST net garment principal ${tax}/${step}`);
        const after = await r.call('order-billing', { operation: 'review', orderId: order.orderId }); assert.equal(after.delta.length, 0);
      }
    } finally { r.close(); }
  }
});

test('late-link races, overpayments and refunded slips cannot misapply quick-payment money', async () => {
  const r = runtime(); try {
    const order = fixture('sequence-race', false, 0);
    assert.equal((await r.call('orders', { operation: 'upsert', order })).status, 200);
    const review = await r.call('order-billing', { operation: 'review', orderId: order.orderId });
    assert.equal((await r.call('order-billing', { operation: 'apply', orderId: order.orderId, token: review.token, reason: 'Race fixture', date: '2026-09-26' })).status, 200);
    const collect = async (id, amount) => {
      const result = await r.call('billing', { operation: 'payment', payment: { id, invoiceId: '', clientName: 'Synthetic Payer', amount, date: '2026-09-26', mode: 'Cash', reference: '', notes: '' } }); assert.equal(result.status, 200); return result.payments.find(p => p.id === id);
    };
    const source = await collect('race-quick-source', 100), ledger = await r.call('billing', { operation: 'list' }), doc = ledger.documents[0];
    r.setRace(() => {
      const advance = { id: 'race-new-advance', invoiceId: '', orderId: order.orderId, amount: invoiceOracle(doc) / 100, date: '2026-09-26', mode: 'Cash', reference: '', notes: '', createdAt: '2026-09-26T00:00:00Z' };
      r.sqlite.prepare('INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES(?,?,?,?,?)').run(advance.id, '', paise(advance.amount), JSON.stringify(advance), 'sequence@example.invalid');
    });
    assert.equal((await r.call('billing', { operation: 'link_payment', id: source.id, invoiceId: doc.id, expectedRevision: 0 })).status, 409);
    let current = await assertLedger(r, 10000 + invoiceOracle(doc)); assert.equal(current.payments.find(p => p.id === source.id).invoiceId, '');
    assert.equal((await r.call('billing', { operation: 'link_payment', id: source.id, invoiceId: doc.id, expectedRevision: 0 })).status, 409, 'fully paid invoice cannot absorb the slip');
    assert.equal((await r.call('billing', { operation: 'refund', payment: { id: 'race-quick-refund', refundOf: source.id, amount: 25, date: '2026-09-26', mode: 'Cash', notes: 'Partial return' } })).status, 200);
    assert.equal((await r.call('billing', { operation: 'link_payment', id: source.id, orderId: order.orderId, expectedRevision: 0 })).status, 409, 'refunded slip cannot be moved with its gross amount');
    current = await assertLedger(r, 7500 + invoiceOracle(doc)); assert.equal(current.payments.find(p => p.id === source.id).amount, 100);
    const other = await collect('race-cancel-source', 10);
    r.setRace(() => r.sqlite.prepare("UPDATE erp_orders SET status='Cancelled',document_json=json_set(document_json,'$.status','Cancelled') WHERE id=?").run(order.orderId));
    assert.equal((await r.call('billing', { operation: 'link_payment', id: other.id, orderId: order.orderId, expectedRevision: 0 })).status, 409);
    await assertLedger(r, 8500 + invoiceOracle(doc));
    assert.equal(r.sqlite.prepare("SELECT count(*) n FROM erp_audit_events WHERE action='link'").get().n, 0, 'rejected links leave no false success history');
  } finally { r.close(); }
});
