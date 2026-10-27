# Release checks and their limits

Install the hooks in DEPLOYMENT.md in every native checkout. Commit both native trees before pushing main. The hook rejects deleted, non-main and non-HEAD pushes, mirrors exact committed source to GitHub, then runs `release-check.mjs` and `release-verify.mjs`. It checks both native HEADs and working trees again after validation. Never bypass it for publication.

Release validation installs locked dependencies, removes old builds, builds and packages both Workers, runs unit tests, desktop/phone/tablet offline checks, upgrade/storage-failure browser checks, and an isolated reader restore. Evidence records the exact GitHub commit, runtime versions, every required check and eight artifact hashes. Verification rejects dirty or changed source, stale or incomplete evidence, changed artifacts, and a GitHub main mismatch. A failed command produces no success evidence. Negative tests exercise these failure paths with real child processes as well as individual policy checks.

The hook prints a unique evidence filename outside the checkout. Immediately before saving a Sites version, run:

```sh
node scripts/release-verify.mjs /absolute/path/from/hook.json
```

Upload only the verified `dist/release.tar.gz` (or updater equivalent), paired with its native source commit in SOURCE_STATE.json. Do not rebuild between verification and upload. Verify deployment status and run `node --use-env-proxy scripts/check-production.mjs --anonymous`. Full read-only smoke testing requires a fresh private updater service token in the process environment; never save it in files or command arguments. No production check fetches HN or publishers.

The GitHub workflow independently runs release tests on pushes/PRs and anonymous production boundary checks daily. It needs no repository secrets. Workflow presence is not proof that GitHub executed it or that branch protection requires it. Local evidence is unsigned and mutable, and Sites does not enforce this local gate; authorized users can bypass it. Server-enforced deployment admission and protected branches would need host/repository administration support.

Rollback requires checking the older code against current stored data in isolation first. Never automatically roll back across an incompatible data migration. Upgrade tests cover legacy IndexedDB, old tabs, interrupted service-worker installation and quota failures. Chromium viewport checks do not prove actual iOS Home Screen behavior: physically open the installed app, save an article and comment, close it, enable airplane mode, reopen and read both. Notification receipt likewise requires an actual delivery/acknowledgement test.

## First exercised release, 2026-10-27

GitHub commit `861fadd30b74f2347834a9cc7b1e744eb313a2db` passed 54 reader/tooling tests, 7 updater tests, all browser checks and recovery locally. Independent GitHub Actions run https://github.com/karmiphuc/margin-hacker-news/actions/runs/40428054401 completed successfully. Native reader `656e5752bf6b0d8fd39f83ceab5f81788acbb391` was deployed successfully. Post-deployment anonymous boundaries and authenticated archived-content/health reads passed; capture and backup were healthy. No source requests were made. Historical evidence is in release-evidence/2026-10-27.json; later documentation commits do not make that evidence valid for a new release. The scheduled GitHub smoke job has not yet reached its first scheduled execution.
