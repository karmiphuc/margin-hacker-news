// Mirror exact committed sources. Credentials and runtime data never enter this path.
import {execFileSync} from 'node:child_process';import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';import {resolve,dirname,join} from 'node:path';
const options=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2===0?[...a,[v.replace(/^--/,''),all[i+1]]]:a,[]));
const root=resolve(options.repo||'.'),reader=resolve(options.reader||'../sites/hn-pocket'),updater=resolve(options.updater||'../sites/margin-updater');
// A source-repository credential must never be sent to GitHub.
const env={...process.env};for(const k of Object.keys(env))if(/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/.test(k)||['GIT_ASKPASS','SSH_ASKPASS'].includes(k))delete env[k];
const git=(cwd,...args)=>execFileSync('git',args,{cwd,env,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
if(git(root,'status','--porcelain'))throw Error('GitHub checkout has uncommitted changes; preserve them before mirroring');
if(git(root,'remote','get-url','origin')!=='https://github.com/karmiphuc/margin-hacker-news.git')throw Error('Unexpected mirror destination');
git(root,'pull','--ff-only','origin','main');
const before=existsSync(join(root,'.source-mirror.json'))?JSON.parse(readFileSync(join(root,'.source-mirror.json'),'utf8')):{paths:[]};const paths=[];const hashes={};
for(const [name,source,prefix] of [['reader',reader,''],['updater',updater,'updater/']]){
 hashes[name]=git(source,'rev-parse','HEAD');const files=git(source,'ls-tree','-r','--name-only','HEAD').split('\n');
 for(const file of files){if(!/^(src\/|public\/|scripts\/|tests\/|worker\.js$|backup\.js$|package(?:-lock)?\.json$|README\.md$|\.gitignore$|\.openai\/hosting\.json$)/.test(file))continue;if(/(^|\/)(node_modules|dist|\.data|backups|\.env)(\/|$|\.)/.test(file)||file.includes('..'))throw Error('Unsafe source path');
 const target=name==='reader'&&file==='README.md'?'docs/APP_OPERATIONS.md':prefix+file;
 const data=execFileSync('git',['show',hashes[name]+':'+file],{cwd:source,env,maxBuffer:20*1024*1024});
 if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(data.toString()))throw Error('Credential-shaped value found in '+target);
 // Preserve repository-specific backup tools and ignore rules.
 if(target==='.gitignore')continue;
 mkdirSync(dirname(join(root,target)),{recursive:true});writeFileSync(join(root,target),data);paths.push(target);
 }
}
for(const old of before.paths)if(!paths.includes(old)){if(old.startsWith('src/')||old.startsWith('public/')||old.startsWith('updater/')||old==='docs/APP_OPERATIONS.md')rmSync(join(root,old),{force:true})}
const state=JSON.parse(readFileSync(join(root,'SOURCE_STATE.json'),'utf8'));state.reader.source_commit=hashes.reader;state.updater.source_commit=hashes.updater;state.source_mirror={method:'Native source pre-push hook plus scheduled drift check',reader_commit:hashes.reader,updater_commit:hashes.updater};
writeFileSync(join(root,'SOURCE_STATE.json'),JSON.stringify(state,null,2)+'\n');writeFileSync(join(root,'.source-mirror.json'),JSON.stringify({paths},null,2)+'\n');
git(root,'add','--',...new Set([...paths,...before.paths,'SOURCE_STATE.json','.source-mirror.json']));
if(git(root,'diff','--cached','--name-only'))git(root,'commit','-m','Mirror deployed Margin reader and updater sources');
git(root,'-c','credential.helper=!gh auth git-credential','push','origin','main');
console.log(JSON.stringify({mirrored:true,githubCommit:git(root,'rev-parse','HEAD'),...hashes}));
