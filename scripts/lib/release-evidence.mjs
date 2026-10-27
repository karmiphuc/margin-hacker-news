import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

export const requiredChecks = ['reader-install','updater-install','reader-build','updater-build','reader-package','updater-package','reader-tests','updater-tests','offline-browser','upgrade-browser','recovery-drill'];
export const artifacts = ['.openai/hosting.json','dist/server/index.js','dist/.openai/hosting.json','dist/release.tar.gz','updater/.openai/hosting.json','updater/dist/server/index.js','updater/dist/.openai/hosting.json','updater/dist/release.tar.gz'];
export function fileHashes(root) {
  return Object.fromEntries(artifacts.map(path => [path, createHash('sha256').update(readFileSync(`${root}/${path}`)).digest('hex')]));
}
export function gitEnvironment() {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') || key === 'SSH_ASKPASS') delete env[key];
  env.GIT_CONFIG_NOSYSTEM = '1'; env.GIT_CONFIG_GLOBAL = '/dev/null'; env.GIT_TERMINAL_PROMPT = '0';
  return env;
}
export function cleanCommit(root) {
  const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', env:gitEnvironment()}).trim();
  if (git('status','--porcelain=v1','--untracked-files=all')) throw Error('Release checkout must be clean, including untracked files');
  return git('rev-parse','--verify','HEAD^{commit}');
}
export function validateEvidence(evidence, {commit, hashes, now=Date.now(), maxAgeMs=24*60*60*1000, remoteCommit}) {
  if (!evidence || evidence.format !== 'margin-release-evidence-v1') throw Error('Invalid release evidence format');
  if (!/^[a-f0-9]{40,64}$/.test(commit) || evidence.commit !== commit) throw Error('Source commit changed');
  const created = Date.parse(evidence.createdAt);
  if (!Number.isFinite(created) || created > now || now-created > maxAgeMs) throw Error('Release evidence is stale or has an invalid timestamp');
  if (!evidence.runtime || ['node','playwright','chromium'].some(key => typeof evidence.runtime[key] !== 'string' || !evidence.runtime[key].trim())) throw Error('Runtime versions are missing');
  if (!evidence.checks || Object.keys(evidence.checks).length !== requiredChecks.length || requiredChecks.some(name => evidence.checks[name] !== 'passed')) throw Error('A required check is missing or did not pass');
  if (!evidence.artifacts || Object.keys(evidence.artifacts).length !== artifacts.length || artifacts.some(path => !/^[a-f0-9]{64}$/.test(evidence.artifacts[path] || '') || evidence.artifacts[path] !== hashes[path])) throw Error('Build artifacts changed or are missing');
  if (remoteCommit !== commit) throw Error('GitHub main does not match this release commit');
  return true;
}

export function githubMain(readRemote) {
  const output = readRemote(); // Transport errors must propagate; no offline success.
  const match = output.trim().match(/^([a-f0-9]{40,64})\s+refs\/heads\/main$/);
  if (!match) throw Error('Unable to verify GitHub main');
  return match[1];
}
