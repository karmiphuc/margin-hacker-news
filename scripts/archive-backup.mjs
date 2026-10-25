import {mkdir,writeFile,rename,rm,stat} from 'node:fs/promises';import {createReadStream,createWriteStream} from 'node:fs';import {createHash} from 'node:crypto';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';import {createGzip} from 'node:zlib';import {resolve,join} from 'node:path';import {ArchiveValidator} from './lib/archive-format.mjs';
const origin=new URL(process.env.MARGIN_PRIVATE_UPDATER_URL||'https://margin-private-updater.karmi-nguyen.chatgpt.site');if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Set a clean HTTPS updater origin');
if(!process.env.MARGIN_SITE_SERVICE_TOKEN)throw Error('Fresh private Site service access is required');
const source=process.env.MARGIN_BACKUP_SOURCE||'primary';if(!['primary','secondary'].includes(source))throw Error('Invalid backup source');
const endpoint=source==='secondary'?'/api/secondary/export':'/api/backup';
const output=resolve(process.argv[2]||'backups'),stamp=new Date().toISOString().replace(/[:.]/g,'-');await mkdir(output,{recursive:true});
const name='margin-archive-'+stamp+'.jsonl.gz',path=join(output,name),partial=path+'.partial',validator=new ArchiveValidator();
try{
 const r=await fetch(new URL(endpoint,origin),{headers:{'OAI-Sites-Authorization':'Bearer '+process.env.MARGIN_SITE_SERVICE_TOKEN},redirect:'manual',signal:AbortSignal.timeout(10*60*1000)});
 if(!r.ok)throw Error('Archive export returned HTTP '+r.status);if(!(r.headers.get('content-type')||'').includes('application/x-ndjson'))throw Error('Expected an archive export, not an HTML/login response');
 await pipeline(Readable.fromWeb(r.body),validator,createGzip({level:9}),createWriteStream(partial,{mode:0o600,flags:'wx'}));
 await rename(partial,path);const sha=createHash('sha256');for await(const chunk of createReadStream(path))sha.update(chunk);
 const manifest={format:'margin-archive-jsonl-gzip-v1',createdAt:new Date().toISOString(),source:origin.origin,backupSource:source,sourceCommit:process.env.MARGIN_SOURCE_COMMIT||null,file:name,sha256:sha.digest('hex'),bytes:(await stat(path)).size,...validator.stats,editionIds:[...validator.ids].sort(),includesAuthentication:false};
 const manifestPath=path+'.manifest.json';await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({archive:path,manifest:manifestPath,...validator.stats,bytes:manifest.bytes,sha256:manifest.sha256}));
}catch(e){await rm(partial,{force:true});throw e;}
