"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Module = "home" | "labels" | "scan" | "trace";
type LabelMode = "INFO" | "BARCODE" | "QR" | "INFO_BARCODE" | "INFO_QR";
type ScanEvent = { id: string; token: string; operation: string; at: string; status: "SYNCED" | "PENDING" | "REJECTED" };

const demoRecords = [
  { id: "p1", name: "Arushi", group: "Class BV", product: "Collared T Shirt", size: "28", qty: "2", token: "S2A7C084DCB1E743AB94" },
  { id: "p2", name: "Evanshi", group: "Class BV", product: "Track Pant", size: "30", qty: "2", token: "S2642D4E2009494FDBB5" },
  { id: "p3", name: "Mokshi", group: "Class AV", product: "Collared T Shirt", size: "26", qty: "1", token: "S2324F4C2E0A734EF08F" },
];

const operations = ["Cutting complete", "Start stitching", "Stitching complete", "Finishing complete", "Packed", "Challan created", "Dispatched", "Delivered"];

export default function Home() {
  const [module, setModule] = useState<Module>("home");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    const queue = JSON.parse(localStorage.getItem("seiko-scan-queue") || "[]"); setPending(queue.length);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  return <div className="app">
    <aside className="rail">
      <button className="brand" onClick={() => setModule("home")} aria-label="Seiko Operations home"><span>S</span><b>SEIKO</b></button>
      <Nav icon="⌂" label="Overview" active={module === "home"} onClick={() => setModule("home")} />
      <Nav icon="▤" label="Labels" active={module === "labels"} onClick={() => setModule("labels")} />
      <Nav icon="⌗" label="Scan" active={module === "scan"} onClick={() => setModule("scan")} />
      <Nav icon="◎" label="Trace" active={module === "trace"} onClick={() => setModule("trace")} />
      <div className="railFuture"><span>Production</span><span>Sales</span><span>Delivery</span></div>
    </aside>
    <div className="surface">
      <header className="topbar"><div><p className="eyebrow">SEIKO SYSTEM V2</p><h1>{title(module)}</h1></div><div className="topActions"><span className={`network ${online ? "online" : "offline"}`}>{online ? "Online" : "Offline"}</span>{pending > 0 && <span className="queue">{pending} waiting</span>}<button className="avatar" aria-label="Owner account">JP</button></div></header>
      <main>{module === "home" && <Overview onOpen={setModule} />}{module === "labels" && <Labels />}{module === "scan" && <Scanner onPending={setPending} />}{module === "trace" && <Trace />}</main>
    </div>
  </div>;
}

