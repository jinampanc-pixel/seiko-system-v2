import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function providerFailure(result){
  const text=String(result.stderr||'')+'\n'+String(result.stdout||'');
  const code=text.match(/\[code:\s*(\d+)\]/i)?.[1]||result.error?.code||'unknown';
  const raw=text.replace(/\u001b\[[0-9;]*m/g,'').match(/\[ERROR\]\s*([^\r\n]+)/i)?.[1]||'';
  const hint=raw.replace(/https?:\/\/[^\s"'<>]+/g,'[URL]').replace(/[a-f0-9]{32,}/gi,'[ID]').replace(/\b(?:bearer|token|secret|password)\b[^,;.]*/gi,'[redacted]').slice(0,220);
  return `exit ${result.status??'unavailable'}, provider code ${code}${hint?': '+hint:''}`;
}
export async function diagnose(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'seiko-storage-check-'));
  try{
    const filename=path.join(directory,'database.sql');
    const exported=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','DB','--remote','--config','wrangler.jsonc','--output',filename],{encoding:'utf8',stdio:'pipe',env:{...process.env,CI:'true'}});
    const valid=exported.status===0&&fs.existsSync(filename)&&fs.readFileSync(filename).includes(Buffer.from('CREATE TABLE'));
    console.log(JSON.stringify({check:'D1 export',verified:valid,...(!valid?{failure:providerFailure(exported)}:{})}));
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets`,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}});
    const result=await response.json();
    console.log(JSON.stringify({check:'R2 availability',status:response.status,success:Boolean(result.success),buckets:result.success?result.result?.buckets?.length:undefined,errors:result.errors?.map(e=>({code:e.code,message:String(e.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,180)}))}));
    const required=['SEIKO_BACKUP_RECOVERY_KEY','SEIKO_DRIVE_CLIENT_ID','SEIKO_DRIVE_CLIENT_SECRET','SEIKO_DRIVE_REFRESH_TOKEN','SEIKO_DRIVE_FOLDER_ID'];
    console.log(JSON.stringify({check:'Independent backup configuration',configured:Object.fromEntries(required.map(name=>[name,Boolean(process.env[name])])),enabled:process.env.SEIKO_CLOUD_BACKUP_ENABLED==='true'}));
  }finally{for(const file of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,file));fs.rmdirSync(directory);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))diagnose().catch(()=>{console.error('Storage diagnostics could not complete. No business records changed.');process.exitCode=1;});
