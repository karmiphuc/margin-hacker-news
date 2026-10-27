import test from 'node:test';
import assert from 'node:assert/strict';
import {artifacts, githubMain, requiredChecks, validateEvidence} from '../scripts/lib/release-evidence.mjs';
const now = Date.parse('2026-10-27T12:00:00Z');
const commit = 'a'.repeat(40);
const hashes = Object.fromEntries(artifacts.map(path => [path, 'b'.repeat(64)]));
const evidence = () => ({format:'margin-release-evidence-v1',commit,createdAt:new Date(now).toISOString(),runtime:{node:'v24',playwright:'1.62.1',chromium:'Chromium test'},checks:Object.fromEntries(requiredChecks.map(name=>[name,'passed'])),artifacts:{...hashes}});
const options = () => ({commit,hashes:{...hashes},now,remoteCommit:commit});
test('valid evidence binds every required check to the commit, artifacts and GitHub main',()=>{assert.equal(validateEvidence(evidence(),options()),true)});
test('missing and skipped checks fail closed',()=>{for(const kind of ['missing','skipped']){const e=evidence();if(kind==='missing')delete e.checks['offline-browser'];else e.checks['offline-browser']='skipped';assert.throws(()=>validateEvidence(e,options()),/required check/)}});
test('changed commit and modified or missing artifacts fail',()=>{let o=options();o.commit='c'.repeat(40);assert.throws(()=>validateEvidence(evidence(),o),/Source commit/);o=options();o.hashes[artifacts[0]]='c'.repeat(64);assert.throws(()=>validateEvidence(evidence(),o),/artifacts/);const e=evidence();delete e.artifacts[artifacts[0]];assert.throws(()=>validateEvidence(e,options()),/artifacts/)});
test('stale, future and invalid evidence timestamps fail',()=>{for(const date of [new Date(now-86400001).toISOString(),new Date(now+1).toISOString(),'not-a-date']){const e=evidence();e.createdAt=date;assert.throws(()=>validateEvidence(e,options()),/stale/)}});
test('missing, unreachable or divergent GitHub main cannot verify',()=>{for(const remoteCommit of [undefined,null,'d'.repeat(40)])assert.throws(()=>validateEvidence(evidence(),{...options(),remoteCommit}),/GitHub main/)});

test('GitHub transport and malformed output errors propagate',()=>{assert.throws(()=>githubMain(()=>{throw Error('network unavailable')}),/network unavailable/);assert.throws(()=>githubMain(()=>'unexpected'),/Unable to verify/);assert.equal(githubMain(()=>commit+'\trefs/heads/main\n'),commit)});

