# Secondary content backups

## Current backup destination

Routine backups now target the private updater's separate R2 bucket, with daily manifests and retained monthly checkpoints. See [MAINTENANCE_RUNBOOK.md](MAINTENANCE_RUNBOOK.md) for storage semantics and `SOURCE_STATE.json` for verification/schedule state. Use `MARGIN_BACKUP_SOURCE=secondary` with the exporter to download verified copies without contacting the primary reader. Recovery and provider/account-loss limitations are in [RECOVERY.md](RECOVERY.md).

The earlier initial export was verified locally (1 edition, 100 stories, 77 articles, 3,006 comments), but GitHub release upload returned HTTP 401. No content was uploaded into GitHub. That optional route below is not scheduled.

## Planned storage and visibility

Once upload access is available, monthly exports will live in GitHub **draft releases**, normally tagged `archive-YYYY-MM`. The source repository remains public. Draft release assets are restricted to repository collaborators; do not publish an archive release. The upload script refuses an existing release that is not a draft.

Each run uploads timestamped `.jsonl.gz` and `.manifest.json` files. A second run in the same month adds another timestamped pair rather than overwriting an earlier backup. Previous monthly backups are retained. Source code stays in normal Git history; large cached content never enters that history.

The archive contains every retained server edition, including saved articles/binary copies and comments. A manifest records SHA-256, compressed byte count, edition/story/article/comment totals, and the code checkout commit. It excludes passwords, session tokens, recovery codes, service credentials, local bookmarks, and read state. Failed publisher captures remain explicitly unavailable; a backup cannot invent content that was never captured.

## Manual backup

Follow [BACKUP_RUNBOOK.md](BACKUP_RUNBOOK.md) to obtain fresh authorized access. With that access held only in process memory:

```sh
node --use-env-proxy scripts/archive-backup.mjs backups/
node scripts/publish-backup.mjs backups/ARCHIVE.jsonl.gz backups/ARCHIVE.jsonl.gz.manifest.json
```

The first command requires `MARGIN_PRIVATE_UPDATER_URL` and `MARGIN_SITE_SERVICE_TOKEN` in its environment. The second requires an authenticated GitHub CLI with content/release write access. Do not put either credential in arguments, shell history, source, or log output. A manual run only reads the existing archive; it never invokes `/api/capture`.

## Download and verify

Sign in to GitHub as a repository collaborator. Open Releases to see drafts, or use:

```sh
gh release list --repo karmiphuc/margin-hacker-news
gh release download archive-YYYY-MM --repo karmiphuc/margin-hacker-news --dir backups/
node scripts/unpack-archive.mjs backups/ARCHIVE.jsonl.gz backups/ARCHIVE.jsonl.gz.manifest.json .restore
```

Choose the matching timestamped file pair. The unpacker verifies the compressed file checksum, validates records and totals, and requires a new output directory to avoid overwriting a prior restore.

It creates:

- `snapshots/<edition>.json`: all saved editions.
- `backups/<edition>.json`: completed-edition backup copies.
- `cache/articles/<url-hash>.json`: reconstructed reusable article cache, preferring successful captures.
- `cache/comments/<story-id>.json`: saved discussions with their original capture times.
- `restore-manifest.json`: restoration totals and source checksum.

It does not contact any source site, write to production, or restore credentials. Upload the object files into a fresh recovery bucket using your hosting provider's authenticated R2 tools. Keep their relative keys exactly as generated; do not upload `restore-manifest.json` as application data. Configure a fresh password separately if needed.

Do not upload extracted content or backup archives to public Git branches, issues, logs, or published releases.
