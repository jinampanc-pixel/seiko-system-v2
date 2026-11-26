"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { readyDocument } from "./lib/document-pdf";
import type { BillingCopies } from "./lib/seiko-billing-print";
import "./document-viewer.css";
import { ActionMenu } from "./action-menu";
import { OutputRecordMenu } from "./output-record-menu";
import "./outputs/outputs.css";
import { recordOutput, pendingOutputCount, type OutputContext, type OutputAction } from "./lib/output-activity";

export function DocumentViewer({ html, title, filename, copies, beforeOutput, activity, controls, outputDisabled = false, previewOnly = false }: {
  previewOnly?: boolean; controls?: ReactNode; activity?: OutputContext; html: string; title: string; filename: string; outputDisabled?: boolean;
  copies?: BillingCopies; beforeOutput?: () => Promise<unknown>;
}) {
  const [syncPending,setSyncPending]=useState(0);
  useEffect(()=>{const update=()=>setSyncPending(activity?pendingOutputCount(activity):0);update();window.addEventListener("jinam:output-list-updated",update);return()=>window.removeEventListener("jinam:output-list-updated",update);},[activity?.businessId,activity?.kind,activity?.id]);
  const frame = useRef<HTMLIFrameElement>(null);
  const urls = useRef<string[]>([]);
  const pending = useRef(false);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState("fit"), [file, setFile] = useState<File | null>(null);
  const [download, setDownload] = useState("");
  const scale = useCallback(() => {
    const f = frame.current, doc = f?.contentDocument;
    if (!f || !doc?.body) return;
    doc.body.style.zoom = "1";
    const width = Math.max(794, doc.body.scrollWidth);
    doc.body.style.zoom = String(zoom === "fit" ? Math.min(1, (f.clientWidth - 2) / width) : Number(zoom));
  }, [zoom]);
  useEffect(() => { scale(); const observer = new ResizeObserver(scale); if (frame.current) observer.observe(frame.current); return () => observer.disconnect(); }, [scale]);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);
  useEffect(() => { queueMicrotask(() => { setFile(null); setDownload(""); setNotice(""); }); }, [html, copies, filename]);
  async function load() {
    setReady(false); setError("");
    try { if (frame.current) await readyDocument(frame.current, copies); scale(); setReady(true); }
    catch (e) { setError((e as Error).message); }
  }
  async function track(action: OutputAction) { if (activity) await recordOutput(activity, action, html); }
  async function downloadPdf() {
    if (pending.current) return;
    pending.current = true; setBusy("download"); setError(""); setNotice("");
    try {
      try{await beforeOutput?.();}catch(e){setError("Printing the open copy. Shared verification is unavailable: "+(e as Error).message);}
      let nextFile = file, objectUrl = download;
      if (!nextFile || !objectUrl) {
        const { createDocumentPdf } = await import("./lib/document-pdf");
        const blob = await createDocumentPdf(html, copies);
        objectUrl = URL.createObjectURL(blob); urls.current.push(objectUrl);
        nextFile = new File([blob], filename.replace(/[^a-zA-Z0-9._-]/g, "_") + ".pdf", { type: "application/pdf" });
        await track("pdf-prepared"); setFile(nextFile); setDownload(objectUrl);
      }
      await track("download-requested");
      const link = document.createElement("a"); link.href = objectUrl; link.download = nextFile.name; link.click();
      setNotice("PDF download requested. Check your browser downloads.");
    } catch (e) {
      const message = (e as Error).message;
      setError(/dynamically imported module|Loading chunk|Importing a module script failed/i.test(message)
        ? "The app was updated. Save unfinished work, refresh, then reopen this document and download again." : message);
    } finally { pending.current = false; setBusy(""); }
  }
  async function printDocument() {
    if (pending.current) return;
    pending.current = true; setBusy("print"); setError(""); setNotice("");
    try {
      try{await beforeOutput?.();}catch(e){setError("Printing the open copy. Shared verification is unavailable: "+(e as Error).message);}
      const f = frame.current, target = f?.contentWindow;
      if (!f || !target) throw Error("The document is still loading. Try again shortly.");
      const doc = await readyDocument(f, copies);
      await track("print-requested");
      doc.body.style.zoom = "1";
      target.addEventListener("afterprint", scale, { once: true });
      target.focus(); target.print();
      setNotice("Print requested. Choose your printer in the browser dialog.");
    } catch (e) { scale(); setError((e as Error).message); }
    finally { pending.current = false; setBusy(""); }
  }
  function openDocument() {
    const tab = window.open("", "_blank");
    if (!tab) { setError("Allow the document tab to open, then retry."); return; }
    tab.opener = null; tab.document.open(); tab.document.write(html.replace("<head>", '<head><meta name="viewport" content="width=794">')); tab.document.close();
    void (async () => { try { try{await beforeOutput?.();}catch(e){setError("Printing the open copy. Shared verification is unavailable: "+(e as Error).message);} await readyDocument({ contentDocument: tab.document } as HTMLIFrameElement, copies); await track("document-opened"); } catch (e) { setError((e as Error).message); tab.close(); } })();
  }
  async function share() {
    if (!file) return;
    try { await track("share-requested"); await navigator.share({ files: [file], title: filename }); }
    catch (e) { if ((e as Error).name !== "AbortError") setError("Sharing is unavailable here. Use Download PDF."); }
  }
  return <div className="documentViewer" aria-busy={Boolean(busy)}>{syncPending>0&&<p role="status">Output record pending sync. Printing and downloads remain available.</p>}
    <div className="documentViewerActions">
      {!previewOnly && <><button className="primary" type="button" disabled={!ready || Boolean(busy) || outputDisabled} onClick={() => void printDocument()}>{busy === "print" ? "Opening Print…" : "Print"}</button>
      <button className="secondary" type="button" disabled={!ready || Boolean(busy) || outputDisabled} onClick={() => void downloadPdf()}>{busy === "download" ? "Downloading PDF…" : "Download PDF"}</button></>}
      {controls}<label>Preview Zoom<select aria-label="Preview Zoom" value={zoom} onChange={e => setZoom(e.target.value)}><option value="fit">Fit Screen</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label>
      {activity && !outputDisabled && <OutputRecordMenu context={activity} content={html} beforeSave={beforeOutput}/>}
      {!previewOnly && <ActionMenu label="More Options">
        <button className="secondary" type="button" disabled={!ready || Boolean(busy) || outputDisabled} onClick={openDocument}>Open Document In New Tab</button>
        {file && <a className="secondary" href={download} target="_blank" rel="noopener noreferrer">Open downloaded PDF</a>}
        {file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }) && <button className="secondary" type="button" onClick={() => void share()}>Share PDF</button>}
      </ActionMenu>}
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <iframe ref={frame} title={title} srcDoc={html} onLoad={() => void load()}/>
  </div>;
}