test('clean source check rejects modified and untracked files', async()=>{
  const {mkdtempSync,writeFileSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {execFileSync} = await import('node:child_process');
  const {cleanCommit} = await import('../scripts/lib/release-evidence.mjs');
  const dir=mkdtempSync(join(tmpdir(),'margin-release-test-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,stdio:'ignore'});
  try {
    git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');
    writeFileSync(join(dir,'source'),'original');git('add','source');git('commit','-qm','fixture');
    assert.match(cleanCommit(dir),/^[a-f0-9]{40,64}$/);
    writeFileSync(join(dir,'source'),'changed');assert.throws(()=>cleanCommit(dir),/must be clean/);
    git('checkout','--','source');writeFileSync(join(dir,'untracked'),'new');assert.throws(()=>cleanCommit(dir),/must be clean/);
  } finally {rmSync(dir,{recursive:true,force:true})}
});

test('release command stops without evidence when an install fails', async()=>{
  const {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,existsSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join,resolve} = await import('node:path');
  const {spawnSync,execFileSync} = await import('node:child_process');
  const tmp=mkdtempSync(join(tmpdir(),'margin-gate-test-')), dir=join(tmp,'repo'), bin=join(tmp,'bin'), out=join(tmp,'evidence.json');
  mkdirSync(join(dir,'scripts','lib'),{recursive:true});mkdirSync(bin);
  try {
    copyFileSync(resolve('scripts/release-check.mjs'),join(dir,'scripts','release-check.mjs'));
    copyFileSync(resolve('scripts/lib/release-evidence.mjs'),join(dir,'scripts','lib','release-evidence.mjs'));
    writeFileSync(join(bin,'npm'),'#!/bin/sh\nexit 3\n',{mode:0o755});
    const git=(...args)=>execFileSync('git',args,{cwd:dir,stdio:'ignore'});
    git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','fixture');
    const result=spawnSync(process.execPath,[join(dir,'scripts','release-check.mjs'),out],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH}});
    assert.notEqual(result.status,0);assert.match(result.stderr,/reader-install failed/);assert.equal(existsSync(out),false);
  } finally {rmSync(tmp,{recursive:true,force:true})}
});

test('Git environment strips inherited credential and config overrides', async()=>{
  const {gitEnvironment} = await import('../scripts/lib/release-evidence.mjs');
  const keys=['GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0','GIT_CONFIG_PARAMETERS','GIT_ASKPASS','SSH_ASKPASS'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {for(const key of keys)process.env[key]='test-only';const env=gitEnvironment();for(const key of keys)assert.equal(env[key],undefined);assert.equal(env.GIT_CONFIG_GLOBAL,'/dev/null')}
  finally {for(const key of keys)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}
});

test('release command produces artifact-bound evidence and rejects changed artifacts during checks', async()=>{
  const {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join,resolve} = await import('node:path');
  const {spawnSync,execFileSync} = await import('node:child_process');
  const {cleanCommit,fileHashes,validateEvidence} = await import('../scripts/lib/release-evidence.mjs');
  const tmp=mkdtempSync(join(tmpdir(),'margin-gate-integration-')), dir=join(tmp,'repo'), bin=join(tmp,'bin');
  mkdirSync(join(dir,'scripts','lib'),{recursive:true});mkdirSync(join(dir,'.openai'));mkdirSync(join(dir,'updater','.openai'),{recursive:true});mkdirSync(bin);
  try {
    copyFileSync(resolve('scripts/release-check.mjs'),join(dir,'scripts','release-check.mjs'));
    copyFileSync(resolve('scripts/lib/release-evidence.mjs'),join(dir,'scripts','lib','release-evidence.mjs'));
    writeFileSync(join(dir,'.gitignore'),'dist/\nnode_modules/\n');
    writeFileSync(join(dir,'.openai','hosting.json'),'{}');writeFileSync(join(dir,'updater','.openai','hosting.json'),'{}');
    writeFileSync(join(bin,'npm'),`#!/bin/sh\nif [ "$1" = ci ]; then mkdir -p node_modules/playwright; printf '{"version":"1.62.1"}' > node_modules/playwright/package.json; fi\nif [ "$1" = run ] && [ "$2" = build ]; then mkdir -p dist/server dist/.openai; cp .openai/hosting.json dist/.openai/hosting.json; printf bundled > dist/server/index.js; fi\nif [ "$1" = test ] && [ "$MARGIN_TEST_MUTATE" = yes ]; then printf changed >> dist/server/index.js; fi\nexit 0\n`,{mode:0o755});
    writeFileSync(join(bin,'node'),'#!/bin/sh\nexit 0\n',{mode:0o755});
    writeFileSync(join(bin,'chromium'),'#!/bin/sh\nprintf "Chromium test\\n"\n',{mode:0o755});
    const git=(...args)=>execFileSync('git',args,{cwd:dir,stdio:'ignore'});
    git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','fixture');
    const env={...process.env,PATH:bin+':'+process.env.PATH,CHROMIUM_PATH:join(bin,'chromium')};delete env.MARGIN_TEST_MUTATE;
    const good=join(tmp,'good.json'),bad=join(tmp,'bad.json');
    let result=spawnSync(process.execPath,[join(dir,'scripts','release-check.mjs'),good],{encoding:'utf8',env});
    assert.equal(result.status,0,result.stderr);const evidence=JSON.parse(readFileSync(good,'utf8'));const commit=cleanCommit(dir);
    assert.equal(validateEvidence(evidence,{commit,hashes:fileHashes(dir),remoteCommit:commit}),true);
    result=spawnSync(process.execPath,[join(dir,'scripts','release-check.mjs'),bad],{encoding:'utf8',env:{...env,MARGIN_TEST_MUTATE:'yes'}});
    assert.notEqual(result.status,0);assert.match(result.stderr,/artifact changed/);assert.equal(existsSync(bad),false);
  } finally {rmSync(tmp,{recursive:true,force:true})}
});
