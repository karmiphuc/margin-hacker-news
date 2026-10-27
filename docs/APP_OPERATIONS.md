# Margin

A password-protected Hacker News offline reader. The public Site origin exposes a login page; the Worker authorizes every snapshot API and capture request server-side. The Worker retains all captured snapshots in the `BUCKET` R2 binding. The browser keeps explicitly downloaded editions in IndexedDB and the app shell in a service-worker cache.

## Run locally

`npm install`, `npm run build`, then `node --use-env-proxy scripts/dev.mjs` (Node 24). Local storage lives in ignored `.data/`. Run `npm test` after building.

## Capture protocol

`GET /api/snapshots` lists all retained editions, while the calendar shows the latest 10 days. The All saved editions selector reaches older copies. `GET /api/snapshot/YYYY-MM-DD_08` (or `_20`) reads only storage and falls back to an immutable completed-edition backup if the primary copy is missing/unreadable. `GET /api/backup` streams all editions as JSON Lines; it excludes authentication records and secrets. No automatic deletion of server editions or local downloads runs. Browser eviction and explicit device clearing still affect device-local copies, not the server archive.

`POST /api/capture` starts or resumes the current UTC slot. The first request freezes the top 100 IDs, then subsequent requests process 3 stories at a time with at most 2 active workers. A conditional-write lease permits only one collector at a time across devices and automation invocations. Completed editions are read back without contacting sources. The first completed call seeds reusable article/comment caches and writes an immutable backup copy in the same R2 bucket. This protects against application overwrites; it is not a separate-provider disaster backup. Download the full archive for an independent copy.

The collector uses the official Firebase HN API and HN's Algolia discussion API. Successful source articles are reused by normalized URL without automatic refetching; the original capturedAt is retained. This is an archive of the saved copy, not tracking later publisher edits. HN item metadata is cached for 30 minutes; discussions are cached for 12 hours, with previously saved discussions used if refresh fails. Failed publisher fetches are negatively cached for at least 24 hours. Every source hostname is paced to one request start per 500 ms, with a global collector concurrency limit of 2. Rate-limit and server-error responses persist a cooldown, honor Retry-After, and use increasing backoff; 401/403 responses pause the publisher for at least a day. There is no immediate retry loop.

A busy response includes `busy:true,retryAfter:5`; wait rather than start another job. A throttled HN source includes `pausedUntil`; do not retry before then. Existing editions remain available while collection is paused. Resuming a partially completed capture uses stored intermediate results. Password setup/change/recovery only changes `auth/` records, never snapshots, content caches, or backups.

## Password and home-screen app

Password setup, login, changes, and recovery do not use an external identity provider. A cryptographically random, single-use setup capability is shared privately with the user in a URL fragment. Only its SHA-256 hash (`MARGIN_SETUP_HASH`) and expiry (`MARGIN_SETUP_EXPIRES`) are configured server-side. The browser immediately removes the fragment from history and sends the token in a POST body. Conditional R2 writes prevent simultaneous consumption. Do not store the capability itself in source, logs, or client bundles.

The Worker stores a salted PBKDF2-SHA256 password hash (100,000 iterations). Sessions use random 256-bit tokens, store only token hashes server-side, and set Secure, HttpOnly, SameSite=Strict cookies for 90 days. Password changes and recovery rotate the password version to revoke old sessions. A random 256-bit recovery code is shown only when setting/changing/resetting a password; only its hash is persisted. Recovery requires that code, rotates it, and does not reactivate the setup link. Auth mutations enforce same-origin and throttle password attempts through conditional R2 writes. No native identity header grants access or password recovery.

Use `/setup#token=<private capability>` for initial setup, `/password` with the current password for changes, or `/recover` with the recovery code for resets. Never put a default password in source. Local tests use test-only setup hashes and secrets. Never expose the local development server to untrusted users.

The Web App Manifest, PNG icons, standalone display mode, Apple web-app metadata and service worker support Add to Home Screen. Apple Passwords can use device biometrics to autofill the password; this is not a WebAuthn/passkey implementation. Downloaded content is device-local and available offline after login. Sign out clears local downloads, caches, bookmarks and read status. Offline copies are not remotely encrypted or remotely revocable; use the device lock.

