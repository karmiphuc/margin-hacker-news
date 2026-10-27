# Margin — Hacker News, saved

Source and recovery backup for [Margin](https://hn-pocket-archive.karmi-nguyen.chatgpt.site), a password-protected offline Hacker News reader.

- Top 100 HN stories, captured at **08:00 and 20:00 UTC**.
- Readable article copies, supported PDF/image files, and up to 50 comments per story.
- A recent 10-day calendar plus access to **all retained editions**.
- Offline downloads, search, article bookmarks, a separate Saved comments collection, and iPhone/iPad home-screen support.
- Structured Markdown articles and collapsible comment threads with parent links. New captures preserve formatting; existing successful captures are not re-fetched. Saved comments are device-local and included in device-data export/import.
- Password and recovery-code authentication with no external login in reader flows.
- Durable server storage independent of passwords; cached source content and conservative request pacing.

## Repository layout

| Path | Contents |
| --- | --- |
| `public/` | Plain HTML/CSS/JavaScript reader, login UI, icons, manifest, service worker |
| `src/` | Cloudflare Worker, authentication, capture/storage logic, article extraction and request pacing |
| `updater/` | Separate owner-private scheduler/export relay |
| `.openai/hosting.json` | Existing reader's non-secret hosting identity and R2 binding |
| `updater/.openai/hosting.json` | Existing private updater's non-secret hosting identity |
| `scripts/` | Build, local development, archive export, draft-release upload and restore preparation |
| `tests/` | Authentication, archive retention, request limits, extraction and backup validation |
| `docs/` | Hosting, operational, backup and recovery instructions |
| `SOURCE_STATE.json` | Original source commits and deployed project identities at backup time |

This is a Worker-backed app, not a GitHub Pages-only site. GitHub stores the code; private secondary content stays on the existing hosting provider. Production continues to run on its existing host.

## Local development

Requires Node.js 24 and npm:

```sh
npm ci
npm run build
npm test
npm run dev
```

Open `http://localhost:3000`. Authentication is intentionally enabled locally. See [deployment/setup instructions](docs/DEPLOYMENT.md) for creating test-only setup credentials. Local data goes in ignored `.data/`.

Build the updater separately:

```sh
cd updater
npm ci
npm run build
npm test
```

## Reliability and backups

- A separate owner-private updater bucket holds daily backup manifests, immutable saved editions and retained monthly checkpoints. Copies include articles, supported binaries and comments, never authentication records.
- Monthly restore checks reconstruct and validate each retained edition; app status shows the last successful backup and restore check. Backup work reads stored content only and never refetches HN/publishers.
- Scheduled health checks report missed/partial captures, stale/failed backups and overdue restore checks through task results. Enable Tasks notifications to receive them away from the app.
- Device downloads have checksums, shell readiness checks and per-edition counts. Settings include recovery instructions, bookmark/read-status export/import and a real-device airplane-mode checklist.
- Native pre-push hooks back up code to GitHub before publication; daily deployed-source drift checking covers other checkouts. Hooks must be installed in every new native checkout.

See `SOURCE_STATE.json` for current activation/verification status. Both storage buckets use the same hosting provider: periodically download an export to a location outside that account for full provider-loss recovery. GitHub contains code and recovery tooling, not public article archives. The earlier GitHub draft-release upload route remains blocked by upload authentication; it is not the scheduled backup destination.

Read [maintenance instructions](docs/MAINTENANCE_RUNBOOK.md), [recovery instructions](docs/RECOVERY.md), and [backup formats](docs/BACKUPS.md).

## Operational references

- [Application behavior and capture protocol](docs/APP_OPERATIONS.md)
- [Deployment, secret inventory, and fresh-host recovery](docs/DEPLOYMENT.md)
- [Backup formats and restoration](docs/BACKUPS.md)

The repository's existing Apache-2.0 `LICENSE` is preserved. Publisher articles and HN comments in private content backups remain their authors' content and are not relicensed by the source-code license.
