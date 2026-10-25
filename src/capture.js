import {parseHTML} from 'linkedom';
import {article} from './article.js';
import {createNetwork,hash,SourcePaused} from './network.js';
const HN='https://hacker-news.firebaseio.com/v0/';
const LEASE='capture/lease.json';
export function slotAt(date=new Date()){const d=new Date(date),h=d.getUTCHours();if(h<8)d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)+'_'+(h>=8&&h<20?'08':'20');}
export function commentsFrom(tree,ids=[]){const output=[],roots=[...(tree?.children||[])];roots.sort((a,b)=>(ids.indexOf(a.id)<0?999:ids.indexOf(a.id))-(ids.indexOf(b.id)<0?999:ids.indexOf(b.id)));function visit(nodes,depth=0){for(const c of nodes){if(output.length>=50)return;if(c.text&&!c.deleted&&!c.dead){const {document}=parseHTML('<html><body>'+c.text+'</body></html>');output.push({id:c.id,by:c.author||'[deleted]',text:document.body.textContent,depth:Math.min(depth,6)});}visit(c.children||[],depth+1)}}visit(roots);return output;}
async function get(bucket,key){return (await bucket.get(key))?.json();}
async function absent(bucket,key,value){return bucket.put(key,JSON.stringify(value),{onlyIf:{etagDoesNotMatch:'*'}});}
export async function getSnapshot(bucket,id){for(const prefix of ['snapshots/','backups/']){try{const s=await get(bucket,prefix+id+'.json');if(s)return s;}catch{}}return null;}
export async function listSnapshots(bucket){const ids=new Set();for(const prefix of ['snapshots/','backups/']){let cursor;do{const page=await bucket.list({prefix,cursor});for(const obj of page.objects){const match=obj.key.match(/(\d{4}-\d{2}-\d{2}_(?:08|20))\.json$/);if(match)ids.add(match[1]);}cursor=page.truncated?page.cursor:undefined;}while(cursor);}return [...ids].sort((a,b)=>b.localeCompare(a)).map(id=>({id}));}
async function acquire(bucket){const object=await bucket.get(LEASE),state=object?await object.json():null;if(state?.until>Date.now())return null;const owner=crypto.randomUUID();const result=await bucket.put(LEASE,JSON.stringify({owner,until:Date.now()+600000}),{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});return result===null?null:owner;}
async function release(bucket,owner){const object=await bucket.get(LEASE);if(!object)return;const state=await object.json();if(state.owner===owner)await bucket.put(LEASE,JSON.stringify({owner,until:0}),{onlyIf:{etagMatches:object.etag}});}
async function mapLimit(items,count,fn){let next=0;const results=new Array(items.length);await Promise.all(Array.from({length:Math.min(count,items.length)},async()=>{while(next<items.length){const i=next++;results[i]=await fn(items[i],i)}}));return results;}
function normalizedURL(url){const u=new URL(url);u.hash='';return u.href;}
async function articleKey(url){try{return 'cache/articles/'+await hash(normalizedURL(url))+'.json'}catch{return null}}
export async function preserveSnapshot(bucket,s){
  if(!s.complete)return;
  await absent(bucket,'backups/'+s.id+'.json',s);
  if(await get(bucket,'capture/indexed/'+s.id))return;
  await mapLimit(s.stories,4,async x=>{
    const key=x.url?await articleKey(x.url):null;
    if(key&&x.article){await absent(bucket,key,{article:x.article,sourceURL:x.url,savedAt:x.article.capturedAt||s.capturedAt,retryAt:x.article.status==='saved'?null:Math.max(Date.parse(s.capturedAt)+86400000,x.article.retryAt||0)});}
    if(x.commentsStatus==='saved')await absent(bucket,'cache/comments/'+x.id+'.json',{comments:x.comments||[],savedAt:s.capturedAt,expires:Date.parse(s.capturedAt)+12*3600000});
  });
  await bucket.put('capture/indexed/'+s.id,JSON.stringify({indexedAt:new Date().toISOString()}));
}
export async function captureEdition(bucket,{date=new Date(),network=createNetwork(bucket)}={}){
  const id=slotAt(date),key='snapshots/'+id+'.json';let s=await getSnapshot(bucket,id);
  const owner=await acquire(bucket);if(!owner)return {...(s||{id,capturedAt:new Date().toISOString(),stories:[],complete:false}),busy:true,retryAfter:5};
  try{
    if(s?.complete){await preserveSnapshot(bucket,s);return {...s,storage:{retained:true,backup:true}};}
    async function jsonSource(url,cacheKey,ttl){const cached=await get(bucket,cacheKey);if(cached?.expires>Date.now())return cached.value;const response=await network.request(url,{signal:AbortSignal.timeout(16000)});if(!response.ok)throw new SourcePaused('Source returned '+response.status,Date.now()+3600000,response.status);const value=await response.json();await bucket.put(cacheKey,JSON.stringify({value,expires:Date.now()+ttl}));return value;}
    if(!s){const ids=(await jsonSource(HN+'topstories.json','cache/top/'+id+'.json',86400000)).slice(0,100);s={id,capturedAt:new Date().toISOString(),stories:ids.map((id,rank)=>({id,rank:rank+1,title:'Story pending capture',url:'https://news.ycombinator.com/item?id='+id,score:0,by:'',descendants:0})),complete:false};await bucket.put(key,JSON.stringify(s));return s;}
    const inFlightArticles=new Map();
    async function savedArticle(url){const key=await articleKey(url);if(inFlightArticles.has(key))return inFlightArticles.get(key);const promise=(async()=>{const cached=key?await get(bucket,key):null;if(cached?.article?.status==='saved'||cached?.retryAt>Date.now())return {...cached.article,capturedAt:cached.article.capturedAt||cached.savedAt};const saved=await article(url,{fetcher:network.request});if(key)await bucket.put(key,JSON.stringify({article:saved,sourceURL:url,savedAt:new Date().toISOString(),retryAt:saved.status==='saved'?null:Math.max(Date.now()+86400000,saved.retryAt||0)}));return saved;})();inFlightArticles.set(key,promise);return promise;}
    const pending=s.stories.filter(x=>!x.article).slice(0,3);let pausedUntil=0;
    const updated=await mapLimit(pending,2,async existing=>{
      try{
        const item=await jsonSource(HN+'item/'+existing.id+'.json','cache/items/'+existing.id+'.json',30*60000);
        if(!item)return {...existing,title:'Story no longer available',article:{status:'unavailable',reason:'HN no longer provides this story.'},comments:[],commentsStatus:'unavailable'};
        const metadata={id:item.id,rank:existing.rank,title:item.title||'Untitled',url:item.url||'https://news.ycombinator.com/item?id='+item.id,by:item.by||'',score:item.score||0,descendants:item.descendants||0,time:item.time};
        let comments=[],commentsStatus='saved',commentsCapturedAt=new Date().toISOString();
        const commentKey='cache/comments/'+item.id+'.json',cachedComments=await get(bucket,commentKey);
        if(cachedComments?.expires>Date.now()){comments=cachedComments.comments;commentsCapturedAt=cachedComments.savedAt;}
        else{try{const response=await network.request('https://hn.algolia.com/api/v1/items/'+item.id,{signal:AbortSignal.timeout(16000)});if(!response.ok)throw Error('Discussion unavailable');comments=commentsFrom(await response.json(),item.kids||[]);await bucket.put(commentKey,JSON.stringify({comments,savedAt:commentsCapturedAt,expires:Date.now()+12*3600000}));}catch{if(cachedComments){comments=cachedComments.comments;commentsCapturedAt=cachedComments.savedAt;}else commentsStatus='unavailable';}}
        let saved;
        if(item.url){saved=await savedArticle(item.url);}
        else{const {document}=parseHTML('<html><body>'+(item.text||'')+'</body></html>');saved={status:'saved',text:document.body.textContent||'This is a discussion post. Open the comments to read the conversation.',words:0,capturedAt:new Date().toISOString()};}
        return {...metadata,article:saved,comments,commentsStatus,commentsCapturedAt};
      }catch(error){pausedUntil=Math.max(pausedUntil,error.retryAt||Date.now()+60000);return existing;}
    });
    s.stories=s.stories.map(x=>updated.find(y=>y.id===x.id)||x);s.complete=s.stories.every(x=>x.article);await bucket.put(key,JSON.stringify(s));if(s.complete)await preserveSnapshot(bucket,s);return {...s,...(pausedUntil&&!s.complete?{pausedUntil}:{}),...(s.complete?{storage:{retained:true,backup:true}}:{})};
  }catch(error){if(error.retryAt)return {...(s||{id,capturedAt:new Date().toISOString(),stories:[],complete:false}),pausedUntil:error.retryAt,error:error.message};throw error;}finally{await release(bucket,owner);}
}
export async function archiveBackup(bucket){const editions=await listSnapshots(bucket),encoder=new TextEncoder();let next=0;const stream=new ReadableStream({async pull(controller){if(next>=editions.length){controller.close();return;}const s=await getSnapshot(bucket,editions[next++].id);if(s)controller.enqueue(encoder.encode(JSON.stringify(s)+'\n'));}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="margin-archive.jsonl"','Cache-Control':'private, no-store'}});}