## Unattended updates

The automation uses the separate **owner-private** updater Site `appgprj_6add7d12de7081919dc2dfae6517a84c`. Obtain its live URL and fresh platform service access through Sites get_site. Send its OAI-Sites-Authorization Bearer header only to that private Site. Use GET /api/snapshots, POST /api/capture until complete:true, and GET /api/snapshot/<id> for readback. That private relay forwards only these allowlisted operations to this reader using the server-only `MARGIN_UPDATER_KEY` secret configured in both Sites. The reader verifies this key independently of the visitor password. No credential belongs in the automation prompt or source.

Preserve the enabled 08:00/20:00 UTC schedule. Routine updates do not republish. Respect busy/retryAfter and pausedUntil. Retry transient request failures at most three times with increasing delays and resume persisted batches. Never retry before an upstream cooldown expires. Never weaken the reader's API authentication to make a scheduler run.

## Limits

The archive starts on first capture; historical ranks cannot be backfilled. HN has no public comment scores, so we store the first 50 available comments in thread order (root threads ranked using official HN item kids). Replies retain source order. Saved HTML article copies are readable text with source attribution. Direct PDF, PNG, JPEG, GIF, WebP, and AVIF links are saved as complete files up to 10 MB, and plain text/Markdown sources are supported. Embedded media and videos are not downloaded. Pages behind access restrictions, non-HTML content, blocked publishers and extractor failures are explicitly marked unavailable. Partial old editions can still be downloaded. Browser eviction or clearing site data removes local downloads; request persistent storage where supported. Bookmarks and read state are device local; archive content is retained independently of them and independently of the password.

## Reliability operations

`GET /api/health` (password or updater authenticated) reports capture completeness, saved counts, missed scheduled editions after a two-hour grace period, stale/failed secondary backups, and due restore checks. `POST /api/operations` accepts status only from the private updater's runtime key, never from an ordinary password session. The updater now owns a separate private R2 bucket for daily backup manifests and retained monthly checkpoints; the reader does not expose that bucket.

The archive status panel shows server protection and device downloads separately. Save offline writes a checksum and verifies storage; the readiness action checks the shell and saved editions. The service worker caches only an authenticated reader shell, preserving it when the online session expires. Device downloads remain usable offline and are cleared by explicit sign-out. Settings provide recovery instructions, bookmark/read-status export/import, and the physical iPhone/iPad airplane-mode checklist.

Optional browser QA: run `node scripts/qa-offline.cjs` with Playwright and Chromium available after building. This tests desktop/phone/tablet layouts and offline reopen using synthetic data; it is not a physical iOS certification.

For future deployments, use the GitHub repository's `scripts/install-mirror-hooks.mjs` to attach its source mirror to both native checkouts before pushing. The hook backs up committed source before the hosting push; a scheduled drift check catches deployments from other checkouts. GitHub: https://github.com/karmiphuc/margin-hacker-news .

## Structured reading and saved comments

New captures retain Markdown alongside their original plain-text field (article capture version 3), preserving headings, paragraphs, emphasis, links, lists, quotations and code blocks. Comments include actual parent IDs/authors and depth; older editions infer parents from their retained thread order/depth. Existing successful captures are never re-fetched just to change formatting. Formatting already stripped from old snapshots cannot be reconstructed reliably.

The browser bundles Markdown rendering into the offline app script. Raw HTML is disabled, unsafe link protocols are rejected and image syntax does not load external resources. Comment threads can be collapsed; parent links reveal the parent. Each comment can be saved to a dedicated IndexedDB `savedComments` store, independent of article bookmarks and independent of the downloaded edition. The Saved comments view spans all editions and supports search/removal offline.

IndexedDB upgrades from version 1 to 2 without deleting editions. Saved comments are device-local, included as complete records in device-data export v2 and accepted alongside v1 bookmark/read imports. They are not synchronized to the server. Sign-out clears them with other device data; export before clearing the device. Offline cache version 8 delivers the bundled renderer and new shell together.
