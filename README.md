# Margin — Hacker News, saved

Source and recovery backup for [Margin](https://hn-pocket-archive.karmi-nguyen.chatgpt.site), a password-protected offline Hacker News reader.

- Top 100 HN stories, captured at **08:00 and 20:00 UTC**.
- Readable article copies, supported PDF/image files, and up to 50 comments per story.
- A recent 10-day calendar plus access to **all retained editions**.
- Offline downloads, search, bookmarks, and iPhone/iPad home-screen support.
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

This is a Worker-backed app, not a GitHub Pages-only site. GitHub stores the code and secondary backups; production continues to run on its existing host.

## Local development

Requires Node.js 24 and npm:

```sh
npm ci
npm run build
npm test
npm run dev
```

Open `http://localhost:3000`. Authentication is intentionally enabled locally. See [deployment/setup instructions](docs/DEPLOYMENT.md) for creating test-only setup credentials. Local data goes in ignored `.data/`.

The updater is dependency-free:

```sh
cd updater
npm run build
npm test
```

## Content backups

The repository is public, but **content archives are uploaded only as draft release assets** for repository collaborators. They are not committed to public Git history. Keep archive releases in draft; publishing one would expose its assets.

The monthly backup task exports already-saved server content and creates a gzip JSON Lines archive with a SHA-256 manifest. It does **not** scrape HN, contact publishers, or recapture articles. Archives include saved editions, article/PDF/image copies, and discussions, but not passwords, sessions, recovery secrets, or browser-local bookmarks/read status.

See [backup and restore instructions](docs/BACKUPS.md), [scheduled-task runbook](docs/BACKUP_RUNBOOK.md), and the [Releases page](https://github.com/karmiphuc/margin-hacker-news/releases) while signed in with collaborator access.

## Operational references

- [Application behavior and capture protocol](docs/APP_OPERATIONS.md)
- [Deployment, secret inventory, and fresh-host recovery](docs/DEPLOYMENT.md)
- [Backup formats and restoration](docs/BACKUPS.md)

Source changes are not automatically mirrored from hosting into GitHub. After changing the live reader or updater, update this repository and `SOURCE_STATE.json`. The periodic task backs up content, not uncommitted or unmirrored code changes.

The repository's existing Apache-2.0 `LICENSE` is preserved. Publisher articles and HN comments in private content backups remain their authors' content and are not relicensed by the source-code license.
