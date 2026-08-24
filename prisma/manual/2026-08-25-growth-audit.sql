-- ProspectIQ schema change — 2026-08-25 — Growth Audit
--
-- Run this in the Supabase SQL Editor. It is the hand-written equivalent of the
-- migration Prisma would generate for the Growth Audit work, and exists because
-- a direct Prisma connection to this database is not always available.
--
-- Covers three changes to prisma/schema.prisma:
--   1. AgentRunType    + GROWTH_AUDIT enum value
--   2. Workspace       + 5 nullable branding / sender-identity columns
--   3. GrowthAudit     new table "growth_audits" (+ 2 unique, 3 indexes, 4 FKs)
--
-- Safe to run more than once: every statement is a no-op if already applied.
-- Purely additive — nothing is dropped, no column changes type or nullability,
-- and no existing row is read or modified. There is no accompanying rollback
-- script because there is nothing here to roll back to.
--
-- Naming matches Prisma's own conventions exactly (<table>_<col>_idx,
-- <table>_<col>_key, <table>_<col>_fkey, always ON UPDATE CASCADE) so a later
-- introspect or db push sees no drift.


-- ─────────────────────────────────────────────────────────────
-- 1. The new agent run type.
-- ─────────────────────────────────────────────────────────────
-- Deliberately NOT wrapped in a DO block: ALTER TYPE ... ADD VALUE is not
-- permitted inside a function body or subtransaction, so the IF NOT EXISTS form
-- has to be a plain top-level statement.
--
-- Nothing below this line uses 'GROWTH_AUDIT', which matters: Postgres forbids
-- using a new enum value in the same transaction that added it. If the editor
-- still objects, run this one statement on its own, then the rest.
ALTER TYPE "AgentRunType" ADD VALUE IF NOT EXISTS 'GROWTH_AUDIT';


-- ─────────────────────────────────────────────────────────────
-- 2. Agency branding and sender identity.
-- ─────────────────────────────────────────────────────────────
-- An audit is signed as the agency, not as ProspectIQ, because the agency's own
-- prospect is the one reading it. All five are nullable on purpose: every
-- existing workspace predates these columns, and each consumer already has to
-- cope with an agency that has not filled them in.
ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "brandColor"  TEXT,
  ADD COLUMN IF NOT EXISTS "senderName"  TEXT,
  ADD COLUMN IF NOT EXISTS "senderTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "senderEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl"  TEXT;


-- ─────────────────────────────────────────────────────────────
-- 3. The audits themselves.
-- ─────────────────────────────────────────────────────────────
-- "status" reuses the existing AgentRunStatus enum rather than declaring another
-- one — QUEUED, RUNNING, COMPLETED and FAILED are exactly an audit's states.
--
-- "sections" and "brandSnapshot" are JSONB so the shape of an audit can keep
-- changing without costing a migration; the zod schema in lib/ai/schemas.ts is
-- what enforces it. "auditScore"/"auditGrade" are real columns instead, so a
-- list of audits can be sorted and filtered in the database.
CREATE TABLE IF NOT EXISTS "growth_audits" (
    "id"              TEXT NOT NULL,
    "shareToken"      TEXT NOT NULL,
    "status"          "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage"    TEXT,
    "agentRunId"      TEXT,
    "headline"        TEXT,
    "summary"         TEXT,
    "sections"        JSONB,
    "auditScore"      DOUBLE PRECISION,
    "auditGrade"      TEXT,
    "brandSnapshot"   JSONB,
    "viewCount"       INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt"    TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "completedAt"     TIMESTAMP(3),
    "workspaceId"     TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "growth_audits_pkey" PRIMARY KEY ("id")
);

-- The share token is the only thing standing between a public URL and someone
-- else's audit, so it must be unique. It is 32 random bytes generated in code
-- rather than the cuid, because cuids are sequential enough to guess neighbours.
CREATE UNIQUE INDEX IF NOT EXISTS "growth_audits_shareToken_key"
  ON "growth_audits" ("shareToken");

-- One AgentRun produces at most one audit.
CREATE UNIQUE INDEX IF NOT EXISTS "growth_audits_agentRunId_key"
  ON "growth_audits" ("agentRunId");

-- Every audit read is scoped to a workspace; the other two carry the company
-- detail page and the polling query that watches for a run finishing.
CREATE INDEX IF NOT EXISTS "growth_audits_workspaceId_idx"
  ON "growth_audits" ("workspaceId");

CREATE INDEX IF NOT EXISTS "growth_audits_companyId_idx"
  ON "growth_audits" ("companyId");

CREATE INDEX IF NOT EXISTS "growth_audits_status_idx"
  ON "growth_audits" ("status");

-- Foreign keys, each matching the onDelete in schema.prisma.
--
-- workspace and company CASCADE: an audit is meaningless without the company it
-- is about, and deleting a workspace should not leave orphans behind.
--
-- agentRun and createdByUser SET NULL: an audit already sent to a prospect has
-- to survive its run record being swept and the person who made it leaving the
-- team. The document outlives both.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'growth_audits_agentRunId_fkey'
  ) THEN
    ALTER TABLE "growth_audits"
      ADD CONSTRAINT "growth_audits_agentRunId_fkey"
      FOREIGN KEY ("agentRunId") REFERENCES "agent_runs" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'growth_audits_workspaceId_fkey'
  ) THEN
    ALTER TABLE "growth_audits"
      ADD CONSTRAINT "growth_audits_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'growth_audits_companyId_fkey'
  ) THEN
    ALTER TABLE "growth_audits"
      ADD CONSTRAINT "growth_audits_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'growth_audits_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "growth_audits"
      ADD CONSTRAINT "growth_audits_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- Verification: all 16 rows must read true.
-- ─────────────────────────────────────────────────────────────
SELECT 'AgentRunType.GROWTH_AUDIT' AS item,
       EXISTS (
         SELECT 1 FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'AgentRunType' AND e.enumlabel = 'GROWTH_AUDIT'
       ) AS ok
UNION ALL
SELECT 'workspaces.' || c.name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'workspaces' AND column_name::text = c.name
       )
  FROM (VALUES ('brandColor'), ('senderName'), ('senderTitle'),
               ('senderEmail'), ('websiteUrl')) AS c(name)
UNION ALL
SELECT 'table growth_audits',
       EXISTS (
         SELECT 1 FROM information_schema.tables WHERE table_name = 'growth_audits'
       )
UNION ALL
SELECT 'index ' || i.name,
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'growth_audits' AND indexname::text = i.name
       )
  FROM (VALUES ('growth_audits_shareToken_key'), ('growth_audits_agentRunId_key'),
               ('growth_audits_workspaceId_idx'), ('growth_audits_companyId_idx'),
               ('growth_audits_status_idx')) AS i(name)
UNION ALL
SELECT 'fkey ' || f.name,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname::text = f.name)
  FROM (VALUES ('growth_audits_agentRunId_fkey'), ('growth_audits_workspaceId_fkey'),
               ('growth_audits_companyId_fkey'), ('growth_audits_createdByUserId_fkey')) AS f(name)
ORDER BY item;
