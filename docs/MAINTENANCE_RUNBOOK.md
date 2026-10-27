# Daily protection and source mirror

## Active schedules

- Daily backup, monthly restore checks, and source drift: `Automation_c36647ce6c088191bcad7fcc89919c8c`, 09:30 UTC.
- Failure watch: `Automation_e23c1d3e13a08191bc5e454ae91e82b7`, 11:00 and 23:00 UTC.
- Existing capture: `Automation_4c2dfbd42dac8191bdc742df3962feb6`, 08:00 and 20:00 UTC.

Initial maintenance and secondary-download restoration passed on 2026-10-25. These checks verify the endpoints; schedule creation does not mean future task execution or notification delivery has occurred.

## Boundaries

Reader Site: `appgprj_6add6b2bd5148191bee564f2d750cc9f` (public password gate).
Private updater Site: `appgprj_6add7d12de7081919dc2dfae6517a84c` (owner-private).
Code: `karmiphuc/margin-hacker-news`, public. Never publish content backups or secrets here.

1. Use Sites get_site on the updater. Confirm owner-private access, obtain its current live URL and fresh `siwc_bypass_bearer_token`. Hold credentials in memory only; send that token only to this private Site using `OAI-Sites-Authorization: Bearer …`. Never print it, put it in arguments, or write it to disk.
2. POST `/api/maintenance` sequentially until `complete:true`, at most 200 calls per run. It copies and verifies up to three editions per call and performs bounded monthly restore checks. If `state:busy`, wait `retryAfter` before retrying. For transport errors, retry at most three times with increasing delays. A failed response is a failure to report, never a reason to clear storage or refetch HN. Incomplete work at the run limit must be reported.
3. Read GET `/api/secondary/status`; verify `state:healthy`, a current `lastSuccessAt`, and a current-month `lastRestoreAt`. Read GET `/api/health` and report actionable alerts, especially missed/incomplete editions, stale/failed backups and due restore checks. Existing 08:00/20:00 UTC capture tasks remain responsible for source collection. Maintenance must not call `/api/capture`, scrape, or republish.
4. Check source drift: get_site and list_site_versions for both Sites. Use the deployed version's exact source commit (not an un-deployed latest edit). Read `SOURCE_STATE.json` from GitHub using the connected GitHub tool. If commits match, no source sync is needed. If changed, obtain fresh native source credentials and open/clone both repositories without exposing tokens. Check out the deployed commits in isolated detached worktrees. Clone GitHub to a clean checkout; run `node scripts/mirror-source.mjs --repo <github-checkout> --reader <reader-worktree> --updater <updater-worktree>`. The script copies allowlisted committed source, updates source IDs, and pushes GitHub. Native source credentials must never be sent to GitHub; the script strips transient Git auth headers. Verify GitHub's SOURCE_STATE matches those deployed commits afterward. Never push or republish either native Site during this drift check. If supported source access or GitHub write access fails, report the blocker; do not fabricate success.
5. Notify the owner through the task result on failure or actionable health alerts. Healthy routine checks should be quiet. Do not send email/Slack, change audiences, rotate passwords, or delete archive objects.

## Separate failure watch

Use fresh updater service access as above. GET `/api/health` and `/api/secondary/status` only. Report meaningful new/continuing failures in the task result, including unreachable services. Do not report success if the check could not run. Do not call capture, maintenance, or deployment operations. Notification delivery depends on the user's Tasks notification settings.

## Storage policy

The updater's R2 binding belongs to its own project, separate from the reader's bucket. Immutable `objects/<sha256>.json` files hold snapshots, including saved articles and comments. `daily/YYYY-MM-DD.json` indexes each successful day's backup, `monthly/YYYY-MM.json` retains the first successful checkpoint of each month. Both and their objects are retained indefinitely. `backup/index.json` is the latest export index; source deletions never prune it. Incomplete source editions are preserved as partial copies and refreshed on later days. Nothing under reader `auth/` is copied. Monthly verification reconstructs copies in a temporary namespace, reads and validates them, then removes only its own temporary objects.

Both buckets use the same hosting provider/account boundary. Protection against loss of that whole account now uses the independent export procedure below.

## Independent content backups: GitHub first, Drive fallback

After successful secondary maintenance, export the secondary archive using BACKUP_RUNBOOK.md. Attempt a private draft GitHub release first; the repository is public, so never publish the release or commit its assets. If upload fails, do not repeatedly retry a persistent 401 in the same run. Remove only an empty draft created by this attempt. Use the owner's private Google Drive folder `1Dz3u5X2jngGYqzgslXhYQm5BHfY6mvi0` (Margin backups) as the fallback. Verify folder and file permissions are owner-only before claiming protection. Never broaden sharing.

Upload both the `.jsonl.gz` archive and `.manifest.json`. Look up filenames first to avoid duplicates when resuming. Download the stored pair, verify the manifest SHA-256, then run `node scripts/qa-recovery.mjs ARCHIVE MANIFEST`. Report failure unless uploaded bytes can be read and restored. This check uses a temporary reader and fresh test password; never touches production authentication or fetches source content. Retain the first successful pair each calendar month indefinitely; daily pairs may also be retained. Do not delete old backups automatically. If GitHub succeeds, read back and verify its draft attachments instead; Drive is the fallback, not a second mandatory copy. If both fail, keep the secondary bucket intact and report the unresolved external-copy failure.

Initial Drive fallback was uploaded, downloaded and restored on 2026-10-27: 4 editions, 400 stories, 328 saved articles and 12,350 comments. SHA-256 `b000815ec5a036e3154a40f545ac3173416dcdff543d220b6416b4d2bec31386`. Archive file `1kc4MxSovOE_lA3JvbjJv7UDj1We54MKs`; manifest `1ln0YEoWLQ4CYNuS0EHrszrdjiK9vsZ68`. Both verified owner-only. GitHub attachment upload returned 401; no content was published there.

## Watch the scheduled checks too

Failure watch must also use automations peek for capture and maintenance. Maintenance must peek the failure-watch task. Evaluate enabled state and the latest run's scheduled_for, recorded_status and matching latest_result, allowing two hours after each existing UTC schedule. Missing/disabled, overdue, failed, or still-in-progress runs are actionable. A failure message is attributable only when its run_id matches and its created_at is at or after that attempt's started_at. Do not mistake last_run_time, a task's existence or null history for a successful check. `scripts/lib/watchdog.mjs` implements the policy for these existing daily UTC schedules, with malformed-input tests.

Run status does not prove notification delivery: the scheduler currently reports delivery as unknown. Include that limit when reporting a drill. Cross-checking tasks on the same scheduler still cannot detect a complete scheduler/account outage. The GitHub daily anonymous smoke check adds a separate execution platform, but cannot see private capture/backup health and its execution and notification delivery must be verified separately.
