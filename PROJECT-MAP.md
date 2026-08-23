# ProspectIQ — project map

A plain-language guide to what this app does and which file to open when something needs fixing.
Written 2026-08-22 by reading every file. Update it when the structure changes.

---

## What the app does, in one paragraph

You describe your ideal customer (an "ICP") and what you sell (an "Offer"). The app then searches
the public web for companies that match, scrapes each company's site, uses AI to pull out
firmographics and buying signals, scores each company 0–100 on six factors, finds the likely
decision-maker, drafts a personalised outreach email, and tracks the reply. Everything is scoped
to a "Workspace" so one login can have several separate books of business.

## The pipeline, in order

```
ICP + Offer  →  DISCOVERY  →  INTELLIGENCE  →  SCORING  →  OUTREACH  →  CONVERSATION
              (find companies) (research them)  (rank them) (write email) (handle reply)
```

Each stage writes to the database and logs an `AgentRun` row so the UI can show progress.
The `ORCHESTRATOR` is a loop that walks companies through stages 2–4 automatically.

| Stage | Engine file | What it produces |
|---|---|---|
| Discovery | `lib/ai/discovery.ts` | `Company` + `Signal` rows |
| Intelligence | `lib/ai/intelligence.ts` | `Evidence`, `Signal`, `Opportunity`, `Contact` rows |
| Scoring | `lib/scoring/opportunity-score.ts` | `OpportunityScore` row, grade A–F |
| Outreach | `lib/ai/outreach.ts` | `OutreachMessage` row (a draft) |
| Conversation | `lib/ai/conversation.ts` | `Conversation` + `ConversationMessage` rows |
| Auto-pilot | `lib/ai/orchestrator.ts` | Runs 2→4 for every company in a loop |

---

## "Where do I go to fix…"

| Symptom | Open this |
|---|---|
| Discovery finds no companies / bad companies | `lib/ai/discovery.ts` |
| Google search returns 400 or nothing | `lib/ai/search.ts` |
| Company page scrape is empty | `lib/ai/discovery.ts` → `scrapeWebsite()` (uses Jina Reader) |
| Research is wrong / hallucinated | `lib/ai/intelligence.ts` → `buildPrompt()` |
| Scores feel wrong | `lib/scoring/opportunity-score.ts` (weights at the top) |
| Emails read badly | `lib/ai/outreach.ts` (the prompt is inline) |
| Wrong AI model / model errors | `lib/ai/gemini.ts` — **this file is Groq, not Gemini** |
| "…failed: <field> — Required" errors from a run | `lib/ai/schemas.ts` — the zod schema for that call rejected the model's reply |
| A run sits at "Running" forever, or gets marked failed too early | `lib/ai/stale-runs.ts` (15-minute no-progress timeout) |
| Auto-pilot stalls or loops | `lib/ai/orchestrator.ts` |
| Login / signup / Google / LinkedIn | `lib/auth.ts` |
| Redirects for logged-out / logged-in users | `proxy.ts` — **this is Next 16's middleware file** |
| "Workspace missing" / "You are not signed in" errors | `lib/session.ts` — `requireWorkspaceId()` throws rather than falling back to a default workspace |
| "Not found" on a record you can see in the database | `lib/authz.ts` — the `assertXInWorkspace` guards; a record in another workspace reports as missing on purpose |
| Signup rejected with "too many attempts" | `lib/rate-limit.ts` (per-IP window) and `app/api/auth/register/route.ts` (per-email cooldown) |
| Demo seed/reset returns 403 | `lib/api-guards.ts` — needs a JSON content-type, a matching `Origin`, and for reset the confirmation string |
| An email won't send to a specific address | `lib/outreach/suppression.ts` — it may be suppressed |
| Nothing in the Agent Activity feed | `lib/activity.ts` — the only writer; rows from before 2026-08-23 have no `workspaceId` and are hidden |
| Database connection errors | `lib/db.ts` and `prisma.config.ts` |
| `prisma db push` says the datasource url is required | you have no local `.env` — copy `.env.example` and fill it, or `npx vercel env pull .env.local` |
| Add or change a database field | `prisma/schema.prisma`, then run `npx prisma db push` |
| Which environment variables exist | `.env.example` — all 15, with required vs optional marked |
| Emails not sending | `lib/email.ts` (Resend) |
| Sidebar / nav | `components/layout/Sidebar.tsx`, `MobileNav.tsx` |
| A page's data is wrong | that page's `page.tsx` — each one queries Prisma directly |
| A button does nothing | that page's `actions.ts` — that's where the server code lives |

---

## Folder layout

