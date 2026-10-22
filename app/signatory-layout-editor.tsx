"use client";
import { useRef, useState } from "react";
import type { SeikoCommercialDocument, SignatoryLayout, SignatoryPlacement } from "./lib/seiko-billing";

type Part = keyof SignatoryLayout;
const defaults: SignatoryLayout = {
  signature: { x: 5, y: 20, width: 48, height: 38 },
  stamp: { x: 62, y: 5, width: 35, height: 58 },
  name: { x: 30, y: 74, width: 68, height: 24 },
};
const bounded = (p: SignatoryPlacement): SignatoryPlacement => ({ ...p, x: Math.max(0, Math.min(100-p.width,p.x)), y: Math.max(0, Math.min(100-p.height,p.y)) });
export function SignatoryLayoutEditor({ signatory, onChange }: { signatory: NonNullable<SeikoCommercialDocument["signatory"]>; onChange: (layout: SignatoryLayout) => void }) {
  const layout = signatory.layout || defaults;
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ part: Part; x: number; y: number; initial: SignatoryPlacement } | null>(null);
  const [selected,setSelected] = useState<Part>("signature");
  function place(part: Part, placement: SignatoryPlacement) { onChange({...layout,[part]:bounded(placement)}); }
  return <section className="billingFull signatoryLayoutEditor" aria-label="Signatory arrangement">
    <h4>Arrange signature, stamp & name</h4>
    <p>Drag each item to place it. Select an item to resize it, or use arrow keys to move it. Save settings to keep this arrangement for future documents.</p>
    <div ref={stage} className="signatoryLayoutCanvas" aria-label="Signatory layout preview">
      {(["stamp","signature","name"] as Part[]).map(part => <button key={part} type="button" aria-label={`Position ${part}`} aria-pressed={selected===part} className="signatoryLayoutPart" style={{left:layout[part].x+"%",top:layout[part].y+"%",width:layout[part].width+"%",height:layout[part].height+"%",zIndex:part==="signature"?2:part==="name"?3:1}}
        onPointerDown={event=>{event.preventDefault();event.currentTarget.focus();setSelected(part);drag.current={part,x:event.clientX,y:event.clientY,initial:{...layout[part]}};event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerMove={event=>{const active=drag.current,box=stage.current?.getBoundingClientRect();if(!active||active.part!==part||!box)return;place(part,{...active.initial,x:active.initial.x+(event.clientX-active.x)/box.width*100,y:active.initial.y+(event.clientY-active.y)/box.height*100});}}
        onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
        onKeyDown={event=>{const delta=event.shiftKey?5:1;const moves:Record<string,[number,number]>={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};const move=moves[event.key];if(move){event.preventDefault();event.stopPropagation();setSelected(part);place(part,{...layout[part],x:layout[part].x+move[0],y:layout[part].y+move[1]});}}}>
        {part==="name"?<span><strong>{signatory.name||"Signatory name"}</strong><br/>{signatory.designation||"Designation"}</span>:signatory[part]?<img draggable={false} src={signatory[part]} alt={`${part} placement preview`}/>:<span>Upload {part} image</span>}
      </button>)}
    </div>
    <div className="signatoryLayoutControls">
      <label>Selected item<select value={selected} onChange={e=>setSelected(e.target.value as Part)}><option value="signature">Signature</option><option value="stamp">Stamp</option><option value="name">Name & designation</option></select></label>
      <label>Width %<input type="range" min="15" max="100" value={layout[selected].width} onChange={e=>place(selected,{...layout[selected],width:Number(e.target.value)})}/></label>
      <label>Height %<input type="range" min="10" max="80" value={layout[selected].height} onChange={e=>place(selected,{...layout[selected],height:Number(e.target.value)})}/></label>
      <button type="button" className="secondary" onClick={()=>onChange(structuredClone(defaults))}>Reset arrangement</button>
    </div>
  </section>;
}
