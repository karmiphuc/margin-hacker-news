# Hosting and recovery setup

## Current deployments

| Component | Site project | URL | Audience |
| --- | --- | --- | --- |
| Reader | `appgprj_6add6b2bd5148191bee564f2d750cc9f` | https://hn-pocket-archive.karmi-nguyen.chatgpt.site | Public login page; server-side password gate protects data |
| Private updater | `appgprj_6add7d12de7081919dc2dfae6517a84c` | https://margin-private-updater.karmi-nguyen.chatgpt.site | Owner-private platform boundary |

The reader's logical R2 binding is `BUCKET`; there is no SQL database. Existing hosting IDs are retained for recovery of these exact deployments. Do not reuse another person's IDs when creating a new installation.

Build output is `dist/server/index.js`. A Sites deployment archive contains `.openai/hosting.json` and `dist/server/index.js` at those project-relative paths. Follow Sites source-push, save-version and deployment operations; never change the updater's audience to public. The updater's equivalent output is built inside `updater/`.

## Runtime secrets — values intentionally absent

| Name | Reader | Updater | Purpose |
| --- | --- | --- | --- |
| `MARGIN_UPDATER_KEY` | Required secret | Same secret | Authenticates allowlisted relay calls to the reader |
| `MARGIN_SETUP_HASH` | Required for setup/recovery-link issuance | — | SHA-256 of a random, private one-time setup capability |
| `MARGIN_SETUP_EXPIRES` | Required for setup | — | ISO timestamp after which that setup capability expires |

A restored deployment can use new secrets and a new password without changing restored content. Password hashes and sessions live under `auth/` in production R2 and are intentionally excluded from content backups. Source backup does not preserve existing login credentials.

For a new or local installation, generate a random setup token with `crypto.randomBytes(32).toString('base64url')`, hash it with SHA-256, configure only its hash and expiry on the server, and privately open `/setup#token=<token>`. Do not commit that token or put it in logs. Use test-only values for local development. The browser removes the fragment immediately; successful setup consumes it and displays a separate recovery code.

## Scheduling

- Capture: enabled hosted task `Automation_4c2dfbd42dac8191bdc742df3962feb6`, 08:00/20:00 UTC. It uses fresh service access to the private updater and calls `/api/capture` sequentially.
- Secondary content backup: monthly hosted task linked to the reader. Its exact ID is recorded in `SOURCE_STATE.json` after activation. It uses `/api/backup` on the private updater and uploads a draft GitHub release.

GitHub Actions secrets could not be managed by the available GitHub integration at setup time. The monthly task therefore uses the connected services at runtime and stores no credentials in a workflow or repository.

## Restore onto a new host

1. Build and test this repository. Provision an R2-compatible binding named `BUCKET` for the reader.
2. Configure fresh runtime secrets above; establish password setup using a new one-time link.
3. Verify and unpack a content backup using `scripts/unpack-archive.mjs`.
4. Import the generated `snapshots/`, `backups/`, and `cache/` objects under the same keys into the reader's bucket. Never overwrite a live archive indiscriminately; prefer a fresh recovery bucket.
5. Deploy the reader and verify a saved edition loads before enabling capture. This verification should not contact HN or publishers.
6. If using Sites, deploy the private updater and preserve its owner-private access. If using another host, replace that platform access boundary with equivalent service authentication before exposing the updater. Update its fixed reader origin if the reader URL changed.
7. Recreate the schedules for the new project identities and verify writer/readback access independently.

## Portable Worker example

`wrangler.example.jsonc` documents the basic reader entrypoint and binding. It is an example, not a configured deployment. Set the actual bucket name and account in your Cloudflare environment and configure secrets using the platform's secret manager. This repository contains no Cloudflare credentials and does not automatically migrate hosting.
