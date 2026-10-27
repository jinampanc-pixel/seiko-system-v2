import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
const fail=(message:string,status=400)=>Response.json({ok:false,message},{status});
const types=['image/png','image/jpeg','image/webp','application/pdf'];
const blockSize=256*1024, maxSize=8*1024*1024;
const encode=(bytes:Uint8Array)=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
export async function POST(request:Request){
  const url=new URL(request.url),business='seiko',orderId=url.searchParams.get('orderId');
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return fail('Invalid request origin.',403);
  const actor=await authenticateActor(request);if(!actor)return fail('Sign in is required.',401);
  if(!await authorizePermission(actor,business,'orders.edit'))return fail('You cannot upload order evidence.',403);
  const type=request.headers.get('content-type')?.split(';')[0]||'';
  const name=(url.searchParams.get('name')||'Evidence').slice(0,240);
  if(!types.includes(type))return fail('Use PNG, JPEG, WebP, PDF evidence.');
  if(Number(request.headers.get('content-length')||0)>maxSize)return fail('Choose evidence up to 8 MB.',413);
  if(!env.DB)return fail('Shared storage is unavailable.',503);
  const db=env.DB.withSession('first-primary'),id=crypto.randomUUID(),prefix='order.evidence.'+id,now=new Date().toISOString();
  if(!orderId||!await db.prepare("SELECT id FROM erp_orders WHERE id=? AND business_id='seiko' AND json_extract(document_json,'$.deletedAt') IS NULL").bind(orderId).first())return fail('Order unavailable.',404);
  let count=0,size=0,pending=new Uint8Array(0);const fileParts:Uint8Array[]=[];
  const write=async(bytes:Uint8Array)=>{await db.prepare('INSERT INTO erp_preferences(business_id,key,value_json,version,updated_by_user_id,updated_by_email,updated_at) VALUES(?,?,?,1,?,?,?)').bind(business,prefix+'.'+String(count++).padStart(4,'0'),JSON.stringify({data:encode(bytes)}),actor.userId,actor.email,now).run();};
  try{
    const reader=request.body?.getReader();if(!reader)return fail('Choose a file.');
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;fileParts.push(part.value);if(size>maxSize){await reader.cancel();throw new Error('Choose evidence up to 8 MB.');}
      const combined=new Uint8Array(pending.length+part.value.length);combined.set(pending);combined.set(part.value,pending.length);let offset=0;
      while(combined.length-offset>=blockSize){await write(combined.subarray(offset,offset+blockSize));offset+=blockSize;}pending=combined.slice(offset);
    }
    if(!size)throw new Error('The selected file is empty.');if(pending.length)await write(pending);
    const file=new Uint8Array(size);let offset=0;for(const part of fileParts){file.set(part,offset);offset+=part.length;}
    const valid=type==='application/pdf'?new TextDecoder().decode(file.subarray(0,5))==='%PDF-':type==='image/png'?file[0]===137&&file[1]===80&&file[2]===78&&file[3]===71:type==='image/jpeg'?file[0]===255&&file[1]===216&&file[2]===255:new TextDecoder().decode(file.subarray(0,4))==='RIFF'&&new TextDecoder().decode(file.subarray(8,12))==='WEBP';
    if(!valid)throw new Error('The file contents do not match its type.');
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',file))).map(n=>n.toString(16).padStart(2,'0')).join('');
    await db.prepare('INSERT INTO erp_preferences(business_id,key,value_json,version,updated_by_user_id,updated_by_email,updated_at) VALUES(?,?,?,1,?,?,?)').bind(business,prefix,JSON.stringify({orderId,name,type,size,chunks:count,sha256,addedAt:now,by:actor.email}),actor.userId,actor.email,now).run();
    return Response.json({ok:true,evidence:{id,name,mimeType:type,size,storageKey:'evidence:'+id,sha256,addedAt:now}},{headers:{'Cache-Control':'no-store'}});
  }catch(cause){await db.prepare('DELETE FROM erp_preferences WHERE business_id=? AND key LIKE ?').bind(business,prefix+'%').run();return fail(cause instanceof Error&&(cause.message.includes('8 MB')||cause.message.includes('file contents'))?cause.message:'Evidence could not be saved to shared storage. Keep the original and retry.',503);}
}
export async function GET(request:Request){
  const url=new URL(request.url),business='seiko',orderId=url.searchParams.get('orderId'),id=url.searchParams.get('id');
  const actor=await authenticateActor(request);if(!actor)return fail('Sign in is required.',401);
  if(!await authorizePermission(actor,business,'orders.view'))return fail('You cannot view order evidence.',403);
  if(!id||!/^[a-f0-9-]{36}$/.test(id))return fail('Invalid evidence.');if(!env.DB)return fail('Shared storage is unavailable.',503);
  const db=env.DB.withSession('first-primary'),prefix='order.evidence.'+id;
  const row=await db.prepare('SELECT value_json AS data FROM erp_preferences WHERE business_id=? AND key=?').bind(business,prefix).first<{data:string}>();
  if(!row)return fail('Evidence not found.',404);
  const meta=JSON.parse(row.data) as {orderId:string;name:string;type:string;size:number;chunks:number};
  if(meta.orderId!==orderId||!await db.prepare("SELECT id FROM erp_orders WHERE id=? AND business_id='seiko' AND json_extract(document_json,'$.deletedAt') IS NULL").bind(orderId).first())return fail('Evidence not found for this order.',404);
  const stream=new ReadableStream<Uint8Array>({async start(controller){try{for(let n=0;n<meta.chunks;n++){const chunk=await db.prepare('SELECT value_json AS data FROM erp_preferences WHERE business_id=? AND key=?').bind(business,prefix+'.'+String(n).padStart(4,'0')).first<{data:string}>();if(!chunk)throw new Error('Missing evidence data.');controller.enqueue(Uint8Array.from(atob(JSON.parse(chunk.data).data),c=>c.charCodeAt(0)));}controller.close();}catch(error){controller.error(error);}}});
  return new Response(stream,{headers:{'Content-Type':meta.type,'Content-Length':String(meta.size),'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(meta.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
