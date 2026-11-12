"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAccess } from "./access-control";
import { acceptSharedOrder, type OrderEnvelope } from "./lib/order-commands";

type Proposal = { id: string; tool: string; review: unknown };
type Entry = { role: "user" | "assistant"; text: string; sources?: { tool: string; data: unknown; checkedAt: string }[] };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
type Result = { ok: boolean; message?: string; conversationId?: string; enabled?: boolean; proposal?: Proposal; sources?: Entry["sources"]; memories?: { id: string; content: string }[]; receipt?: { result?: { data?: OrderEnvelope } } };

export function BusinessAssistant({ businessId, module, orderId, onOpenOrder }: { businessId: string; module: string; orderId?: string; onOpenOrder: (order: OrderEnvelope["order"]) => void }) {
  const { session } = useAccess();
  const [open, setOpen] = useState(false), [entries, setEntries] = useState<Entry[]>([]), [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState(""), [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [enabled, setEnabled] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false), [memories, setMemories] = useState<{ id: string; content: string }[]>([]);
  const [language, setLanguage] = useState("gu-IN"), [listening, setListening] = useState(false), [savedOrder, setSavedOrder] = useState<OrderEnvelope["order"] | null>(null);
  const recognition = useRef<Recognition | null>(null), end = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null), field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { recognition.current?.abort(); controller.current?.abort(); }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && open && !busy) { recognition.current?.abort(); setOpen(false); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, busy]);
  useEffect(() => { if (open) { field.current?.focus(); end.current?.scrollIntoView({ block: "nearest" }); } }, [open, entries, proposal]);
  async function request(payload: Record<string, unknown>): Promise<Result> {
    const abort = new AbortController(); controller.current = abort;
    const response = await fetch("/api/erp/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, businessId }), signal: abort.signal, redirect: "error" });
    return await response.json() as Result;
  }
  async function show() {
    setOpen(true);
    try { const result = await request({ operation: "status" }); setEnabled(Boolean(result.enabled)); setNotice(result.message || ""); }
    catch { setNotice("Assistant connection is unavailable. Your app remains available."); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!input.trim() || busy || !enabled) return;
    recognition.current?.stop();
    const message = input.trim(); setInput(""); setProposal(null); setSavedOrder(null); setBusy(true); setNotice("");
    setEntries(previous => [...previous, { role: "user", text: message }]);
    try {
      const result = await request({ operation: "chat", conversationId, message, context: { module, orderId } });
      if (result.conversationId) setConversationId(result.conversationId);
      setEntries(previous => [...previous, { role: "assistant", text: result.message || "No answer was returned.", sources: result.sources }]);
      if (result.proposal) setProposal(result.proposal);
    } catch { setInput(message); setNotice("The reply could not be retrieved. Your message is available to retry. No confirmation was sent."); }
    finally { setBusy(false); }
  }
  async function decide(confirm: boolean) {
    if (!proposal || busy) return;
    setBusy(true); setNotice("");
    try {
      const result = await request({ operation: confirm ? "confirm" : "cancel", conversationId, proposalId: proposal.id });
      setNotice(result.message || "Action completed.");
      setProposal(null);
      const envelope = result.receipt?.result?.data;
      if (result.ok && envelope?.order) { acceptSharedOrder(businessId, envelope); setSavedOrder(envelope.order); }
    } catch { setNotice("The result could not be retrieved. Check the record before retrying. Repeating confirmation uses the same action ID to prevent a duplicate save."); }
    finally { setBusy(false); }
  }
  async function showMemories() {
    setMemoryOpen(value => !value);
    try { const result = await request({ operation: "memories" }); setMemories(result.memories || []); }
    catch { setNotice("Memories could not be loaded."); }
  }
  async function forget(memoryId: string) {
    setBusy(true);
    try { const result = await request({ operation: "forget_proposal", conversationId, memoryId }); if (result.conversationId) setConversationId(result.conversationId); if (result.proposal) { setProposal(result.proposal); setMemoryOpen(false); } else setNotice(result.message || "Memory could not be selected."); }
    catch { setNotice("Memory could not be selected."); }
    finally { setBusy(false); }
  }
  function microphone() {
    if (listening) { recognition.current?.stop(); return; }
    const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    if (!Constructor) { setNotice("Voice input is unavailable in this browser. You can type your request."); return; }
    const instance = new Constructor(); instance.lang = language; instance.continuous = true; instance.interimResults = false;
    instance.onresult = event => { const parts = Array.from(event.results).filter(r => r.isFinal).map(r => r[0].transcript); setInput(previous => (previous + " " + parts.at(-1)).trim()); };
    instance.onerror = () => { setListening(false); setNotice("Voice input stopped. Check microphone permission or type your request."); };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try { instance.start(); setListening(true); setNotice("Listening. Review the transcript before sending. Voice recognition is provided by your browser."); } catch { setNotice("Microphone could not start."); }
  }
  if (!session) return null;
  return <>
    {!open && <button className="assistantLauncher" onClick={show} aria-label="Open business assistant">✦ Assistant</button>}
    {open && <section className="businessAssistant" role="dialog" aria-modal="false" aria-label="Business assistant">
      <header><div><strong>Seiko assistant</strong><small>{orderId ? "Using the open order as context" : "Your business, in your words"}</small></div><button aria-label="Close assistant" onClick={() => { recognition.current?.abort(); setOpen(false); }}>×</button></header>
      <div className="assistantToolbar"><button disabled={busy} onClick={() => { setEntries([]); setConversationId(""); setProposal(null); setSavedOrder(null); setNotice("New conversation. Existing business records are unchanged."); }}>New conversation</button><button disabled={busy} onClick={showMemories}>Memory</button></div>
      {memoryOpen && <section className="assistantMemories" aria-label="Approved business memories"><p>Preferences and terminology you approved for your account in this business.</p>{memories.length ? memories.map(memory => <div key={memory.id}><p>{memory.content}</p><button disabled={busy} onClick={() => forget(memory.id)}>Review removal</button></div>) : <p>No saved memories.</p>}</section>}
      <div className="assistantConversation" aria-live="polite" aria-busy={busy}>
        {!entries.length && <p>Tell me what you need. I can look up business records, prepare orders and changes, and remember preferences you approve.</p>}
        {entries.map((entry, index) => <article className={`assistantEntry ${entry.role}`} key={index}><small>{entry.role === "user" ? "You" : "Assistant"}</small><p>{entry.text}</p>{Boolean(entry.sources?.length) && <details><summary>Details checked ({entry.sources!.length})</summary>{entry.sources!.map((source, i) => <div key={i}><small>{source.tool} · {new Date(source.checkedAt).toLocaleString()}</small><Review value={source.data}/></div>)}</details>}</article>)}
        {busy && <p role="status">Working with Seiko’s records…</p>}
        {proposal && <section className="assistantProposal" aria-label="Review proposed changes"><h3>Review before saving</h3><p>These changes have not been saved.</p><Review value={proposal.review}/><div className="assistantActions"><button disabled={busy} onClick={() => decide(false)}>Discard</button><button disabled={busy} onClick={() => decide(true)}>Confirm and save</button></div></section>}
        {savedOrder && <button onClick={() => { onOpenOrder(savedOrder); setOpen(false); }}>Open saved order {savedOrder.details.orderNo}</button>}
        {notice && <p role="status" className="assistantNotice">{notice}</p>}<div ref={end}/>
      </div>
      <form onSubmit={send}><label htmlFor="assistantMessage">Your request</label><textarea id="assistantMessage" ref={field} value={input} onChange={event => setInput(event.target.value)} maxLength={16000} rows={3} placeholder="Speak or type in your own language…"/><div className="assistantCompose"><select aria-label="Voice language" value={language} disabled={listening} onChange={event => setLanguage(event.target.value)}><option value="gu-IN">ગુજરાતી</option><option value="hi-IN">हिन्दी</option><option value="en-IN">English</option></select><button type="button" disabled={busy} aria-pressed={listening} onClick={microphone}>{listening ? "Stop mic" : "Microphone"}</button><button disabled={busy || !enabled || !input.trim()} type="submit">Send</button></div></form>
    </section>}
  </>;
}

function Review({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === "") return <span>—</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  if (depth > 8) return <span>Expand the order in Seiko for further detail.</span>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}><Review value={item} depth={depth + 1}/></li>)}</ul> : <span>None</span>;
  return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, s => s.toUpperCase())}</dt><dd><Review value={item} depth={depth + 1}/></dd></div>)}</dl>;
}