```
app/
  (app)/          the logged-in app — 17 pages, each with page.tsx and often actions.ts
  (auth)/         login, signup, forgot-password, reset-password
  onboarding/     first-run wizard (ICP + Offer)
  api/            auth endpoints, health check, demo seed/reset
components/       shared UI (11 files) — layout/ and ui/
lib/              all the real logic (25 files) — see table above
prisma/           schema.prisma — 24 tables, 11 enums
types/            next-auth.d.ts — puts id/workspaceId/onboardingComplete on the session type
__tests__/        3 test files — scoring, demo fixtures, utils
scripts/          save.ps1 and undo.ps1 (your deploy + rollback)
proxy.ts          runs before every matched request — see note below
prisma.config.ts  resolves the database URL; reads .env / .env.local itself
.env.example      template for the above — copy it, don't guess
ProspectIQ-Landing-Page/   separate static marketing page, not wired into the app
```

### Every request starts from the session

No page or server action takes a `workspaceId` or `userId` from its caller — they were publicly
callable HTTP endpoints doing so, which is why this changed on 2026-08-23. The three entry points,
all in `lib/session.ts`:

- `requireWorkspaceId()` — the common case; returns the workspace or throws.
- `requireWorkspace()` — when you need the user id too.
- `requireSession()` — when you need the rest of the session, e.g. the user's name.

For anything reached by id, add the matching `assertXInWorkspace` from `lib/authz.ts`, or scope the
write itself with `updateMany`/`deleteMany` on `workspaceId` and throw when `count === 0`. Don't read
the record, check it, then write it — that's a race.

### `proxy.ts` — don't delete this, it's live

In Next.js 16 the file that used to be called `middleware.ts` is now called `proxy.ts`. So this
file is real code that runs on every matching request, before any page does. It does two things:
sends logged-out visitors from `/dashboard/...` to `/login`, and sends logged-in visitors away from
the login/signup/forgot-password/reset-password pages to `/dashboard`.

Its `matcher` currently only covers `/dashboard`, so the other sixteen logged-in pages rely on the
check in `app/(app)/layout.tsx` instead. Widening that matcher is the cheapest way to cover them.

Every page is a server component that queries Prisma directly — there is no REST API layer for
app data. Buttons call server actions in the sibling `actions.ts`.

Pages in `(app)/`: dashboard, discovery, companies, companies/[id], opportunities, contacts,
outreach, conversations, sequences, analytics, agents, agents/[id], agents/[id]/settings,
agent-activity, deploy, settings, profile.

---

## Outside services it depends on

| Service | Used for | Env var | If the key is missing |
|---|---|---|---|
| Groq | all AI (model `openai/gpt-oss-120b`) | `GROQ_API_KEY` | falls back to a dummy key, calls fail |
| Serper | Google search | `SERPER_API_KEY` | search returns null; discovery and research now fail the run loudly |
| Jina Reader | reading company websites | `JINA_API_KEY` | works unauthenticated but rate-limited |
| Hunter.io | finding real email addresses | `HUNTER_API_KEY` | skipped silently |
| Resend | sending email | `RESEND_API_KEY` | email skipped |
| Supabase/Postgres | the database | `DATABASE_URL` | app cannot start |
| Google + LinkedIn | social login | `GOOGLE_*`, `LINKEDIN_*` | those buttons fail |

Hunter is only called when a company scores 70+, to protect the 50-credits/month free tier.

---

## Known problems found on 2026-08-22

Listed worst-first. The whole **P0 and P1** batches from `ARCHITECTURE-AUDIT.md` are now fixed
(items 1–11 there); what's left is P2 — maintainability, tests, migrations.

1. **Fixed 2026-08-22 — fake companies are no longer hardcoded.** `lib/ai/discovery.ts` used to
   return `["vercel.com", "stripe.com", "linear.app"]` in two places when the AI call failed, so a
   broken run looked identical to a successful one. `searchForTargetsWithAI` now throws with the
   real reason — empty AI response, a response with no `domains` array, any error inside the
   function, or every search query coming back empty — and `runDiscoveryEngine`'s handler logs that
   reason and marks the `AgentRun` **FAILED**.
2. **Fixed 2026-08-22 — fake people are no longer hardcoded.** `performMockSearch()` in
   `lib/ai/intelligence.ts` invented plausible names, roles and email addresses when Serper failed,
   and the AI then saved them as real contacts. The function is deleted; `researchCompany` now
   throws when the search returns no results, which marks the run **FAILED** and shows the reason
   on the company page.
3. **Fixed 2026-08-23 — every action checks who is logged in.** 8 of 13 action files used to act on
   any record id they were handed, and `triggerIntelligenceRun(companyId, workspaceId)` took the
   workspace from the browser. Server actions are public HTTP endpoints, so that was the real hole,
   not a theoretical one. Identity now comes from `lib/session.ts` and ownership from `lib/authz.ts`
   — see "Every request starts from the session" above. The clearest case was `profile/page.tsx`,
   which loaded whichever user had `isDemo: true` rather than the signed-in one, so every account
   shared a single profile record.
4. **Fixed 2026-08-23 — the activity log is scoped to a workspace.** `Activity` now has a
   `workspaceId` and `lib/activity.ts` is the only writer. The feed's query had no `where` clause at
   all, so every workspace read every other one's activity — including company names, contact names
   and error text — and clearing the log deleted all workspaces' rows, not just yours. Rows written
   before this date have a null `workspaceId` and appear in no feed; nothing recorded which workspace
   they belonged to, so there's nothing to backfill from.
