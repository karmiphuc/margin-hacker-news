import TurndownService from 'turndown';
import {parseHTML} from 'linkedom';
export function contentFromHTML(html,baseURL='https://news.ycombinator.com/'){
 const {document}=parseHTML('<html><body>'+html+'</body></html>');
 for(const node of document.querySelectorAll('script,style,iframe,form,object,embed,svg,template,noscript'))node.remove();
 for(const a of document.querySelectorAll('a')){try{const u=new URL(a.getAttribute('href')||'',baseURL);if(!['http:','https:','mailto:'].includes(u.protocol))throw Error();a.setAttribute('href',u.href)}catch{a.removeAttribute('href')}}
 const converter=new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});
 converter.addRule('offlineImages',{filter:'img',replacement:(_,node)=>node.getAttribute('alt')?'[Image: '+node.getAttribute('alt')+']':''});
 const markdown=converter.turndown(document.body);
 for(const node of document.querySelectorAll('p,div,h1,h2,h3,h4,li,pre,blockquote,br'))node.appendChild(document.createTextNode('\n\n'));
 return {markdown,text:document.body.textContent.replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()};
}