function Nav({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span><small>{label}</small></button>;
}

function title(m: Module) { return ({ home: "Operations", labels: "Create labels", scan: "Scan & record", trace: "Track & trace" } as const)[m]; }

function Overview({ onOpen }: { onOpen: (m: Module) => void }) {
  return <div className="page overview">
    <section className="hero"><div><span className="kicker">OPERATIONAL FOUNDATION</span><h2>One reliable path from order to delivery.</h2><p>Labels create the identity. Every scan adds evidence. Track & Trace shows the complete business history.</p></div><button className="primary heroButton" onClick={() => onOpen("scan")}>Start scanning <span>→</span></button></section>
    <div className="moduleGrid">
      <ModuleCard number="01" title="Labels" text="Information, barcode, QR, or combined 50 × 25 mm labels." action="Design labels" onClick={() => onOpen("labels")} />
      <ModuleCard number="02" title="Scan" text="Phone camera and scan-gun input with offline protection." action="Open scanner" onClick={() => onOpen("scan")} />
      <ModuleCard number="03" title="Trace" text="Browse an item’s identity, status and complete event history." action="Search history" onClick={() => onOpen("trace")} />
    </div>
    <section className="nextFlow"><div><span>COMING NEXT</span><h3>Production → Packing → Invoice → Delivery</h3></div><p>Each module will use the same identities and event history. No disconnected records, duplicate logic or rebuilding.</p></section>
  </div>;
}

function ModuleCard({ number, title, text, action, onClick }: { number: string; title: string; text: string; action: string; onClick: () => void }) {
  return <button className="moduleCard" onClick={onClick}><span className="moduleNo">{number}</span><h3>{title}</h3><p>{text}</p><b>{action} →</b></button>;
}

function Labels() {
  const [mode, setMode] = useState<LabelMode>("INFO_QR");
  const [selected, setSelected] = useState<string[]>(["p1"]);
  const [fields, setFields] = useState({ name: true, group: true, product: true, size: true, qty: false });
  const [names, setNames] = useState({ name: false, group: false, product: true, size: true, qty: true });
  const current = demoRecords.find(r => selected.includes(r.id)) || demoRecords[0];
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return <div className="page labelsPage">
    <div className="toolbar"><div className="selectGroup"><label>Order</label><select><option>I-26-27-08-009 — Test 10</option></select></div><div className="selectGroup"><label>Label content</label><select value={mode} onChange={e => setMode(e.target.value as LabelMode)}><option value="INFO">Information only</option><option value="BARCODE">Barcode only</option><option value="QR">QR only</option><option value="INFO_BARCODE">Information + barcode</option><option value="INFO_QR">Information + QR</option></select></div><button className="secondary">Saved layouts</button></div>
    <div className="labelWorkspace">
      <section className="records panel"><div className="panelHead"><div><p className="eyebrow">RECORDS</p><h3>{selected.length} selected</h3></div><button className="textButton" onClick={() => setSelected(selected.length === demoRecords.length ? [] : demoRecords.map(r => r.id))}>Select all</button></div>{demoRecords.map(r => <button key={r.id} onClick={() => toggle(r.id)} className={`record ${selected.includes(r.id) ? "selected" : ""}`}><span className="check">{selected.includes(r.id) ? "✓" : ""}</span><span><b>{r.name}</b><small>{r.group} · {r.product} · {r.size}</small></span></button>)}</section>
      <section className="fields panel"><div className="panelHead"><div><p className="eyebrow">FIELDS</p><h3>Content & names</h3></div></div>{Object.keys(fields).map(key => <div className="fieldRow" key={key}><label><input type="checkbox" checked={fields[key as keyof typeof fields]} onChange={e => setFields({ ...fields, [key]: e.target.checked })}/><b>{pretty(key)}</b></label><label className="nameToggle"><input type="checkbox" checked={names[key as keyof typeof names]} disabled={!fields[key as keyof typeof fields]} onChange={e => setNames({ ...names, [key]: e.target.checked })}/> Show field name</label></div>)}<button className="secondary full">+ Free text</button></section>
      <section className="designer panel"><div className="panelHead"><div><p className="eyebrow">LIVE 50 × 25 MM PREVIEW</p><h3>Drag elements to position</h3></div><div className="miniTools"><button>A−</button><button>A+</button><button>B</button></div></div><div className="labelStage"><div className="labelPaper"><div className="safeArea">{(mode === "INFO" || mode.startsWith("INFO_")) && <div className="labelInfo">{Object.entries(fields).filter(([,v]) => v).map(([key]) => <div key={key}>{names[key as keyof typeof names] && <strong>{pretty(key)}: </strong>}{current[key as keyof typeof current]}</div>)}</div>}{(mode === "QR" || mode === "INFO_QR") && <div className="qr">▦</div>}{(mode === "BARCODE" || mode === "INFO_BARCODE") && <div className="barcode" />}</div></div></div><div className="designerFoot"><input placeholder="Layout name"/><button className="secondary">Save layout</button><button className="primary">Preview & print {selected.length}</button></div></section>
    </div>
  </div>;
}

function Scanner({ onPending }: { onPending: (n: number) => void }) {
  const [operation, setOperation] = useState(operations[0]); const [token, setToken] = useState(""); const [events, setEvents] = useState<ScanEvent[]>([]); const [camera, setCamera] = useState(false); const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null);
  const submit = (value = token) => { const clean = value.trim(); if (!clean) return; const event: ScanEvent = { id: crypto.randomUUID(), token: clean, operation, at: new Date().toLocaleTimeString("en-IN"), status: navigator.onLine ? "SYNCED" : "PENDING" }; setEvents(e => [event, ...e]); if (!navigator.onLine) { const q = JSON.parse(localStorage.getItem("seiko-scan-queue") || "[]"); q.push(event); localStorage.setItem("seiko-scan-queue", JSON.stringify(q)); onPending(q.length); } setToken(""); if (navigator.vibrate) navigator.vibrate(70); };
  const toggleCamera = async () => { if (camera) { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCamera(false); return; } try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); setCamera(true); setTimeout(() => { if (video.current && stream.current) video.current.srcObject = stream.current; }, 0); } catch { alert("Camera permission was not granted. Open the app directly in Safari or Chrome, or use a scan gun/manual code."); } };
  useEffect(() => () => stream.current?.getTracks().forEach(t => t.stop()), []);
  return <div className="page scanPage"><div className="scanGrid"><section className="scanControl panel"><p className="eyebrow">OPERATION</p><div className="operationGrid">{operations.map(o => <button className={o === operation ? "active" : ""} key={o} onClick={() => setOperation(o)}>{o}</button>)}</div><label className="scanLabel">Scan code</label><div className="scanInput"><input autoFocus value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Camera, scan gun or paste token"/><button onClick={() => submit()}>Record</button></div><button className={`cameraButton ${camera ? "stop" : ""}`} onClick={toggleCamera}>{camera ? "Stop camera" : "Open mobile camera"}</button>{camera && <div className="camera"><video ref={video} autoPlay playsInline muted/><div className="scanFrame"/><p>Point the camera at a QR or barcode</p></div>}<p className="hint">Scan guns work automatically as keyboard input. Offline scans remain on this device and synchronize when connection returns.</p></section><section className="activity panel"><div className="panelHead"><div><p className="eyebrow">THIS SESSION</p><h3>{events.length} scans</h3></div><span className="liveDot">● LIVE</span></div>{events.length === 0 ? <div className="empty"><span>⌗</span><b>Ready for the first scan</b><p>The result and item identity will appear here immediately.</p></div> : events.map(e => <div className="event" key={e.id}><span className={`eventIcon ${e.status.toLowerCase()}`}>✓</span><div><b>{e.operation}</b><small>{e.token}</small></div><time>{e.at}</time></div>)}</section></div></div>;
}

