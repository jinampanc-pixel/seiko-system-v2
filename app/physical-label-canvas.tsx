"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { bound, constrainBox, MM_PX, moveBox, outsideSafeArea, resizeBox, type LabelBox } from "./lib/packing-label-model";

export type PhysicalItem = LabelBox & { id: string; label: string; font: number; bold: boolean; align?: "left" | "center" | "right" };

export function PhysicalLabelCanvas<T extends PhysicalItem>({ items, onChange, renderItem, children, onGesture }: {
  items: T[]; onChange: (items: T[]) => void; renderItem: (item: T) => ReactNode; children?: ReactNode; onGesture: (active: boolean) => void;
}) {
  const [selectedId, select] = useState("");
  const [zoom, setZoom] = useState(3);
  const [fit, setFit] = useState(true);
  const [snap, setSnap] = useState(true);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ item: T; x: number; y: number; resize: boolean } | null>(null);
  const selected = items.find(item => item.id === selectedId);
  useLayoutEffect(() => {
    if (!fit || !stage.current) return;
    const update = () => setZoom(bound((stage.current!.clientWidth - 48) / (50 * MM_PX), .5, 5));
    update();
    const observer = new ResizeObserver(update); observer.observe(stage.current);
    return () => observer.disconnect();
  }, [fit]);
  const update = (item: T) => onChange(items.map(candidate => candidate.id === item.id ? constrainBox(item) : candidate));
  const arrange = () => {
    const gap = .5, row = (23 - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
    onChange(items.map((item, i) => constrainBox({ ...item, x: 1, y: 1 + i * (row + gap), w: 48, h: Math.max(1, row) })));
  };
  return <>
    <div className="physicalTools">
      <b>50 × 25 mm</b><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/>1 mm snap</label>
      <button onClick={() => setFit(true)}>Fit</button><label>Zoom <select aria-label="Canvas zoom" value={fit ? "fit" : zoom} onChange={e => { setFit(false); setZoom(Number(e.target.value)); }}>
        {fit && <option value="fit">Fit ({Math.round(zoom * 100)}%)</option>}{[.5, 1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></label>
      <button onClick={arrange}>Auto-arrange</button>{children}
    </div>
    <p className="physicalHint">Drag to move · corner handle to resize · arrows move 1 mm (Shift: 0.1 mm) · dashed edge is the 1 mm print margin</p>
    <div className="physicalStage" ref={stage}>
      <div style={{ width: 50 * MM_PX * zoom, height: 25 * MM_PX * zoom, flexShrink: 0 }}>
        <div className="physicalCanvas" tabIndex={0} aria-label="50 by 25 millimetre label editor" style={{ width: `${50 * MM_PX}px`, height: `${25 * MM_PX}px`, transform: `scale(${zoom})` }} onPointerDown={() => select("")}
          onKeyDown={event => {
            if (!selected || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(event.key)) return;
            event.preventDefault();
            if (event.key === "Delete" || event.key === "Backspace") { onChange(items.filter(item => item.id !== selected.id)); select(""); return; }
            const step = event.shiftKey ? .1 : 1;
            update(moveBox(selected, event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0, false));
          }}>
          <div className="physicalSafeArea"/>
          {items.map(item => <div key={item.id} role="button" tabIndex={0} aria-label={`Edit ${item.label}`} aria-pressed={selectedId === item.id} className={`physicalItem ${selectedId === item.id ? "active" : ""}`} data-item-id={item.id}
            style={{ left: item.x * MM_PX, top: item.y * MM_PX, width: item.w * MM_PX, height: item.h * MM_PX }}
            onFocus={() => select(item.id)}
            onPointerDown={event => { event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); select(item.id); onGesture(true); drag.current = { item, x: event.clientX, y: event.clientY, resize: (event.target as HTMLElement).dataset.resize === "true" }; }}
            onPointerMove={event => {
              const start = drag.current; if (!start || start.item.id !== item.id) return;
              const dx = (event.clientX - start.x) / (MM_PX * zoom), dy = (event.clientY - start.y) / (MM_PX * zoom);
              let next = start.resize ? resizeBox(start.item, dx, dy, snap) : moveBox(start.item, dx, dy, snap);
              const targetsX = [1, 25, 49, ...items.filter(other => other.id !== item.id).flatMap(other => [other.x, other.x + other.w / 2, other.x + other.w])];
              const targetsY = [1, 12.5, 24, ...items.filter(other => other.id !== item.id).flatMap(other => [other.y, other.y + other.h / 2, other.y + other.h])];
              const x = targetsX.find(value => [next.x, next.x + next.w / 2, next.x + next.w].some(edge => Math.abs(value - edge) < .2));
              const y = targetsY.find(value => [next.y, next.y + next.h / 2, next.y + next.h].some(edge => Math.abs(value - edge) < .2));
              setGuides({ x, y }); update(next);
            }}
            onPointerUp={() => { drag.current = null; setGuides({}); onGesture(false); }} onPointerCancel={() => { drag.current = null; setGuides({}); onGesture(false); }}>
            {renderItem(item)}{selectedId === item.id && <span className="physicalHandle" data-resize="true" aria-label="Resize selected field"/>}
          </div>)}
          {guides.x != null && <div className="physicalGuide vertical" style={{ left: guides.x * MM_PX }}/>}{guides.y != null && <div className="physicalGuide horizontal" style={{ top: guides.y * MM_PX }}/>}
        </div>
      </div>
    </div>
    {selected && <div className="physicalInspector"><b>{selected.label}</b>{(["x", "y", "w", "h", "font"] as const).map(key => <label key={key}>{({ x: "X (mm)", y: "Y (mm)", w: "Width (mm)", h: "Height (mm)", font: "Font (pt)" })[key]}<input aria-label={key} type="number" step={key === "font" ? .25 : 1} min={key === "x" || key === "y" ? 0 : 1} value={Number(selected[key].toFixed(2))} onChange={e => update({ ...selected, [key]: key === "font" ? bound(Number(e.target.value), 1, 40) : Number(e.target.value) })}/></label>)}<label>Alignment<select aria-label="Text alignment" value={selected.align || "left"} onChange={e => update({ ...selected, align: e.target.value as T["align"] })}><option>left</option><option>center</option><option>right</option></select></label><button onClick={() => update({ ...selected, bold: !selected.bold })} aria-pressed={selected.bold}>Bold</button><button onClick={() => onChange(items.filter(item => item.id !== selected.id))}>Remove</button></div>}
    {items.some(outsideSafeArea) && <p role="status" className="physicalWarning">Some fields enter the 1 mm print margin. Move them inside the dashed area to avoid printer clipping.</p>}
  </>;
}
