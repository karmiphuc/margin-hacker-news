# Margin private updater

This Site must remain owner-private. Its platform access boundary protects the scheduler. The Worker forwards only the snapshot operations and GET /api/backup to the password-protected reader using the shared `MARGIN_UPDATER_KEY` runtime secret. The secret is configured in both Sites, never in source. The reader additionally verifies it before reading or writing archived data.

For automation, obtain fresh service access for this private Site via Sites get_site. Send OAI-Sites-Authorization only to this private Site. Read GET /api/snapshots, POST /api/capture repeatedly until complete:true, and verify GET /api/snapshot/<id>. Read GET /api/backup for an archive export; it never captures or fetches upstream content. The public reader requires its own password cookie for ordinary visitors. No visitor identity or browser cookies are required for unattended updates.

Build with npm run build. Archive .openai/hosting.json and dist/server/index.js at their project-relative paths.
