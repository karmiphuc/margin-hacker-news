import {maintain,backupStatus,secondaryExport} from './backup.js';
// Owner-private relay: the hosting access gate protects every endpoint.
const ORIGIN='https://hn-pocket-archive.karmi-nguyen.chatgpt.site';
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 const allowed=(request.method==='POST'&&['/api/capture','/api/maintenance'].includes(path))||(request.method==='GET'&&(['/api/snapshots','/api/backup','/api/health','/api/secondary/status','/api/secondary/export'].includes(path)||/^\/api\/snapshot\/\d{4}-\d{2}-\d{2}_(08|20)$/.test(path)));
 if(!allowed)return Response.json({service:'Margin private updater',error:'Use the supported archive endpoints.'},{status:path==='/'?200:404,headers:{'Cache-Control':'no-store'}});
 if(!env.MARGIN_UPDATER_KEY)return Response.json({error:'Updater is not configured'},{status:503});
 const relay=async(path,method='GET',body)=>{const r=await fetch(ORIGIN+path,{method,headers:{'X-Margin-Updater-Key':env.MARGIN_UPDATER_KEY,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});if(r.status>=300&&r.status<400)throw Error('Reader redirected unexpectedly');return r};
 try{
  if(path==='/api/secondary/status')return Response.json(await backupStatus(env.BUCKET),{headers:{'Cache-Control':'no-store'}});
  if(path==='/api/secondary/export')return secondaryExport(env.BUCKET);
  if(path==='/api/maintenance'){
   let status;try{status=await maintain(env.BUCKET,async p=>{const r=await relay(p);if(!r.ok)throw Error('Primary archive returned '+r.status);return r.json()})}catch(e){status=await backupStatus(env.BUCKET);const r=await relay('/api/operations','POST',status);return Response.json({...status,reportDelivered:r.ok},{status:502})}
   if(status.state==='busy')return Response.json(status,{status:202});
   const report=await relay('/api/operations','POST',status);if(!report.ok)throw Error('Backup saved but reader status could not be updated');
   return Response.json(status,{status:status.complete?200:202,headers:{'Cache-Control':'no-store'}});
  }
  const response=await relay(path,request.method);return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store',...(response.headers.get('content-disposition')?{'Content-Disposition':response.headers.get('content-disposition')}:{})}});
 }catch(e){return Response.json({error:e.message},{status:502,headers:{'Cache-Control':'no-store'}})}
}};
