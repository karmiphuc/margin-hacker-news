export class SourcePaused extends Error {
  constructor(message,retryAt,status){super(message);this.name='SourcePaused';this.retryAt=retryAt;this.status=status;}
}
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function retryTime(value,now=Date.now()) {if(!value)return 0;const seconds=Number(value);return Number.isFinite(seconds)&&seconds>=0?now+seconds*1000:(Date.parse(value)||0);}
export function createNetwork(bucket,{now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),fetcher=(...args)=>fetch(...args)}={}){
  async function update(key,change){for(let attempt=0;attempt<12;attempt++){const object=await bucket.get(key);const state=object?await object.json():{};const next=change(state);const result=await bucket.put(key,JSON.stringify(next),{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'}});if(result!==null)return next;}throw new SourcePaused('Another request is reserving this source. Try again shortly.',now()+5000);}
  async function request(url,init={}){
    const host=new URL(url).hostname,key='network/hosts/'+await hash(host);
    const state=await update(key,s=>{if(s.blockedUntil>now())throw new SourcePaused('Source requests are paused until '+new Date(s.blockedUntil).toISOString(),s.blockedUntil);const reservedAt=Math.max(now(),s.nextAt||0);return {...s,reservedAt,nextAt:reservedAt+500};});
    if(state.reservedAt>now())await sleep(state.reservedAt-now());
    try{
      const response=await fetcher(url,{...init,headers:{'User-Agent':'MarginReader/1.0',...init.headers}});
      if([401,403,429,500,502,503,504].includes(response.status)){
        const minimum=[401,403].includes(response.status)?86400000:response.status===429?300000:60000;
        const until=Math.max(retryTime(response.headers.get('retry-after'),now()),now()+Math.min(86400000,minimum*2**Math.min(state.failures||0,6)));
        await response.body?.cancel();await update(key,s=>({...s,blockedUntil:Math.max(s.blockedUntil||0,until),failures:(s.failures||0)+1}));
        throw new SourcePaused('Source returned '+response.status+'; further requests are paused.',until,response.status);
      }
      return response;
    }catch(error){if(error instanceof SourcePaused)throw error;const until=now()+Math.min(3600000,60000*2**Math.min(state.failures||0,6));await update(key,s=>({...s,blockedUntil:Math.max(s.blockedUntil||0,until),failures:(s.failures||0)+1}));throw new SourcePaused(error.message||'Source temporarily unavailable',until);}
  }
  return {request};
}
