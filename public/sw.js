const BUILD='__MARGIN_BUILD__';
const CACHE='margin-shell-'+BUILD;
const FILES=['/app.js','/style.css','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
async function matchingShell(response){return response.ok&&response.headers.get('X-Margin-Shell')==='reader'&&(await response.clone().text()).includes('<meta name="margin-build" content="'+BUILD+'">')}
async function saveShell(cache){const r=await fetch('/',{cache:'no-store'});if(!await matchingShell(r))throw Error('Unlock Margin and retry the offline app update');await cache.put('/',r)}
self.addEventListener('install',e=>e.waitUntil((async()=>{try{const c=await caches.open(CACHE);await c.addAll(FILES);await saveShell(c);await self.skipWaiting()}catch(error){await caches.delete(CACHE);throw error}})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('margin-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate'&&['/','/index.html'].includes(u.pathname)){e.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(e.request);if(await matchingShell(r)){await c.put('/',r.clone());return r}if(r.ok&&r.headers.get('X-Margin-Shell')==='reader'){
 // Keep HTML and assets from the same release while the new worker installs.
 return await c.match('/')||new Response('Reload while online to finish updating Margin.',{status:503});
 }return r}catch{return await c.match('/')||new Response('Reconnect and unlock Margin to prepare offline reading.',{status:503})}})());return}
 if(FILES.includes(u.pathname))e.respondWith(caches.open(CACHE).then(async c=>await c.match(e.request)||fetch(e.request)));
});
