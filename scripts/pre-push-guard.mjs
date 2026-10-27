// Local workflow guard; native hosting permissions still allow other publish paths.
import {spawnSync,execFileSync} from 'node:child_process';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';import {tmpdir} from 'node:os';import {validatePush} from './lib/push-policy.mjs';
const [rootArg,readerArg,updaterArg]=process.argv.slice(2);if(!updaterArg)throw Error('Usage: pre-push-guard.mjs GITHUB_CHECKOUT READER UPDATER');const root=resolve(rootArg),reader=resolve(readerArg),updater=resolve(updaterArg),cwd=process.cwd();if(![reader,updater].includes(cwd))throw Error('Unknown native checkout');
const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('GIT_')||k==='SSH_ASKPASS')delete env[k];
const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,env,encoding:'utf8'}).trim();
const nativeHeads={reader:git(reader,'rev-parse','HEAD'),updater:git(updater,'rev-parse','HEAD')};
if(!validatePush(readFileSync(0,'utf8'),nativeHeads[cwd===reader?'reader':'updater']))process.exit(0);
for(const source of [reader,updater])if(git(source,'status','--porcelain'))throw Error('Commit or preserve all native source changes before release validation');
function run(file,args){const r=spawnSync(process.execPath,[join(root,'scripts',file),...args],{cwd:root,env,stdio:'inherit'});if(r.error||r.status!==0)throw Error(file+' failed; native push blocked')}
run('mirror-source.mjs',['--repo',root,'--reader',reader,'--updater',updater]);
const evidence=join(tmpdir(),'margin-release-'+randomUUID()+'.json');run('release-check.mjs',[evidence]);run('release-verify.mjs',[evidence]);
const state=JSON.parse(readFileSync(join(root,'SOURCE_STATE.json'),'utf8'));for(const [name,path] of [['reader',reader],['updater',updater]]){if(git(path,'status','--porcelain')||git(path,'rev-parse','HEAD')!==nativeHeads[name]||state[name].source_commit!==nativeHeads[name])throw Error('Native source changed during validation; push blocked')}
console.log(JSON.stringify({guard:'passed',evidence,readerArchive:join(root,'dist/release.tar.gz'),updaterArchive:join(root,'updater/dist/release.tar.gz'),warning:'Upload only these verified archives; Sites itself does not enforce this local gate.'}));
