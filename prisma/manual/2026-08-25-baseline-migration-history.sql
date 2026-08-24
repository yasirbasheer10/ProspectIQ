-- ProspectIQ — baseline the migration history — 2026-08-25
--
-- Run this in the Supabase SQL Editor. It is the SQL equivalent of
--   npx prisma migrate resolve --applied 0_init
-- for when a direct Prisma connection isn't available.
--
-- WHAT THIS DOES, AND WHAT IT DOES NOT
--
-- `prisma/migrations/0_init/migration.sql` is the whole current schema — every
-- table this database already has. It must NOT be executed here; it would try to
-- create tables that exist. Instead it gets *recorded* as already applied, which
-- is what "baselining" means. So this script:
--
--   * creates Prisma's own bookkeeping table, `_prisma_migrations`
--   * inserts one row saying `0_init` was applied
--
-- It creates no tables of yours, alters no column, and touches no data.
--
-- Safe to run more than once — the insert is guarded, so a second run changes
-- nothing.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Prisma's bookkeeping table.
--
-- Column for column what Prisma's own schema engine creates for PostgreSQL
-- (extracted from the engine and then verified by letting Prisma create it on a
-- throwaway database and reading the result back). It has to match exactly, or
-- the first real migration will fail on a type it didn't expect.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."_prisma_migrations" (
    id                      VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Record 0_init as applied.
--
-- The checksum is the SHA-256 of prisma/migrations/0_init/migration.sql. Prisma
-- re-hashes that file on every `migrate status` / `migrate deploy` and refuses to
-- continue if it no longer matches, so: do not edit that file. If it ever needs
-- correcting, write a new migration instead.
--
-- The guard on `companies` is deliberate. Run against an EMPTY database this
-- script would claim the schema exists when it doesn't, and `migrate deploy`
-- would then skip 0_init forever, leaving a database with no tables and no way to
-- get them. So it refuses unless the schema is really there. For a genuinely
-- empty database you don't want this script at all — run `npx prisma migrate
-- deploy`, which creates everything properly.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    RAISE EXCEPTION
      'Refusing to baseline: this database has no "companies" table, so the schema is not actually here. Run `npx prisma migrate deploy` instead — it will create the schema and record it in one step.';
  END IF;

  INSERT INTO "public"."_prisma_migrations"
    (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
  SELECT
    gen_random_uuid()::text,
    '98977237cbaf48cd92ac3827e90fc0bef7f5252a8f5347a48402e810f9bf6074',
    '0_init',
    now(),
    now(),
    1
  WHERE NOT EXISTS (
    SELECT 1 FROM "public"."_prisma_migrations" WHERE migration_name = '0_init'
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verification. All three rows must read true.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT '_prisma_migrations exists' AS item,
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
       ) AS ok
UNION ALL
SELECT '0_init recorded exactly once',
       (SELECT count(*) FROM "public"."_prisma_migrations" WHERE migration_name = '0_init') = 1
UNION ALL
SELECT 'checksum matches the migration file',
       EXISTS (
         SELECT 1 FROM "public"."_prisma_migrations"
         WHERE migration_name = '0_init'
           AND checksum = '98977237cbaf48cd92ac3827e90fc0bef7f5252a8f5347a48402e810f9bf6074'
           AND rolled_back_at IS NULL
           AND finished_at IS NOT NULL
       );
