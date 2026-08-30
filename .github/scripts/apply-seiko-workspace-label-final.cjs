const { readFileSync, writeFileSync } = require('node:fs');

function load(path) {
  const raw = readFileSync(path, 'utf8');
  return { raw, eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
}
function save(path, text, eol) { writeFileSync(path, text.replace(/\n/g, eol)); }
function replaceOne(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Expected pattern not found: ${label}`);
  return text.replace(before, after);
}

{
  const path = 'app/orders.tsx';
  const { text: initial, eol } = load(path);
  let text = initial;
  text = replaceOne(text,
`  const [orderMenuOpen,setOrderMenuOpen]=useState(false);
  const orderMenuRef=useRef<HTMLDivElement>(null);`,
`  const [orderMenuOpen,setOrderMenuOpen]=useState(false);
  const orderMenuRef=useRef<HTMLDivElement>(null);
  const [labelMenuOpen,setLabelMenuOpen]=useState(false);
  const labelMenuRef=useRef<HTMLDivElement>(null);`,
'add label split-menu state');

  text = replaceOne(text,
`  useEffect(()=>{const close=(event:globalThis.MouseEvent)=>{if(orderMenuRef.current&&!orderMenuRef.current.contains(event.target as Node))setOrderMenuOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);`,
`  useEffect(()=>{const close=(event:globalThis.MouseEvent)=>{if(orderMenuRef.current&&!orderMenuRef.current.contains(event.target as Node))setOrderMenuOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);
  useEffect(()=>{const close=(event:globalThis.MouseEvent)=>{if(labelMenuRef.current&&!labelMenuRef.current.contains(event.target as Node))setLabelMenuOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);`,
'close label split-menu outside');

  const start = text.indexOf('    <div className="orderPageHead workspaceHead">');
  const end = text.indexOf('    <section className={`readiness', start);
  if (start < 0 || end < 0) throw new Error('workspace header block not found');
  const header = `    <div className="orderPageHead workspaceHead"><div><p className="eyebrow">ORDER WORKSPACE · {order.status}</p><h2>{order.details.orderNo} · {order.details.clientName}</h2><p>{order.details.clientType} · {order.products.map(item => item.name).filter(Boolean).join(", ")}</p></div><div className="workspaceHeadActions"><label className="workspaceStatusControl"><span>Status</span><select value={order.status} onChange={event => onChange({ ...order, status: event.target.value as OrderStatus })}>{(["Draft", "Active", "On Hold", "Completed", "Cancelled"] as OrderStatus[]).map(status => <option key={status}>{status}</option>)}</select></label><div className="workspaceLabelsSplit" ref={labelMenuRef}><button type="button" className="secondary workspaceLabelsButton" onClick={()=>{setLabelMenuOpen(false);onOpenLabelBatches();}}>Labels</button><button type="button" className="secondary workspaceLabelMenuButton" aria-label="Create label" aria-expanded={labelMenuOpen} onClick={()=>{setOrderMenuOpen(false);setLabelMenuOpen(value=>!value)}}>⌄</button>{labelMenuOpen&&<div className="workspaceLabelMenu"><button onClick={()=>{setLabelMenuOpen(false);onCreateLabel("production")}}>New production label</button><button onClick={()=>{setLabelMenuOpen(false);onCreateLabel("packing")}}>New packing label</button><button onClick={()=>{setLabelMenuOpen(false);onCreateLabel("inventory")}}>New inventory label</button></div>}</div><button type="button" className="primary workspaceQuickSave" onClick={()=>onSave(false)}>Save</button><div ref={orderMenuRef}><button type="button" className="orderActionMenuButton" aria-label="More order actions" aria-expanded={orderMenuOpen} onClick={()=>{setLabelMenuOpen(false);setOrderMenuOpen(value=>!value)}}><span/><span/><span/></button>{orderMenuOpen&&<div className="orderActionMenu"><button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button><div className="orderMenuDivider"/><button disabled={!undoStack.length} onClick={()=>{setOrderMenuOpen(false);undo();}}>Undo last change</button><button disabled={!redoStack.length} onClick={()=>{setOrderMenuOpen(false);redo();}}>Redo last change</button><div className="orderMenuDivider"/><button className="orderMenuPrimary" onClick={()=>{setOrderMenuOpen(false);onSave(true);}}>Save & close</button><button className="orderMenuDanger" onClick={()=>{setOrderMenuOpen(false);onClose();}}>Close without saving</button></div>}</div></div></div>\n`;
  text = text.slice(0, start) + header + text.slice(end);
  text = text.replace(': "All required details are filled in."', ': `${order.records.length} records · all required details are filled in.`');
  save(path, text, eol);
}

{
  const path = 'app/label-designer.tsx';
  const { text: initial, eol } = load(path);
  let text = initial;
  text = replaceOne(text,
'import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";',
'import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";',
'add useCallback');

  const wheelStart = text.indexOf('    useEffect(() => { const hint = document.querySelector(".canvasToolbar span");');
  const wheelEnd = text.indexOf('    const setSourceMode =', wheelStart);
  if (wheelStart < 0 || wheelEnd < 0) throw new Error('label wheel block not found');
  const precision = `    const resizeElement = useCallback((id: string, direction: 1 | -1, coarse = false) => {
        setItems(all => all.map(item => {
            if (item.id !== id) return item;
            if (["text", "field", "sequence"].includes(item.kind)) {
                const step = coarse ? 1 : .25;
                const font = Math.round(clamp(item.font + direction * step, 4, 40) * 4) / 4;
                return { ...item, font };
            }
            if (item.kind === "qr") {
                const step = coarse ? 1 : .25;
                const maxSize = Math.min(preset.labelW - item.x, preset.labelH - item.y);
                const size = Math.round(clamp(item.w + direction * step, 5, maxSize) * 4) / 4;
                return { ...item, w: size, h: size };
            }
            if (item.kind === "barcode") {
                const widthStep = coarse ? 2 : .5;
                const heightStep = coarse ? 1 : .25;
                const w = Math.round(clamp(item.w + direction * widthStep, 8, preset.labelW - item.x) * 4) / 4;
                const h = Math.round(clamp(item.h + direction * heightStep, 4, preset.labelH - item.y) * 4) / 4;
                return { ...item, w, h };
            }
            return item;
        }));
    }, [preset.labelH, preset.labelW]);
    const sizeReadout = (item: Item) => ["text", "field", "sequence"].includes(item.kind)
        ? `${item.font.toFixed(2)} pt`
        : `${item.w.toFixed(2)} × ${item.h.toFixed(2)} mm`;
    useEffect(() => {
        const hint = document.querySelector(".canvasToolbar span");
        if (hint) hint.textContent = "Wheel = precise size · Shift + wheel = larger step";
        let remainder = 0;
        const resizeSelected = (event: globalThis.WheelEvent) => {
            const target = (event.target as Element)?.closest?.(".canvasElement.selected") as HTMLElement | null;
            if (!target) return;
            const id = target.dataset.itemId;
            if (!id) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 120 : event.deltaY;
            remainder += delta;
            const threshold = 72;
            const steps = Math.min(4, Math.floor(Math.abs(remainder) / threshold));
            if (!steps) return;
            const direction: 1 | -1 = remainder < 0 ? 1 : -1;
            remainder -= Math.sign(remainder) * steps * threshold;
            for (let index = 0; index < steps; index++) resizeElement(id, direction, event.shiftKey);
        };
        document.addEventListener("wheel", resizeSelected, { capture: true, passive: false });
        return () => document.removeEventListener("wheel", resizeSelected, true);
    }, [resizeElement]);
`;
  text = text.slice(0, wheelStart) + precision + text.slice(wheelEnd);

  text = replaceOne(text,
`data-item-id={item.id} className={\`canvasElement element-\${item.kind} \${selectedId === item.id ? "selected" : ""}\`} style={{`,
`data-item-id={item.id} data-font-pt={["text", "field", "sequence"].includes(item.kind) ? item.font : undefined} data-size-readout={sizeReadout(item)} className={\`canvasElement element-\${item.kind} \${selectedId === item.id ? "selected" : ""}\`} style={{`,
'add physical size data to preview elements');

  text = replaceOne(text,
`</div></div></main>
 <aside className="labelProperties panel">`,
`</div></div>{selected && <div className="labelPrecisionControls" aria-label="Selected element size controls"><button type="button" onClick={() => resizeElement(selected.id, -1)}>− Shrink</button><output>{sizeReadout(selected)}</output><button type="button" onClick={() => resizeElement(selected.id, 1)}>Stretch +</button><small>Fine step. Hold Shift while using the desktop wheel for the larger step.</small></div>}</main>
 <aside className="labelProperties panel">`,
'add mobile precision size controls');
  save(path, text, eol);
}

{
  const path = 'app/label-finalization.tsx';
  const { text: initial, eol } = load(path);
  let text = initial;
  text = replaceOne(text,
`const DESIGN_PX_PER_MM = 8;
const CSS_PX_PER_PT = 96 / 72;`,
`const CSS_PX_PER_PT = 96 / 72;
const MM_PER_PT = 25.4 / 72;`,
'correct physical typography constants');

  const typoStart = text.indexOf('function syncPreviewTypography(canvas: HTMLElement, labelWidthMm: number) {');
  const typoEnd = text.indexOf('\nfunction ensureCanvasRatio()', typoStart);
  if (typoStart < 0 || typoEnd < 0) throw new Error('preview typography function not found');
  const typo = `function syncPreviewTypography(canvas: HTMLElement, labelWidthMm: number) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !labelWidthMm) return;
  const actualPxPerMm = rect.width / labelWidthMm;
  canvas.style.setProperty("--label-mm-px", `${actualPxPerMm}px`);
  canvas.querySelectorAll<HTMLElement>(".canvasElement.element-text,.canvasElement.element-field,.canvasElement.element-sequence").forEach(element => {
    const directPt = Number.parseFloat(element.dataset.fontPt || "0");
    const fallbackPx = Number.parseFloat(element.style.fontSize || "0");
    const pointSize = directPt || (fallbackPx ? fallbackPx / CSS_PX_PER_PT : 0);
    if (!pointSize) return;
    const responsivePx = pointSize * MM_PER_PT * actualPxPerMm;
    element.style.fontSize = `${responsivePx}px`;
    element.style.lineHeight = "1.05";
  });
}`;
  text = text.slice(0, typoStart) + typo + text.slice(typoEnd);

  text = replaceOne(text,
`    const physicalFontMm = logicalFont * CSS_PX_PER_PT / DESIGN_PX_PER_MM;`,
`    const physicalFontMm = logicalFont * MM_PER_PT;`,
'print text at real point size');
  save(path, text, eol);
}