5. **A whole unused AI system.** `lib/ai/providers.ts` and `lib/ai/provider.ts` define
   `getAIProvider()`, `DemoAIProvider` and `OpenAIProvider`. Nothing outside those two files uses
   them. `AI_PROVIDER`, `OPENAI_API_KEY` and `DEMO_MODE` mostly exist for this dead code.
6. **Misleading filename.** `lib/ai/gemini.ts` contains the Groq client. `@google/genai` is still
   in `package.json` but unused. Comments elsewhere still talk about "Gemini Flash" limits.
7. **No database migration history.** There's no `prisma/migrations/` folder, so schema changes go
   out via `prisma db push`. Fine for one user; means there's no way to review or roll back a
   schema change.
8. **Fixed:** the build script used to run `prisma db push --accept-data-loss` on every Vercel
   deploy, which could drop columns from the live database without asking. Now it's just
   `prisma generate && next build`.
9. **Fixed:** ten loose scratch files that used to sit in the root (`test-groq.js`,
   `test-groq-list.js`, `test-groq-model.js`, `scratch_serper.ts`, `test.ts`, `test-db.ts`,
   `test-dashboard.ts`, `test-intelligence.ts`, `prospectiq-fixes-1-4.patch`,
   `supabase_migration.sql`) were deleted on 2026-08-22. They're all still in git history if one
   is ever needed back. **`proxy.ts` was deliberately kept** — see the note below; it is live code.
10. **Tests only cover scoring, demo fixtures and utils.** Nothing tests discovery, intelligence,
    outreach or auth.
11. **Fixed 2026-08-23 — LLM output is validated before it reaches the database.** All four engines
    used to `JSON.parse` the model's reply and write the fields straight into Prisma, so a missing
    field became an empty column and an unrecognised `SignalType` string became a failed insert
    halfway through a run. `lib/ai/schemas.ts` now holds one zod schema per call site and a shared
    `parseAIResponse(raw, schema, label)` that throws a message naming the real problem. It also
    fixed a live bug in `conversation.ts`, whose prompt asked the model for `QUALIFIED | WON | LOST`
    while the code only accepted `CONVERTED | LOST` — so the opportunity status could only ever be
    set to `LOST`.
12. **Fixed 2026-08-23 — dead runs are detectable.** Background work is started with an un-awaited
    promise inside a serverless request, so when the function is frozen the run stays `RUNNING`
    forever and the UI polls it forever. `sweepStaleRuns()` in `lib/ai/stale-runs.ts` marks any
    `QUEUED`/`RUNNING` run with no write in 15 minutes as `FAILED`, and is called from the discovery
    poller, the agent-activity page and the dashboard. This is a safety net, not a scheduler — the
    pipeline still has nowhere durable to run.
13. **Fixed 2026-08-23 — the register route no longer returns raw errors.** It used to reply
    `Debug Error: ${error.message}`, handing database and stack text to any client. It now logs
    server-side and returns *"Could not create your account. Please try again."*
14. **Fixed 2026-08-23 — registration is throttled.** 5 attempts per IP per 15 minutes (in memory,
    `lib/rate-limit.ts`) plus a 2-minute per-email cooldown read from `VerificationToken`, which is
    the durable half — the in-memory window is per serverless instance and resets on every cold
    start, so on its own it's bypassed by rotating IPs.
15. **Fixed 2026-08-23 — `researchCompany` is transactional and idempotent.** Its writes used to
    land one at a time, so a failure halfway left a company with evidence but no opportunity, and
    re-running it duplicated everything. The writes are now one `$transaction` and re-runs dedupe on
    natural keys instead of inserting again. The Hunter.io call sits outside the transaction on
    purpose — an HTTP call inside one holds a pooled connection open for its whole duration.
16. **Fixed 2026-08-23 — the demo endpoints can't be triggered from another site.** `/api/demo/reset`
    wiped a workspace on any POST. It now needs a JSON content-type, a matching `Origin`, and the
    literal confirmation string; `/api/demo/seed` needs the first two. Neither returns the internal
    error text any more.

---

## How work gets deployed

`main` is the only branch and Vercel deploys it automatically. To ship:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\save.ps1 -Message "what you changed"
```

To take back the last change:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\undo.ps1
```

Schema changes are separate and deliberate: `npx prisma db push` after editing
`prisma/schema.prisma`. Never put database commands back into the build script.

**When a change touches both code and schema, push the schema first.** Vercel deploys the moment
`save.ps1` pushes, so if the code lands before the column exists, the live site runs new code against
an old database and throws until you catch up. Order: `npx prisma db push`, check the site still
works, then `save.ps1`.

`db push` needs a local `.env` or `.env.local` — the URL is not read from Vercel. If it fails with
*"The datasource.url property is required"*, that file is missing. Copy `.env.example`, or run
`npx vercel link` then `npx vercel env pull .env.local`.
