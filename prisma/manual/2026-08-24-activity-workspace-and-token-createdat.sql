-- ProspectIQ schema change — 2026-08-24
--
-- Equivalent to `npx prisma db push` for the P1 work. Run this in the Supabase
-- SQL Editor when a direct Prisma connection is not available.
--
-- Covers three changes to prisma/schema.prisma:
--   1. Activity.workspaceId       (nullable, FK to Workspace, cascade delete, indexed)
--   2. Workspace.activities       (back-relation only — no SQL needed)
--   3. VerificationToken.createdAt (defaults to now, so existing rows backfill)
--
-- Safe to run more than once: every statement is a no-op if already applied.
-- Purely additive — nothing is dropped and no existing row is modified.

-- 1. The workspace a logged activity belongs to.
--    Nullable on purpose: the table already holds rows from before this column
--    existed, and a NOT NULL column could not be added without discarding them.
ALTER TABLE "activities"
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

-- Every activity read filters by workspace, so this index carries the queries.
CREATE INDEX IF NOT EXISTS "activities_workspaceId_idx"
  ON "activities" ("workspaceId");

-- Match Prisma's `onDelete: Cascade`. Named exactly as Prisma would name it so
-- a later `db push` or introspect sees no drift.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_workspaceId_fkey'
  ) THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. Lets registration throttle per email address instead of trusting the
--    client's IP. Existing rows backfill to the moment this runs.
ALTER TABLE "verification_tokens"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Verification: all four rows must read true.
SELECT 'activities.workspaceId' AS item,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'activities' AND column_name = 'workspaceId'
       ) AS ok
UNION ALL
SELECT 'activities_workspaceId_idx',
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'activities' AND indexname = 'activities_workspaceId_idx'
       )
UNION ALL
SELECT 'activities_workspaceId_fkey',
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_workspaceId_fkey')
UNION ALL
SELECT 'verification_tokens.createdAt',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'verification_tokens' AND column_name = 'createdAt'
       );
