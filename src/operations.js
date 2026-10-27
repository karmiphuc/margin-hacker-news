import {getSnapshot,listSnapshots,slotAt} from './capture.js';
import {equal} from './auth.js';
export async function serviceAuthorized(request,env){const key=request.headers.get('x-margin-updater-key');return !!(key&&env.MARGIN_UPDATER_KEY&&await equal(key,env.MARGIN_UPDATER_KEY))}
export async function saveOperations(request,env){if(!await serviceAuthorized(request,env))return Response.json({error:'Updater access required'},{status:403});const raw=await request.text();if(raw.length>12000)return Response.json({error:'Report too large'},{status:413});let report;try{report=JSON.parse(raw)}catch{return Response.json({error:'Invalid report'},{status:400})}if(!['healthy','in_progress','failed'].includes(report.state)||!Number.isFinite(Date.parse(report.checkedAt)))return Response.json({error:'Invalid report'},{status:400});await env.BUCKET.put('operations/secondary.json',JSON.stringify(report));return Response.json({ok:true})}
function readableArticle(story){const a=story.article;return a?.status==='saved'&&(['pdf','image'].includes(a.format)?typeof a.data==='string'&&a.data.length>0:typeof a.text==='string'&&a.text.trim().length>0)}
// Compare only a small number of retained editions. This observes archived data;
// health checks never call publishers, repair snapshots, or initiate capture.
async function captureQuality(bucket,editions,latest,alerts){
 if(!latest?.complete)return null;
 const stories=latest.stories||[],readable=stories.filter(readableArticle).length;
 if(!stories.length)alerts.push({code:'empty_capture',message:'Latest edition completed without any stories.'});
 else if(!readable)alerts.push({code:'no_readable_articles',message:'Latest edition completed without any readable articles. Check capture sources before relying on this edition.'});
 const emptySaved=stories.filter(s=>s.article?.status==='saved'&&!readableArticle(s)).length;
 if(emptySaved)alerts.push({code:'empty_saved_articles',message:emptySaved+' articles marked saved contain no readable content.'});
 if(stories.length&&stories.every(s=>s.commentsStatus==='unavailable'))alerts.push({code:'discussions_unavailable',message:'Every discussion in the latest edition was unavailable.'});
 const candidates=editions.filter(e=>e.id<latest.id).slice(0,6),rates=[];
 for(const {id} of candidates){const previous=await getSnapshot(bucket,id);if(previous?.complete&&previous.stories?.length>=50)rates.push(previous.stories.filter(readableArticle).length/previous.stories.length)}
 const baseline=rates.length>=3?rates.sort((a,b)=>a-b)[Math.floor(rates.length/2)]:null;
 const rate=stories.length?readable/stories.length:0;
 if(stories.length>=50&&baseline!==null&&baseline-rate>=0.35&&rate<baseline/2)alerts.push({code:'capture_quality_drop',message:'Readable article coverage fell to '+Math.round(rate*100)+'%, compared with '+Math.round(baseline*100)+'% across recent editions. Publisher availability can vary; investigate before recapturing.'});
 return {readableArticles:readable,emptySavedArticles:emptySaved,readableRate:rate,baselineRate:baseline,baselineEditions:rates.length};
}
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
 const quality=await captureQuality(bucket,editions,latest,alerts);
 return {checkedAt:now.toISOString(),state:alerts.length?'attention':'healthy',expectedEdition:expected,editions:editions.length,latest:latest?{id:latest.id,capturedAt:latest.capturedAt,complete:latest.complete,...counts}:null,backup:backup||null,quality,alerts};
}
