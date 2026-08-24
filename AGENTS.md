<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ProspectIQ — read these first

Two documents in the repo root describe this codebase. Read them before exploring the code; they
were written from a full file-by-file read and will save you rediscovering the same things.

- **`PROJECT-MAP.md`** — what the app does, the six-stage pipeline, which file owns which stage,
  a "where do I go to fix X" lookup table, and the external services with their env vars.
- **`ARCHITECTURE-AUDIT.md`** — a detailed review of the architecture, data model, scoring and
  enrichment logic, backend, frontend and cross-cutting concerns, with what's well built, what
  needs work, and a prioritised fix order (P0/P1/P2) at the end.

If you change the structure of the app, update `PROJECT-MAP.md`. If you fix something listed in
`ARCHITECTURE-AUDIT.md`, strike it off the fix order there.

## Working agreements

- `main` is the only branch and Vercel auto-deploys it. Ship with
  `powershell -ExecutionPolicy Bypass -File .\scripts\save.ps1 -Message "what changed"`.
  Roll back with `.\scripts\undo.ps1`.
- The app has no external users — the live Vercel site is the owner's own test environment. Don't
  propose pull requests, preview environments or branch protection.
- Never put database commands in the `build` script. It stays `prisma generate && next build`. The
  build previously ran `prisma db push --accept-data-loss` on every deploy and could drop live
  columns.
- Schema changes go through migrations, and `prisma/README.md` is the procedure — read it before
  touching `prisma/schema.prisma`. Short version: edit the schema, generate the SQL with
  `prisma migrate diff --from-config-datasource --to-schema`, **read the SQL**, apply with
  `prisma migrate deploy`, commit schema and migration together.
- Don't use `prisma db push` (no migration is written, so the history stops describing the database)
  or `prisma migrate dev` (needs a shadow database, and offers to reset the only one there is).
  Neither is in `package.json` any more.

