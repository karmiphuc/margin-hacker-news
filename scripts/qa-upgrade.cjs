// Run after build. Exercises the real browser lifecycle with two release identities.
const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
(async()=>{
 const {default:worker}=await import('../dist/server/index.js');
 const {slotAt}=await import('../src/capture.js');
 const data=new Map();let revision=0;
 const bucket={
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null},
  async put(k,text,opt={}){const old=data.get(k);if(opt.onlyIf?.etagDoesNotMatch==='*'&&old)return null;if(opt.onlyIf?.etagMatches&&old?.etag!==opt.onlyIf.etagMatches)return null;const etag=String(++revision);data.set(k,{text,etag});return {etag}},
  async delete(k){data.delete(k)},
  async list({prefix}){return {objects:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}}
 };
 const token='local-upgrade-test-token-at-least-32-characters';
 const env={BUCKET:bucket,MARGIN_SETUP_HASH:createHash('sha256').update(token).digest('hex'),MARGIN_SETUP_EXPIRES:new Date(Date.now()+600000).toISOString()};
 const originalSW=await(await worker.fetch(new Request('http://localhost/sw.js'),env)).text();
 const originalBuild=originalSW.match(/const BUILD='([a-f0-9]{24})'/)?.[1];
 assert(originalBuild,'Build must substitute the service worker identity');
 let release=1,failAssets=false;
 const identity=n=>createHash('sha256').update('qa-release-'+n).digest('hex').slice(0,24);
 const server=http.createServer(async(req,res)=>{try{
  if(failAssets&&req.url==='/app.js'){res.writeHead(503);res.end('Simulated interrupted update');return}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await worker.fetch(new Request('http://localhost:3101'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env);
  let body=Buffer.from(await response.arrayBuffer());
  if(['/','/index.html','/sw.js','/app.js'].includes(req.url)){
   body=Buffer.from(body.toString().replaceAll(originalBuild,identity(release))+(req.url==='/app.js'?'\nwindow.__qaRelease='+release+';':''));
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);
 }catch(e){res.writeHead(500);res.end(e.message)}});
 await new Promise(resolve=>server.listen(3101,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const origin='http://localhost:3101';
  const response=await context.request.post(origin+'/api/auth/setup',{headers:{origin},data:{token,password:'local upgrade fixture password'}});assert.equal(response.status(),200);
  await page.goto(origin+'/setup');
  const edition={id:slotAt(new Date()),capturedAt:new Date().toISOString(),complete:true,stories:[{id:1,rank:1,title:'Legacy offline edition',url:'https://example.org/article',by:'fixture',score:1,descendants:1,article:{status:'saved',text:'Original archived text'},comments:[{id:10,by:'fixture',text:'Original archived comment'}]}]};
  await page.evaluate(s=>new Promise((resolve,reject)=>{const r=indexedDB.open('margin',1);r.onupgradeneeded=()=>r.result.createObjectStore('editions',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const tx=r.result.transaction('editions','readwrite');tx.objectStore('editions').put(s);tx.oncomplete=()=>{r.result.close();resolve()}}}),edition);
  await page.goto(origin);await page.waitForSelector('.story');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller&&window.__qaRelease===1);
  await page.evaluate(()=>{const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(window.__failDeviceWrites&&mode==='readwrite')throw new DOMException('Simulated device storage full','QuotaExceededError');return transaction.call(this,stores,mode,...rest)};window.__failDeviceWrites=true});
  await page.locator('#download').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Download incomplete:'));
  const retained=await page.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open('margin',2);r.onsuccess=()=>{const q=r.result.transaction('editions').objectStore('editions').get(id);q.onsuccess=()=>{r.result.close();resolve(q.result)};q.onerror=()=>reject(q.error)}}),edition.id);assert.deepEqual(retained,edition);await page.evaluate(()=>window.__failDeviceWrites=false);
  release=2;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Update did not activate')),15000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timeout);resolve()},{once:true});r.update().catch(reject)})});
  // Claiming the new worker must not discard an already-open page or its data.
  assert.equal(await page.evaluate(()=>window.__qaRelease),1);assert.equal(await page.locator('.story').count(),1);await page.locator('[data-open="1"]').click();assert.match(await page.locator('#reader-content').textContent(),/Original archived text/);await page.locator('#close-reader').click();
  await page.reload();await page.waitForFunction(()=>window.__qaRelease===2);await page.waitForSelector('.story');
  release=3;failAssets=true;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Failed update did not settle')),15000);r.addEventListener('updatefound',()=>{const installing=r.installing;installing.addEventListener('statechange',()=>{if(installing.state==='redundant'){clearTimeout(timeout);resolve()}else if(installing.state==='activated'){clearTimeout(timeout);reject(Error('Interrupted update activated'))}})},{once:true});r.update().catch(reject)})});
  // Online navigation to a newer shell must retain the matching old shell/assets.
  await page.reload();await page.waitForFunction(()=>window.__qaRelease===2);await page.waitForSelector('.story');
  await context.setOffline(true);await page.close();const reopened=await context.newPage();reopened.on('pageerror',e=>errors.push(e.message));await reopened.goto(origin);await reopened.waitForFunction(()=>window.__qaRelease===2);await reopened.waitForSelector('.story');await reopened.locator('[data-open="1"]').click();assert.match(await reopened.locator('#reader-content').textContent(),/Original archived text/);await reopened.locator('[data-tab="comments"]').click();assert.match(await reopened.locator('#reader-content').textContent(),/Original archived comment/);
  const cacheNames=await reopened.evaluate(()=>caches.keys());assert(cacheNames.includes('margin-shell-'+identity(2)));assert(!cacheNames.includes('margin-shell-'+identity(3)));assert.equal(errors.length,0,errors.join('\n'));
  await context.close();console.log('Upgrade QA passed: legacy data, failed IDB write, open old tab, new shell, interrupted install, matched assets and offline reopening.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
