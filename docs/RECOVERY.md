# Recovery you control

## Keep outside the app

Save your Margin password and latest recovery code in a password manager. Also keep the hosting owner's account recovery methods and GitHub recovery codes somewhere safe. The downloadable in-app recovery guide contains instructions, not credentials. A password change/recovery issues a new recovery code and invalidates the old one.

Lost password: use `/recover` with the latest code. This changes authentication only; all saved server content remains. Lost password AND code: authenticate as the hosting owner, follow `DEPLOYMENT.md` to issue a fresh, short-lived one-time setup link, and configure a new password. Never delete or recreate the content bucket to reset authentication.

Bookmarks/read state live on each device. Export/import them in app settings; importing merges IDs. Signing out clears downloads and device preferences while keeping the server archive intact.

## Recover content when the primary is unavailable

1. Use the owner-private updater's fresh Sites service token and `GET /api/secondary/export`. This reads its own bucket; it does not require the primary server, user password, HN or publishers.
2. With credentials in process memory, set `MARGIN_BACKUP_SOURCE=secondary` and run `node --use-env-proxy scripts/archive-backup.mjs <private-output-directory>`. This uses the same private updater URL/token environment variables documented in BACKUPS.md. It creates a gzip archive and SHA-256 manifest.
3. Run `node scripts/unpack-archive.mjs <archive.jsonl.gz> <manifest.json> <new-restore-directory>`. It verifies and reconstructs snapshot, backup, article-cache and comment-cache objects without source requests.
4. Restore those objects under their exact relative keys into a fresh reader recovery bucket using the hosting provider's authenticated storage tooling. The current Sites connector does not provide bulk R2 object import; a full replacement-bucket restoration needs provider storage access/support. Do not overwrite a live bucket indiscriminately. Configure fresh runtime secrets/password setup independently; authentication is not in content backups.
5. Deploy source from GitHub, verify saved article/comment reads, then resume the collector and maintenance tasks. See DEPLOYMENT.md for hosting IDs and bindings.

If the backup index is damaged but immutable objects remain, use a retained daily/monthly manifest as the recovery index through the provider's storage tooling. Do not delete any immutable objects. If both hosted buckets/account are lost, recovery needs a previously downloaded off-provider export.

## Device test

Open the installed Home Screen app on the actual iPhone/iPad, save an edition, and use Check offline readiness. Turn on airplane mode AND turn off Wi-Fi. Close and reopen from Home Screen, then read a saved article, comments and a PDF/image when available. Restore networking and confirm server status. Repeat after clearing site data or an iOS upgrade. Local automated Chromium checks cannot certify actual Safari/Home Screen storage behavior. iOS may evict local content; server backups remain the source of recovery.
