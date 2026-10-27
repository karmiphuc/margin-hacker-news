const CACHE='margin-shell-v8';
const FILES=['/app.js','/style.css','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
async function saveShell(cache){const r=await fetch('/',{cache:'no-store'});if(!r.ok||r.headers.get('X-Margin-Shell')!=='reader')throw Error('Unlock Margin before saving the offline shell');await cache.put('/',r)}
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(FILES);await saveShell(c);await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('margin-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate'&&['/','/index.html'].includes(u.pathname)){e.respondWith((async()=>{try{const r=await fetch(e.request);if(r.ok&&r.headers.get('X-Margin-Shell')==='reader'){const c=await caches.open(CACHE);await c.put('/',r.clone())}return r}catch{return await caches.match('/')||new Response('Reconnect and unlock Margin to prepare offline reading.',{status:503})}})());return}
 if(FILES.includes(u.pathname))e.respondWith(caches.open(CACHE).then(async c=>await c.match(e.request)||fetch(e.request)));
});
