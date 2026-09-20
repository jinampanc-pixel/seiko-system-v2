"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent } from "react";
import { constrainBox, MM_PX, moveBox, outsideSafeArea, stretchTextBox, scaleTextBox, type LabelBox } from "./lib/packing-label-model";
export type PhysicalItem = LabelBox & { id: string; label: string; font: number; bold: boolean; align?: "left" | "center" | "right" };
const edges = { nw: "top left", n: "top", ne: "top right", e: "right", se: "bottom right", s: "bottom", sw: "bottom left", w: "left" };
export function PhysicalLabelCanvas<T extends PhysicalItem>({ items, onChange, renderItem, children, onGesture }: {
  items: T[]; onChange: (items: T[]) => void; renderItem: (item: T) => ReactNode; children?: ReactNode; onGesture: (active: boolean) => void;
}) {
  const [selectedId, select] = useState("");
  const [zoom, setZoom] = useState(3), [fit, setFit] = useState(true), [snap, setSnap] = useState(true);
  const [dragging, setDragging] = useState(false), [overTrash, setOverTrash] = useState(false);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const stage = useRef<HTMLDivElement>(null), trash = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ item: T; x: number; y: number; edge: string; pinch?: number } | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ items, onChange, onGesture }); latest.current = { items, onChange, onGesture };
  const selected = items.find(item => item.id === selectedId);
  const update = (item: T) => latest.current.onChange(latest.current.items.map(candidate => candidate.id === item.id ? constrainBox(item) : candidate));
  const endWheel = () => { if (wheelTimer.current) { clearTimeout(wheelTimer.current); wheelTimer.current = null; latest.current.onGesture(false); } };
  useEffect(() => () => { if (wheelTimer.current) clearTimeout(wheelTimer.current); }, []);
  useLayoutEffect(() => {
    if (!fit || !stage.current) return;
    const updateZoom = () => setZoom(Math.max(.5, Math.min(5, (stage.current!.clientWidth - 48) / (50 * MM_PX))));
    updateZoom(); const observer = new ResizeObserver(updateZoom); observer.observe(stage.current); return () => observer.disconnect();
  }, [fit]);
  useEffect(() => {
    const element = stage.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".physicalItem");
      const item = latest.current.items.find(candidate => candidate.id === target?.dataset.itemId);
      if (!item || drag.current || event.deltaY === 0) return;
      event.preventDefault(); select(item.id);
      if (!wheelTimer.current) latest.current.onGesture(true); else clearTimeout(wheelTimer.current);
      update(scaleTextBox(item, event.deltaY < 0 ? 1.06 : 1 / 1.06));
      wheelTimer.current = setTimeout(() => { wheelTimer.current = null; latest.current.onGesture(false); }, 220);
    };
    element.addEventListener("wheel", wheel, { passive: false }); return () => element.removeEventListener("wheel", wheel);
  }, []);
  const distance = () => { const [a, b] = [...pointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const inTrash = (x: number, y: number) => { const box = trash.current?.getBoundingClientRect(); return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom; };
  const finish = (event: PointerEvent, cancelled = false) => {
    const start = drag.current; if (!start) return;
    if (!cancelled && !start.edge && !start.pinch && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 && inTrash(event.clientX, event.clientY)) { latest.current.onChange(latest.current.items.filter(item => item.id !== start.item.id)); select(""); }
    pointers.current.clear(); drag.current = null; setDragging(false); setOverTrash(false); setGuides({}); latest.current.onGesture(false);
  };
  const arrange = () => {
    endWheel(); const gap = .7, available = 23 - gap * Math.max(0, items.length - 1);
    const scale = Math.min(1, available / Math.max(1, items.reduce((sum, item) => sum + item.h, 0))); let y = 1;
    onChange(items.map(item => { const factor = Math.min(scale, 48 / item.w); const next = constrainBox({ ...item, x: 1, y, w: item.w * factor, h: item.h * factor, font: item.font * factor }); y += next.h + gap; return next; }));
  };
  return <>
    <div className="physicalTools"><b>50 × 25 mm</b><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/>1 mm snap</label>
      <button onClick={() => setFit(true)}>Fit</button><label>Zoom <select aria-label="Canvas zoom" value={fit ? "fit" : zoom} onChange={e => { setFit(false); setZoom(Number(e.target.value)); }}>
        {fit && <option value="fit">Fit ({Math.round(zoom * 100)}%)</option>}{[.5, 1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></label>
      <button onClick={arrange}>Auto-arrange</button><span onPointerDown={endWheel}>{children}</span>
    </div>
    <p className="physicalHint">Drag to move · stretch any edge to resize text · scroll or pinch a field to scale · drag to the bin to remove</p>
    <div className="physicalStage" ref={stage}><div style={{ width: 50 * MM_PX * zoom, height: 25 * MM_PX * zoom, flexShrink: 0 }}>
      <div className="physicalCanvas" tabIndex={0} aria-label="50 by 25 millimetre label editor" style={{ width: 50 * MM_PX, height: 25 * MM_PX, transform: `scale(${zoom})`, "--handle-size": `${10 / zoom}px`, "--handle-hit": `${24 / zoom}px` } as CSSProperties} onPointerDown={() => select("")}
        onKeyDown={event => {
          if (!selected || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key)) return;
          event.preventDefault(); endWheel();
          if (event.key === "Delete" || event.key === "Backspace") { onChange(items.filter(item => item.id !== selected.id)); select(""); return; }
          const step = event.shiftKey ? .1 : 1;
          update(moveBox(selected, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0, false));
        }}>
        <div className="physicalSafeArea"/>
        {items.map(item => <div key={item.id} role="button" tabIndex={0} aria-label={`Edit ${item.label}`} aria-pressed={selectedId === item.id} className={`physicalItem ${selectedId === item.id ? "active" : ""}`} data-item-id={item.id}
          style={{ left: item.x * MM_PX, top: item.y * MM_PX, width: item.w * MM_PX, height: item.h * MM_PX }} onFocus={() => select(item.id)}
          onPointerDown={event => {
            event.preventDefault(); event.stopPropagation(); endWheel(); if (drag.current && drag.current.item.id !== item.id) return;
            event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); select(item.id);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (!drag.current) { onGesture(true); drag.current = { item, x: event.clientX, y: event.clientY, edge: (event.target as HTMLElement).dataset.edge || "" }; setDragging(true); }
            if (pointers.current.size === 2) drag.current = { item, x: event.clientX, y: event.clientY, edge: "", pinch: distance() };
          }}
          onPointerMove={event => {
            const start = drag.current; if (!start || start.item.id !== item.id || !pointers.current.has(event.pointerId)) return;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (start.pinch) { update(scaleTextBox(start.item, distance() / start.pinch)); return; }
            const dx = (event.clientX - start.x) / (MM_PX * zoom), dy = (event.clientY - start.y) / (MM_PX * zoom);
            const next = start.edge ? stretchTextBox(start.item, start.edge, dx, dy) : moveBox(start.item, dx, dy, snap);
            setOverTrash(!start.edge && inTrash(event.clientX, event.clientY));
            const other = items.filter(candidate => candidate.id !== item.id);
            const x = [1, 25, 49, ...other.flatMap(candidate => [candidate.x, candidate.x + candidate.w])].find(value => Math.abs(next.x - value) < .2);
            const y = [1, 12.5, 24, ...other.flatMap(candidate => [candidate.y, candidate.y + candidate.h])].find(value => Math.abs(next.y - value) < .2);
            setGuides({ x, y }); update(next);
          }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}>
          {renderItem(item)}{selectedId === item.id && Object.entries(edges).map(([edge, name]) => <span key={edge} className={`physicalHandle handle-${edge}`} data-edge={edge} aria-label={`Resize ${name}`}/>)}
        </div>)}
        {guides.x != null && <div className="physicalGuide vertical" style={{ left: guides.x * MM_PX }}/>}{guides.y != null && <div className="physicalGuide horizontal" style={{ top: guides.y * MM_PX }}/>}
      </div></div></div>
    <div ref={trash} className={`physicalTrash ${dragging ? "visible" : ""} ${overTrash ? "over" : ""}`} aria-hidden={!dragging}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>{overTrash ? "Release to remove" : "Drop here to remove"}</div>
    {selected && <div className="physicalInspector"><b>{selected.label}</b>{(["x", "y", "w", "h", "font"] as const).map(key => <label key={key}>{({ x: "X (mm)", y: "Y (mm)", w: "Width (mm)", h: "Height (mm)", font: "Font (pt)" })[key]}<input aria-label={key} type="number" step={key === "font" ? .25 : .1} min={key === "x" || key === "y" ? 0 : 1} value={Number(selected[key].toFixed(2))} onChange={e => {
      endWheel(); const value = Number(e.target.value); if (!Number.isFinite(value) || value < 0) return;
      update(key === "font" ? scaleTextBox(selected, value / selected.font) : key === "w" ? stretchTextBox(selected, "e", value - selected.w, 0) : key === "h" ? stretchTextBox(selected, "s", 0, value - selected.h) : { ...selected, [key]: value });
    }}/></label>)}<label>Alignment<select aria-label="Text alignment" value={selected.align || "left"} onChange={e => update({ ...selected, align: e.target.value as T["align"] })}><option>left</option><option>center</option><option>right</option></select></label><button onClick={() => update({ ...selected, bold: !selected.bold })} aria-pressed={selected.bold}>Bold</button><button onClick={() => onChange(items.filter(item => item.id !== selected.id))}>Remove</button></div>}
    {items.some(outsideSafeArea) && <p role="status" className="physicalWarning">Some fields enter the 1 mm print margin. Your layout is preserved; check your printer’s printable area.</p>}
  </>;
}
