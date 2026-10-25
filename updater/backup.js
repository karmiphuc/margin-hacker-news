// This bucket belongs to the owner-private updater, never to the public reader.
const INDEX='backup/index.json',STATUS='backup/status.json',LEASE='backup/lease.json';
export const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
const read=async(b,k)=>(await b.get(k))?.json();
export function validate(s){
 if(!s||!/^\d{4}-\d{2}-\d{2}_(08|20)$/.test(s.id)||!Array.isArray(s.stories)||s.stories.length>100||!Number.isFinite(Date.parse(s.capturedAt)))throw Error('Invalid edition');
 const forbidden=new Set(['password','hash','salt','recoveryCode','recoveryHash','sessions','token','authorization']);
 function walk(x){if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(forbidden.has(k))throw Error('Authentication fields cannot be backed up');walk(v)}}walk(s);
 const ids=new Set();let articles=0,comments=0;
 for(const x of s.stories){if(!Number.isInteger(x.id)||ids.has(x.id)||!Array.isArray(x.comments||[])||(x.comments||[]).length>50)throw Error('Invalid story');ids.add(x.id);if(x.article?.status==='saved'){if(['pdf','image'].includes(x.article.format)){if(!x.article.data||!x.article.mime)throw Error('Saved binary is missing');atob(x.article.data)}else if(typeof x.article.text!=='string')throw Error('Saved text is missing');articles++}for(const c of x.comments||[])if(typeof c.text!=='string')throw Error('Comment text is missing');comments+=(x.comments||[]).length}
 return {stories:s.stories.length,articles,comments,complete:!!s.complete};
}
async function objectVerified(bucket,key,expected){const o=await bucket.get(key);if(!o)throw Error('Backup object missing');const text=await o.text();if(await digest(text)!==expected)throw Error('Backup checksum mismatch');const s=JSON.parse(text);return {snapshot:s,counts:validate(s)}}
async function acquire(bucket){const obj=await bucket.get(LEASE),v=obj?await obj.json():null;if(v?.until>Date.now())return null;const owner=crypto.randomUUID();const ok=await bucket.put(LEASE,JSON.stringify({owner,until:Date.now()+300000}),{onlyIf:obj?{etagMatches:obj.etag}:{etagDoesNotMatch:'*'}});return ok===null?null:owner}
export async function backupStatus(bucket){return await read(bucket,STATUS)||{state:'not_started',lastSuccessAt:null,lastRestoreAt:null}}
export async function maintain(bucket,reader,{now=new Date()}={}){
 if(!bucket)throw Error('Secondary storage is not configured');const owner=await acquire(bucket);if(!owner)return {state:'busy',complete:false,retryAfter:10};
 let status=await backupStatus(bucket);const startedAt=now.toISOString(),day=startedAt.slice(0,10),month=day.slice(0,7);
 try{
  const list=await reader('/api/snapshots');if(!Array.isArray(list)||!list.length)throw Error('No source editions available');
  const index=await read(bucket,INDEX)||{editions:{}};let copied=0,verified=0;
  // Never remove a secondary copy just because the primary stops listing it.
  for(const {id} of list){if(!/^\d{4}-\d{2}-\d{2}_(08|20)$/.test(id))throw Error('Invalid source edition ID');if(index.editions[id]?.complete||index.editions[id]?.checkedDay===day)continue;if(copied>=3)break;
   const s=await reader('/api/snapshot/'+id);if(s.id!==id)throw Error('Edition ID mismatch');const counts=validate(s),text=JSON.stringify(s),sha256=await digest(text),key='objects/'+sha256+'.json';
   await bucket.put(key,text,{onlyIf:{etagDoesNotMatch:'*'}});await objectVerified(bucket,key,sha256);
   index.editions[id]={key,sha256,...counts,savedAt:startedAt,checkedDay:day};copied++;
  }
  await bucket.put(INDEX,JSON.stringify(index));
  // Walk every retained edition monthly, bounded per call. Reconstruct into a scratch
  // namespace, read it back, validate article/comment data, then remove only scratch.
  for(const [id,e] of Object.entries(index.editions)){if(e.restoreMonth===month)continue;if(verified>=3)break;const {snapshot}=await objectVerified(bucket,e.key,e.sha256);const scratch='restore-check/'+owner+'/'+id+'.json';try{await bucket.put(scratch,JSON.stringify(snapshot));await objectVerified(bucket,scratch,e.sha256)}finally{await bucket.delete(scratch)}e.restoreMonth=month;e.restoredAt=startedAt;verified++}
  await bucket.put(INDEX,JSON.stringify(index));
  const missing=list.filter(({id})=>!index.editions[id]||(!index.editions[id].complete&&index.editions[id].checkedDay!==day)).length;
  const restorePending=Object.values(index.editions).filter(e=>e.restoreMonth!==month).length;
  const complete=missing===0&&restorePending===0;const totals=Object.values(index.editions).reduce((n,e)=>({editions:n.editions+1,stories:n.stories+e.stories,articles:n.articles+e.articles,comments:n.comments+e.comments}),{editions:0,stories:0,articles:0,comments:0});
  if(complete){const manifest=JSON.stringify({format:'margin-secondary-v1',createdAt:startedAt,editions:index.editions,totals,authenticationIncluded:false});await bucket.put('daily/'+day+'.json',manifest);await bucket.put('monthly/'+month+'.json',manifest,{onlyIf:{etagDoesNotMatch:'*'}});const daily=await read(bucket,'daily/'+day+'.json');if(JSON.stringify(daily)!==manifest)throw Error('Backup manifest readback failed')}
  status={...status,state:complete?'healthy':'in_progress',complete,checkedAt:startedAt,lastSuccessAt:complete?startedAt:status.lastSuccessAt||null,lastRestoreAt:restorePending===0&&verified>0?startedAt:status.lastRestoreAt||null,totals,pendingEditions:missing,restorePending,copied,verified,error:null,storage:'Separate private updater bucket; same hosting provider',retention:'Daily manifests and monthly checkpoints retained; no automatic deletion'};
  await bucket.put(STATUS,JSON.stringify(status));return status;
 }catch(e){await bucket.put(STATUS,JSON.stringify({...status,state:'failed',complete:false,checkedAt:startedAt,error:e.message}));throw e}finally{const o=await bucket.get(LEASE);if(o&&(await o.json()).owner===owner)await bucket.put(LEASE,JSON.stringify({owner,until:0}),{onlyIf:{etagMatches:o.etag}})}
}
export async function secondaryExport(bucket){const index=await read(bucket,INDEX);if(!index)return Response.json({error:'No verified backup yet'},{status:404});const entries=Object.values(index.editions);let i=0;return new Response(new ReadableStream({async pull(controller){try{if(i===entries.length){controller.close();return}const e=entries[i++],{snapshot}=await objectVerified(bucket,e.key,e.sha256);controller.enqueue(new TextEncoder().encode(JSON.stringify(snapshot)+'\n'))}catch(e){controller.error(e)}}}),{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="margin-secondary.jsonl"','Cache-Control':'no-store'}})}
