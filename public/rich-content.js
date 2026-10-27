import MarkdownIt from 'markdown-it';
const markdown=new MarkdownIt({html:false,linkify:true,typographer:false});
markdown.renderer.rules.image=(tokens,i)=>'<span class="image-description">'+markdown.utils.escapeHtml(tokens[i].content||'Image omitted from readable copy')+'</span>';
const originalLink=markdown.renderer.rules.link_open||((tokens,i,options,env,self)=>self.renderToken(tokens,i,options));
markdown.renderer.rules.link_open=(tokens,i,options,env,self)=>{tokens[i].attrSet('target','_blank');tokens[i].attrSet('rel','noopener noreferrer');return originalLink(tokens,i,options,env,self)};
export function renderContent(value,plain=false){
 const text=String(value||'');if(!plain)return markdown.render(text);
 const escape=markdown.utils.escapeHtml;let start=0,html='';for(const link of markdown.linkify.match(text)||[]){if(!markdown.validateLink(link.url))continue;html+=escape(text.slice(start,link.index))+'<a href="'+escape(link.url)+'" target="_blank" rel="noopener noreferrer">'+escape(link.text)+'</a>';start=link.lastIndex}html+=escape(text.slice(start));return '<p>'+html.replace(/\r\n/g,'\n').replace(/\n[ \t]*\n/g,'</p><p>').replace(/\n/g,'<br>')+'</p>';
}
export function withParents(comments){const stack=[];return comments.map(c=>{const depth=Math.max(0,Number(c.depth)||0);while(stack.length&&stack.at(-1).depth>=depth)stack.pop();const inferred=stack.at(-1);const explicit=Object.hasOwn(c,'parentId');const result={...c,depth,parentId:explicit?c.parentId:inferred?.id??null,parentBy:c.parentBy||(!explicit?inferred?.by:null)||null};stack.push(result);return result})}
export function validSavedComment(r){return !!r&&Number.isSafeInteger(r.id)&&r.id>0&&r.comment?.id===r.id&&typeof r.comment.text==='string'&&r.comment.text.length<=200000&&(r.comment.markdown===undefined||typeof r.comment.markdown==='string'&&r.comment.markdown.length<=300000)&&typeof r.comment.by==='string'&&r.comment.by.length<=100&&Number.isSafeInteger(r.story?.id)&&typeof r.story.title==='string'&&r.story.title.length<=2000&&typeof r.edition==='string'&&/^\d{4}-\d{2}-\d{2}_(08|20)$/.test(r.edition)&&Number.isFinite(Date.parse(r.savedAt))}
