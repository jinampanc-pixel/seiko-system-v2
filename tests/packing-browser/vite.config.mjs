import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from 'node:url';
// Prebundle the full React graph once; cold-start discovery must not replace shared exports mid-load.
export default defineConfig({ cacheDir: 'node_modules/.vite-seiko-packing-smoke', optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'html2canvas', 'jspdf'] }, plugins:[react(),{
 name:'isolated-output-audit-fixture',configureServer(server){
  const events=[];
  server.middlewares.use(async(req,res,next)=>{
   if(!req.headers.referer?.includes('/tests/packing-browser/output-workflow.html')||!req.url?.startsWith('/api/erp/'))return next();
   const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
   if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;const entry=JSON.parse(raw);
    if(req.url.startsWith('/api/erp/people')){const person={orderId:'audit-order',recordId:'audit-person',personId:'AUDIT-P1',name:'Verified fixture person',orderNo:'AUDIT-001',client:'Audit fixture',state:'active'};return json(entry.operation==='search'?{ok:true,results:[person],page:1,hasMore:false}:{ok:true,person:{...person,eligibility:{eligible:true,reason:'Saved measurements complete'},fields:[{label:'Class',value:'6'}],products:[{name:'Shirt',quantity:2,specifications:[],measurements:[{label:'Size',value:'26'}]}],deliveries:[],queries:[],syncWarning:''}});}
    events.push({...entry,at:new Date().toISOString()});return json({ok:true});}
   const latest=new Map();for(const e of events.filter(e=>['queue-print','confirm-printed','keep-record','remove-from-list'].includes(e.action)))latest.set(e.kind+e.id+e.title+e.digest,e);
   let entries=[...latest.values()].filter(e=>e.action!=='remove-from-list').map((e,i)=>({...e,id:'fixture-'+i,recordId:e.id,reference:'AUDIT-001',actor:'Local audit fixture',version:1}));
   const url=new URL(req.url,'http://localhost');if(url.searchParams.get('status'))entries=entries.filter(e=>e.action===url.searchParams.get('status'));
   return json({ok:true,entries,next:null});
  });
 }
}], resolve: { alias: { 'next/navigation': fileURLToPath(new URL('./navigation.ts', import.meta.url)) } }, server:{host:"127.0.0.1",port:5176,strictPort:true} });
