const { readFileSync, writeFileSync } = require('node:fs');

function edit(path, edits) {
  const raw = readFileSync(path, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let text = raw.replace(/\r\n/g, '\n');
  for (const [before, after, label] of edits) {
    if (!text.includes(before)) throw new Error(`${path}: expected pattern not found: ${label}`);
    text = text.replace(before, after);
  }
  writeFileSync(path, text.replace(/\n/g, eol));
}

edit('app/orders.tsx', [
  [
    'onCancel={() => setView("center")}',
    'onCancel={() => setView(current.revisions.length ? "workspace" : "center")}',
    'existing setup cancel returns to workspace',
  ],
  [
    '<button className="primary" onClick={onContinue}>Create workspace</button>',
    '<button className="primary" onClick={onContinue}>{order.revisions.length ? "Update workspace" : "Create workspace"}</button>',
    'top setup action reflects create vs edit',
  ],
  [
    '<button className="primary" onClick={onContinue}>Create workspace</button>',
    '<button className="primary" onClick={onContinue}>{order.revisions.length ? "Update workspace" : "Create workspace"}</button>',
    'bottom setup action reflects create vs edit',
  ],
  [
    'product.quantityMode === "by_group" ? "Fallback qty" : "Default qty"',
    'product.quantityMode === "by_group" ? "Default qty" : "Default qty"',
    'by-group quantity uses default terminology',
  ],
  [
    '<input aria-label="Group quantity" type="number" min="1" placeholder="Quantity" value={rule.quantity || ""}',
    '<input aria-label="Group quantity" type="number" min="0" placeholder="Quantity" value={rule.quantity ?? ""}',
    'allow zero group quantity',
  ],
  [
    '{ match: "", quantity: product.defaultQuantity || 1 }',
    '{ match: "", quantity: product.defaultQuantity ?? 1 }',
    'preserve zero when adding group exception',
  ],
  [
    'by_group: "Use the grouping field below to set quantities such as Std 9 = 1 and Std 10 = 2; unmatched rows use the fallback quantity."',
    'by_group: "Use the default quantity normally, then add only groups that differ. An exception can contain several values separated by commas, semicolons or new lines; quantity 0 means that group does not receive this product."',
    'explain default plus exceptions',
  ],
  [
    '<button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button><button onClick={()=>{setOrderMenuOpen(false);onSave(false);}}>Save</button>',
    '<button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button><button disabled={!undoStack.length} onClick={()=>{setOrderMenuOpen(false);undo();}}>Undo last change</button><button disabled={!redoStack.length} onClick={()=>{setOrderMenuOpen(false);redo();}}>Redo last change</button><button onClick={()=>{setOrderMenuOpen(false);onSave(false);}}>Save</button>',
    'expose undo and redo for row operations',
  ],
]);

edit('tests/foundation-contract.test.mjs', [[
  '  assert.match(orders, /renumberRecords/);',
  '  assert.doesNotMatch(orders, /renumberRecords/);\n  assert.match(orders, /Math\\.max\\(0, \\.\\.\\.order\\.records\\.map\\(record => Number\\(record\\.personId\\.match/);',
  'lock stable person IDs instead of renumbering',
]]);

edit('tests/seiko-stage2-audit-contract.test.mjs', [
  [
    '  assert.match(orderDomain, /split\\(\\/\\[;,\\\\n\\]\\//);',
    '  assert.match(orderDomain, /split\\(\\/\\[;,\\\\n\\]\\//);\n  assert.match(orders, /min="0" placeholder="Quantity" value=\\{rule\\.quantity \\?\\? ""\\}/);\n  assert.match(orders, /quantity 0 means that group does not receive this product/);',
    'lock zero quantity UI',
  ],
  [
    '  assert.doesNotMatch(pager, /cloneNode\\(true\\).*addEventListener\\("change"/s);',
    '  assert.match(pager, /dispatchEvent\\(new Event\\("change", \\{ bubbles: true \\}\\)\\)/);',
    'assert synchronized proxy behavior instead of banning select clone',
  ],
  [
    '  assert.match(rowActions, /Add \\$\\{count\\} rows\\?/);',
    '  assert.match(rowActions, /Add \\$\\{count\\} rows\\?/);\n  assert.match(orders, /Undo last change/);\n  assert.match(orders, /Redo last change/);',
    'lock explicit undo redo',
  ],
]);

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const auditTest = 'tests/seiko-stage2-audit-contract.test.mjs';
if (!packageJson.scripts['test:contracts'].includes(auditTest)) {
  packageJson.scripts['test:contracts'] += ` ${auditTest}`;
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
