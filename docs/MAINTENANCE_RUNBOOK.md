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

Both buckets use the same hosting provider/account boundary. This is not protection against loss of that whole account; periodically download an archive to storage you control outside the provider.
