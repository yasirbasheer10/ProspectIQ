# Schema changes

Until 2026-08-24 every schema change went out through `prisma db push`. That gave no review of
destructive changes, no rollback, and no record of when a column appeared — the P2 item 19 in
`ARCHITECTURE-AUDIT.md`. This directory is the replacement.

There is one database: the Supabase project behind the live Vercel deployment, which is also the
owner's test environment. Everything below is written for that — one database, no staging, no
shadow copy.

---

## One-time: baseline the live database

`prisma/migrations/0_init/migration.sql` is the whole current schema, generated from
`prisma/schema.prisma` with no database connection:

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o prisma/migrations/0_init/migration.sql
```

The live database **already has every one of those tables**, so `0_init` must never be executed
against it — it has to be recorded as already applied instead. That is what baselining means.

Do it by running `prisma/manual/2026-08-25-baseline-migration-history.sql` in the **Supabase SQL
Editor**. It creates Prisma's `_prisma_migrations` table and inserts one row; it creates none of your
tables and touches no data. The three verification rows at the end must all read `true`. It refuses
to run against a database that doesn't already have the schema, because baselining an empty database
would leave it with no tables and no way to get them.

The equivalent, if you'd rather use the CLI and have a working `POSTGRES_URL_NON_POOLING` in `.env`:

```bash
npx prisma migrate resolve --applied 0_init
```

Either way, `npx prisma migrate status` should then say "Database schema is up to date!" with
`0_init` recorded. Both routes were tested against a throwaway Postgres on 2026-08-25 — the SQL
script produces the same row Prisma writes itself, checksum included, and a following migration
applies cleanly on top of it.

---

## Every schema change after that

**1.** Edit `prisma/schema.prisma`.

**2.** Generate the SQL for exactly that change. Pick a folder name of `<UTC timestamp>_<what it
does>`, e.g. `20260824193000_add_outreach_workspace_id`:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/20260824193000_your_change/migration.sql
```

**3. Read the SQL.** This is the step the old `db push` didn't have. A `DROP COLUMN`, `DROP TABLE`
or a `NOT NULL` added to a populated table will destroy data. If you see one you didn't intend, fix
the schema and regenerate rather than editing the SQL — the file has to stay a faithful diff.

**4.** Apply it:

```bash
npx prisma migrate deploy
```

Only pending migrations run, and each one is recorded with a checksum on success.

**5.** Regenerate the client:

```bash
npx prisma generate
```

**6.** Commit `prisma/schema.prisma` and the new migration folder together, in one commit. A schema
without its migration is the thing this directory exists to prevent.

### Drift check

Exit code 2 means the live database no longer matches `schema.prisma`:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

---

## Things not to do

**Don't run `prisma db push` any more.** It changes the database without writing a migration, so
the history stops describing what's actually there. It was removed from `package.json`'s scripts on
2026-08-24 for that reason.

**Don't use `prisma migrate dev`.** It's the normal development command and it is wrong here twice:
it needs a shadow database (it creates and drops a temporary one on the same server), and when it
detects drift it offers to **reset** — drop every table and reapply from scratch. There is only one
database and it holds real work. `migrate diff` + `migrate deploy` gets the same result without
either hazard, and makes you read the SQL first.

**Don't put migrations in the `build` script.** It stays `prisma generate && next build`. Vercel
builds must not touch the schema; you apply migrations by hand before pushing. The build used to run
`prisma db push --accept-data-loss` on every deploy and could drop live columns.

**Don't edit an applied `migration.sql`.** Prisma stores a SHA-256 of each file and refuses to
continue if one changes. `.gitattributes` keeps these files LF-only on every machine for the same
reason — a CRLF checkout would change the hash. If an applied migration was wrong, write a new
migration that corrects it.

---

## `prisma/manual/`

SQL that gets pasted into the Supabase SQL Editor, for when a direct Prisma connection isn't
available. Every file is idempotent and ends with verification rows that must read `true`.

- `2026-08-25-baseline-migration-history.sql` — the one-time baseline above. Bookkeeping only.
- `2026-08-24-activity-workspace-and-token-createdat.sql` — retired. A schema change from before
  migrations existed (`Activity.workspaceId`, `VerificationToken.createdAt`). Both columns are in
  `0_init`, so a database rebuilt from the migration history needs nothing from it.

**Don't add schema changes here any more** — that's what `prisma/migrations/` is for, and a change
applied by hand from this folder wouldn't be in the history. Migration SQL that has to be run by hand
because the CLI can't connect is fine: paste `prisma/migrations/<name>/migration.sql` into the editor
and then record it, the same way the baseline script does.
