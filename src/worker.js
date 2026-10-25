import {health,saveOperations} from './operations.js';
import {authRoute,authorized} from './auth.js';
import loginPage from '../public/login.html';
import loginScript from '../public/login.js';
import manifest from '../public/manifest.webmanifest';
import icon192 from '../public/icon-192.png';
import icon512 from '../public/icon-512.png';
import {captureEdition,getSnapshot,listSnapshots,archiveBackup} from './capture.js';
export {slotAt,commentsFrom} from './capture.js';
export {safeURL,extractHTML,article} from './article.js';
import shell from '../public/index.html';
import client from '../public/app.js';
import css from '../public/style.css';
import sw from '../public/sw.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export default {async fetch(request,env){try{const u=new URL(request.url),p=u.pathname;
const auth=await authRoute(request,env);if(auth)return auth;
const protectedPath=p.startsWith('/api/')||p==='/'||p==='/index.html';const allowed=protectedPath?await authorized(request,env):false;if(p.startsWith('/api/')&&!allowed)return json({error:'Sign in to Margin to continue.'},401);

if(p==='/api/health'&&request.method==='GET')return json(await health(env.BUCKET));
if(p==='/api/operations'&&request.method==='POST')return saveOperations(request,env);
if(p==='/api/snapshots'&&request.method==='GET')return json(await listSnapshots(env.BUCKET));
if(p.startsWith('/api/snapshot/')&&request.method==='GET'){const id=p.split('/').pop();if(!/^\d{4}-\d{2}-\d{2}_(08|20)$/.test(id))return json({error:'Invalid snapshot'},400);const s=await getSnapshot(env.BUCKET,id);return s?json(s):json({error:'Snapshot not captured'},404)}
if(p==='/api/capture'&&request.method==='POST'){
const origin=request.headers.get('origin');if(origin&&origin!==u.origin)return json({error:'Origin not allowed'},403);
const result=await captureEdition(env.BUCKET);return json(result,result.busy||result.pausedUntil?202:200);
}
if(p==='/api/backup'&&request.method==='GET')return archiveBackup(env.BUCKET);
const files={'/': [allowed?shell:loginPage,'text/html'],'/index.html':[allowed?shell:loginPage,'text/html'],'/setup':[loginPage,'text/html'],'/recover':[loginPage,'text/html'],'/password':[loginPage,'text/html'],'/login.js':[loginScript,'text/javascript'],'/manifest.webmanifest':[manifest,'application/manifest+json'],'/icon-192.png':[icon192,'image/png'],'/icon-512.png':[icon512,'image/png'],'/app.js':[client,'text/javascript'],'/style.css':[css,'text/css'],'/sw.js':[sw,'text/javascript']};if(files[p])return new Response(files[p][0],{headers:{'Content-Type':files[p][1]+'; charset=utf-8','Cache-Control':files[p][1]==='text/html'?'private, no-store':'no-cache','X-Margin-Shell':((p==='/'||p==='/index.html')&&allowed)?'reader':'other','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; frame-src blob:; connect-src 'self'; object-src 'none'; base-uri 'self'"}});return json({error:'Not found'},404);
}catch(e){return json({error:e.message||'Request failed'},500)}}};
