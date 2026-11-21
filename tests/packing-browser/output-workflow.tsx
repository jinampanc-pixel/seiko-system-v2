import { createRoot } from "react-dom/client";
import { DocumentViewer } from "../../app/document-viewer";
import { Scanner } from "../../app/page";
import { RecordTrace } from "../../app/record-trace";
import { SavedOutputRecordDetails, useSavedOutputRecords } from "../../app/saved-output-record";
function SavedFixture(){const {records}=useSavedOutputRecords("seiko","production",["audit-order"]);return <main><h1>Saved handoffs</h1><article><h2>OUTPUT-001</h2><SavedOutputRecordDetails businessId="seiko" kind="production" id="audit-order" record={records["audit-order"]}/></article></main>;}
import "../../app/globals.css";
import "../../app/seiko-brand-theme.css";
document.body.dataset.seikoPalette="true";
document.body.style.minHeight="100dvh";document.documentElement.style.background="#fbf5ed";
const landscape=new URLSearchParams(location.search).has("landscape");
const html=`<!doctype html><html><head><style>@page{size:A4 ${landscape?'landscape':'portrait'};margin:12mm}body{font:16px Arial;color:#173c5e;background:#fbf5ed}table{border-collapse:collapse;width:100%}th,td{padding:12px;border-bottom:1px solid #c3a06c}</style></head><body><h1>Workflow audit fixture</h1><p>OUTPUT-001 · Test production document</p><table><tr><th>Product</th><th>Size</th><th>Qty</th></tr><tr><td>Shirt</td><td>26</td><td>2</td></tr></table></body></html>`;
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('scan')?<Scanner businessId='seiko' queueKey='audit-scan-queue' onPending={()=>{}}/>:new URLSearchParams(location.search).has('trace')?<RecordTrace businessId='seiko'/>:new URLSearchParams(location.search).has('register')?<SavedFixture/>:<main style={{maxWidth:1000,margin:'20px auto',padding:12}}><h1>Document preview</h1><DocumentViewer html={html} title="Audit document preview" filename="audit-document" activity={{businessId:'seiko',kind:'order',id:'audit-order',title:'Audit document'}}/></main>);
