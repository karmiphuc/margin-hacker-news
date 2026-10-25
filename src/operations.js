import {getSnapshot,listSnapshots,slotAt} from './capture.js';
import {equal} from './auth.js';
export async function serviceAuthorized(request,env){const key=request.headers.get('x-margin-updater-key');return !!(key&&env.MARGIN_UPDATER_KEY&&await equal(key,env.MARGIN_UPDATER_KEY))}
export async function saveOperations(request,env){if(!await serviceAuthorized(request,env))return Response.json({error:'Updater access required'},{status:403});const raw=await request.text();if(raw.length>12000)return Response.json({error:'Report too large'},{status:413});let report;try{report=JSON.parse(raw)}catch{return Response.json({error:'Invalid report'},{status:400})}if(!['healthy','in_progress','failed'].includes(report.state)||!Number.isFinite(Date.parse(report.checkedAt)))return Response.json({error:'Invalid report'},{status:400});await env.BUCKET.put('operations/secondary.json',JSON.stringify(report));return Response.json({ok:true})}
export async function health(bucket,{now=new Date()}={}){
 const editions=await listSnapshots(bucket),latest=editions[0]?await getSnapshot(bucket,editions[0].id):null,backup=await (await bucket.get('operations/secondary.json'))?.json();
 // Allow two hours for paced capture and publisher backoff; inspect both expected slots.
 const expected=slotAt(new Date(+now-2*3600000));const expectedEdition=editions.some(e=>e.id===expected)?await getSnapshot(bucket,expected):null;
 const previousDate=new Date(expected.slice(0,10)+'T'+expected.slice(-2)+':00:00Z');const previous=slotAt(new Date(+previousDate-12*3600000));
 const alerts=[];if(!expectedEdition)alerts.push({code:'missed_capture',message:'Expected edition '+expected+' is missing.'});else if(!expectedEdition.complete)alerts.push({code:'incomplete_capture',message:'Edition '+expected+' is only partially captured.'});
 if(latest&&previous>=editions.at(-1)?.id&&!editions.some(e=>e.id===previous))alerts.push({code:'missed_previous_capture',message:'Previous edition '+previous+' is missing.'});
 if(!backup?.lastSuccessAt)alerts.push({code:'backup_missing',message:'No successful secondary backup has been reported.'});else if(+now-Date.parse(backup.lastSuccessAt)>36*3600000)alerts.push({code:'backup_stale',message:'Secondary backup is more than 36 hours old.'});
 if(backup?.state==='failed')alerts.push({code:'backup_failed',message:'Latest secondary backup failed: '+backup.error});
 if(backup?.state==='in_progress')alerts.push({code:'backup_incomplete',message:'Secondary backup has unfinished work.'});
 if(!backup?.lastRestoreAt||+now-Date.parse(backup.lastRestoreAt)>35*86400000)alerts.push({code:'restore_due',message:'A verified monthly restore check is due.'});
 const counts=latest?{stories:latest.stories.length,processed:latest.stories.filter(s=>s.article).length,articles:latest.stories.filter(s=>s.article?.status==='saved').length,unavailableArticles:latest.stories.filter(s=>s.article?.status==='unavailable').length,comments:latest.stories.reduce((n,s)=>n+(s.comments?.length||0),0),unavailableDiscussions:latest.stories.filter(s=>s.commentsStatus==='unavailable').length}:null;
 if(latest?.complete&&counts.stories<100)alerts.push({code:'short_edition',message:'Latest edition contains fewer than 100 stories.'});
 return {checkedAt:now.toISOString(),state:alerts.length?'attention':'healthy',expectedEdition:expected,editions:editions.length,latest:latest?{id:latest.id,capturedAt:latest.capturedAt,complete:latest.complete,...counts}:null,backup:backup||null,alerts};
}
