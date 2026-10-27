import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {cleanCommit, fileHashes, githubMain, gitEnvironment, validateEvidence} from './lib/release-evidence.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.length !== 3) throw Error('Usage: node scripts/release-verify.mjs /absolute/path/to/evidence.json');
const evidence = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const commit = cleanCommit(root);
// Do not let a configured remote point at an unrelated repository.
const expected = 'https://github.com/karmiphuc/margin-hacker-news.git';
const remote = execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8',env:gitEnvironment()}).trim();
if (remote !== expected) throw Error('Unexpected GitHub origin');
const remoteCommit = githubMain(() => execFileSync('git',['ls-remote','--exit-code',expected,'refs/heads/main'],{cwd:tmpdir(),encoding:'utf8',env:gitEnvironment()}));
validateEvidence(evidence,{commit,hashes:fileHashes(root),remoteCommit});
console.log(`Evidence verified for ${commit}; deploy only the validated artifacts. Sites publication is not enforced by this check.`);
