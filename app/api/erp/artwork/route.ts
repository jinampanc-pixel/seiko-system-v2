import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status});
const types=['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf'];
const blockSize=256*1024, maxSize=25*1024*1024;
const encode=(bytes:Uint8Array)=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
export async function POST(request:Request){
  const url=new URL(request.url),business=url.searchParams.get('business')||'seiko';
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return fail('Invalid request origin.',403);
  const actor=await authenticateActor(request);if(!actor)return fail('Sign in is required.',401);
  if(!await authorizePermission(actor,business,'orders.setup'))return fail('You cannot upload order artwork.',403);
  const type=request.headers.get('content-type')?.split(';')[0]||'';
  const name=(url.searchParams.get('name')||'Artwork').slice(0,240);
  if(!types.includes(type))return fail('Use PNG, JPEG, WebP, SVG or PDF artwork.');
  if(Number(request.headers.get('content-length')||0)>maxSize)return fail('Choose artwork up to 25 MB.',413);
  if(!env.DB)return fail('Shared storage is unavailable.',503);
  const db=env.DB.withSession('first-primary'),id=crypto.randomUUID(),prefix='order.asset.'+id,now=new Date().toISOString();
  let count=0,size=0,pending=new Uint8Array(0);
  const write=async(bytes:Uint8Array)=>{await db.prepare('INSERT INTO erp_preferences(business_id,key,value_json,version,updated_by_user_id,updated_by_email,updated_at) VALUES(?,?,?,1,?,?,?)').bind(business,prefix+'.'+String(count++).padStart(4,'0'),JSON.stringify({data:encode(bytes)}),actor.userId,actor.email,now).run();};
  try{
    const reader=request.body?.getReader();if(!reader)return fail('Choose a file.');
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxSize){await reader.cancel();throw new Error('Choose artwork up to 25 MB.');}
      const combined=new Uint8Array(pending.length+part.value.length);combined.set(pending);combined.set(part.value,pending.length);let offset=0;
      while(combined.length-offset>=blockSize){await write(combined.subarray(offset,offset+blockSize));offset+=blockSize;}pending=combined.slice(offset);
    }
    if(!size)throw new Error('The selected file is empty.');if(pending.length)await write(pending);
    await db.prepare('INSERT INTO erp_preferences(business_id,key,value_json,version,updated_by_user_id,updated_by_email,updated_at) VALUES(?,?,?,1,?,?,?)').bind(business,prefix,JSON.stringify({name,type,size,chunks:count}),actor.userId,actor.email,now).run();
    return Response.json({ok:true,storageKey:'shared:'+id,size},{headers:{'Cache-Control':'no-store'}});
  }catch(cause){await db.prepare('DELETE FROM erp_preferences WHERE business_id=? AND key LIKE ?').bind(business,prefix+'%').run();return fail(cause instanceof Error&&cause.message.includes('25 MB')?cause.message:'Artwork could not be saved to shared storage. Keep the original and retry.',503);}
}
export async function GET(request:Request){
  const url=new URL(request.url),business=url.searchParams.get('business')||'seiko',id=url.searchParams.get('id');
  const actor=await authenticateActor(request);if(!actor)return fail('Sign in is required.',401);
  if(!await authorizePermission(actor,business,'orders.view'))return fail('You cannot view order artwork.',403);
  if(!id||!/^[a-f0-9-]{36}$/.test(id))return fail('Invalid artwork.');if(!env.DB)return fail('Shared storage is unavailable.',503);
  const db=env.DB.withSession('first-primary'),prefix='order.asset.'+id;
  const row=await db.prepare('SELECT value_json AS data FROM erp_preferences WHERE business_id=? AND key=?').bind(business,prefix).first<{data:string}>();
  if(!row)return fail('Artwork not found.',404);
  const meta=JSON.parse(row.data) as {name:string;type:string;size:number;chunks:number};
  const stream=new ReadableStream<Uint8Array>({async start(controller){try{for(let n=0;n<meta.chunks;n++){const chunk=await db.prepare('SELECT value_json AS data FROM erp_preferences WHERE business_id=? AND key=?').bind(business,prefix+'.'+String(n).padStart(4,'0')).first<{data:string}>();if(!chunk)throw new Error('Missing artwork data.');controller.enqueue(Uint8Array.from(atob(JSON.parse(chunk.data).data),c=>c.charCodeAt(0)));}controller.close();}catch(error){controller.error(error);}}});
  return new Response(stream,{headers:{'Content-Type':meta.type,'Content-Length':String(meta.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(meta.name),'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
