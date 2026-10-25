import {Transform} from 'node:stream';
export function validateEdition(s){
 if(!s||typeof s!=='object'||!/^\d{4}-\d{2}-\d{2}_(08|20)$/.test(s.id)||!Array.isArray(s.stories)||!Number.isFinite(Date.parse(s.capturedAt)))throw Error('Invalid archive edition');
 for(const key of ['auth','password','hash','salt','recoveryHash','sessions','token'])if(Object.hasOwn(s,key))throw Error('Authentication material is not allowed in an archive');
 for(const story of s.stories)if(!Number.isSafeInteger(story.id)||typeof story.title!=='string')throw Error('Invalid story record');
 return s;
}
export class ArchiveValidator extends Transform {
 constructor(){super();this.pending='';this.decoder=new TextDecoder('utf-8',{fatal:true});this.ids=new Set();this.stats={editions:0,stories:0,savedArticles:0,comments:0};}
 consume(text){this.pending+=text;if(this.pending.length>256*1024*1024)throw Error('Archive record exceeds validation memory limit');let end;while((end=this.pending.indexOf('\n'))>=0){const line=this.pending.slice(0,end);this.pending=this.pending.slice(end+1);if(line.trim())this.record(line)}}
 record(line){const s=validateEdition(JSON.parse(line));if(this.ids.has(s.id))throw Error('Duplicate edition in archive');this.ids.add(s.id);this.stats.editions++;this.stats.stories+=s.stories.length;this.stats.savedArticles+=s.stories.filter(x=>x.article?.status==='saved').length;this.stats.comments+=s.stories.reduce((n,x)=>n+(x.comments?.length||0),0);this.push(JSON.stringify(s)+'\n');}
 _transform(chunk,encoding,done){try{this.consume(this.decoder.decode(chunk,{stream:true}));done()}catch(e){done(e)}}
 _flush(done){try{this.consume(this.decoder.decode());if(this.pending.trim())this.record(this.pending);if(!this.stats.editions)throw Error('Archive is empty');done()}catch(e){done(e)}}
}
