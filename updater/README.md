# Margin private updater and secondary archive

This Site must remain owner-private. Its separate `BUCKET` R2 binding stores content-addressed copies of reader editions, daily manifests, retained monthly checkpoints and restore-check status. It shares a provider with the reader but not its bucket. Never change this Site to public.

The shared runtime `MARGIN_UPDATER_KEY` authenticates allowlisted calls to the reader. No secrets or password records are copied. The reader's public password login remains independent of platform identity.

## Supported unattended operations

Get a fresh `siwc_bypass_bearer_token` via Sites get_site and send it only to this private Site as `OAI-Sites-Authorization: Bearer …`. Keep the token in process memory, not files, arguments or logs.

- `GET /api/snapshots`, `GET /api/snapshot/<id>`, `POST /api/capture`: existing paced collector.
- `GET /api/backup`: primary archive export.
- `POST /api/maintenance`: copy up to three missing editions and check up to three restores per call. Repeat sequentially until `complete:true`. A busy lease returns `retryAfter`; wait before retrying. No HN/publisher requests are made. A partial old edition is backed up as partial and refreshed on later days.
- `GET /api/secondary/status`: read persisted backup/restore status.
- `GET /api/secondary/export`: stream checksum-verified copies directly from this bucket, without calling the reader. Authentication records are excluded.
- `GET /api/health`: primary capture/backup health. Only the relay may write the primary's backup report.

Monthly verification reconstructs each retained snapshot in a temporary namespace, rereads/checks its hash and readable article/comment structure, then removes that scratch object. Daily and monthly manifests and immutable content objects are retained without automatic deletion. This protects against primary bucket loss, not an outage or account loss affecting both Sites.

Build: `npm ci && npm run build`; tests: `npm test`. Package `.openai/hosting.json` and `dist/server/index.js`. Before pushing native source, install the GitHub mirror hooks from the backup repository. The maintenance runbook and recovery guide are in https://github.com/karmiphuc/margin-hacker-news/tree/main/docs .
