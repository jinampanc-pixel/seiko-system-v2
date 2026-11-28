import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
test('dropdowns use the same filled downward ❯ silhouette in SVGs and CSS masks',()=>{
 const path=read('app/lib/chevrons.ts').match(/CHEVRON_DOWN_PATH="([^"]+)"/)[1],css=read('app/chevron-consistency.css').replace(/data:image\/svg\+xml,([^"]+)/g,(_url,data)=>decodeURIComponent(data));
 assert.ok(css.includes(path));assert.match(read('app/ui-icons.tsx'),/d=\{CHEVRON_DOWN_PATH\}/);assert.match(read('app/ui-icons.tsx'),/className="appChevron"/);assert.match(css,/--app-chevron-size:14px/);
 assert.match(read('app/layout.tsx'),/chevron-consistency\.css/);assert.match(read('app/ui-icons.tsx'),/chevron-consistency\.css/);
 assert.match(css,/select:not\(\[multiple\]\):not\(\[size\]\)/);assert.match(css,/\.seikoRowActionMenu/);assert.match(css,/summary::marker\{content:""/);assert.match(css,/rotate\(180deg\)/);
});
test('custom controls no longer render mixed text-chevron glyphs',()=>{
 const files=fs.readdirSync('app',{recursive:true}).filter(path=>String(path).endsWith('.tsx'));
 for(const file of files)assert.doesNotMatch(read('app/'+file),/[⌄⌃▾▿▸▼›]/,String(file));
});
