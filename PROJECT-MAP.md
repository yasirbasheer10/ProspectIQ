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
| Auto-pilot stalls or loops | `lib/ai/orchestrator.ts` |
| Login / signup / Google / LinkedIn | `lib/auth.ts` |
| Redirects for logged-out / logged-in users | `proxy.ts` — **this is Next 16's middleware file** |
| "Workspace missing" errors | `lib/session.ts` |
| Database connection errors | `lib/db.ts` and `prisma.config.ts` |
| Add or change a database field | `prisma/schema.prisma`, then run `npx prisma db push` |
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
lib/              all the real logic (18 files) — see table above
prisma/           schema.prisma — 24 tables, 11 enums
__tests__/        3 test files — scoring, demo fixtures, utils
scripts/          save.ps1 and undo.ps1 (your deploy + rollback)
proxy.ts          runs before every matched request — see note below
ProspectIQ-Landing-Page/   separate static marketing page, not wired into the app
```

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

Listed worst-first. None are fixed yet except the build script and the two fake-data fallbacks.

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
3. **8 of 13 action files never check who is logged in.** Anything in `contacts`, `outreach`,
   `profile`, `conversations`, `deploy`, `agents` and `companies/[id]` will act on any record ID
   it's handed. `triggerIntelligenceRun(companyId, workspaceId)` takes the workspace from the
   browser instead of the session. Only matters once someone else uses the app — but it's the
   kind of thing that's much cheaper to fix now.
4. **Activity log isn't linked to anything.** The `Activity` table has no `workspaceId` column, and
   `logActivity()` in `discovery.ts` accepts either 3 or 4 arguments and throws the workspace away.
   So the activity feed is global, not per-workspace.
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