function Trace() {
  const [query, setQuery] = useState(""); const rows = useMemo(() => demoRecords.filter(r => Object.values(r).join(" ").toLowerCase().includes(query.toLowerCase())), [query]); const [current, setCurrent] = useState(demoRecords[0]);
  return <div className="page tracePage"><div className="traceSearch"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search order, client, person, product or scan code"/></div><div className="traceGrid"><section className="panel traceResults"><p className="eyebrow">MATCHING IDENTITIES</p>{rows.map(r => <button className={current.id === r.id ? "active" : ""} key={r.id} onClick={() => setCurrent(r)}><b>{r.name}</b><span>{r.product} · Size {r.size}</span><small>{r.token}</small></button>)}</section><section className="panel traceDetail"><div className="identity"><div><p className="eyebrow">CURRENT IDENTITY</p><h2>{current.name}</h2><p>{current.product} · Size {current.size} · Qty {current.qty}</p></div><span className="status">STITCHING</span></div><div className="timeline"><Timeline title="Identity created" text="Order I-26-27-08-009 · Test 10" time="13 Aug, 10:14"/><Timeline title="Cutting complete" text="Floor · authorized operation" time="13 Aug, 15:42"/><Timeline title="Stitching started" text="Operator record verified" time="14 Aug, 09:18" active/></div></section></div></div>;
}

function Timeline({ title, text, time, active = false }: { title: string; text: string; time: string; active?: boolean }) { return <div className={`timelineRow ${active ? "active" : ""}`}><span/><div><b>{title}</b><p>{text}</p></div><time>{time}</time></div>; }
function pretty(v: string) { return ({ name: "Name", group: "Class / group", product: "Product", size: "Size", qty: "Quantity" } as Record<string,string>)[v] || v; }
