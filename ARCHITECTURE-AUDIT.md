# ProspectIQ — architecture & code audit

Date: 2026-08-22. Based on a full read of every source file in the repo.
Companion to `PROJECT-MAP.md` (which answers "where do I go to fix X"). This file answers
"what is good, what is weak, and in what order should it be fixed".

Every claim below cites a file and, where useful, a line number, and was re-checked against the
code rather than recalled.

---

## 1. Architecture map

### How it's put together

```
Browser
  │
  ├── app/(auth)/*          login · signup · forgot-password · reset-password
  ├── app/onboarding/       first-run wizard (creates Workspace + ICP + Offer)
  └── app/(app)/*           17 logged-in pages
        │  layout.tsx  ← the only auth gate in the app
        │
        ├── page.tsx        server component → queries Prisma directly
        └── *Client.tsx     client component → calls actions.ts
                                  │
                                  ▼
                            app/**/actions.ts   (23 server actions in 13 files)
                                  │
                                  ▼
                            lib/ai/*            the engines
                                  │
                                  ▼
                            lib/db.ts → Prisma → Postgres (Supabase)
```

Numbers: `app/` 67 files / ~7,750 lines · `lib/` 18 files / ~3,080 lines ·
`components/` 11 files / 716 lines · `prisma/schema.prisma` 783 lines ·
`__tests__/` 3 files / 308 lines. 55 `.tsx` files, 25 of them client components.

### The pipeline

```
ICP + Offer → DISCOVERY → INTELLIGENCE → SCORING → OUTREACH → CONVERSATION
              discovery.ts  intelligence.ts  opportunity-  outreach.ts  conversation.ts
              (445 lines)   (451 lines)      score.ts      (196)        (161)
                                             (75)
                    └──────── orchestrator.ts (258) drives stages 2–4 in a loop ────────┘
```

### What's well built

The layering is clean and conventional for App Router: pages fetch, clients render, actions
mutate, `lib/` holds logic with no framework coupling. `lib/scoring/opportunity-score.ts` and
`lib/utils.ts` are pure and import nothing from Next or Prisma — they're the two files you could
lift into another project unchanged, which is a good sign about where the boundaries sit.

Route groups are used correctly: `(auth)` has no sidebar, `(app)` has one, and `onboarding` sits
outside `(app)` deliberately so the layout's redirect can't loop. Server actions are colocated
with the page that calls them rather than dumped in a shared folder, which keeps blast radius
small. There is no unnecessary REST layer for app data — pages talk to Prisma directly, which is
the right call for a single-tenant-ish app and avoids maintaining an API surface nobody consumes.

### What to improve

**No scheduler exists.** There is no `vercel.json`, no cron route, and no queue. Every "agent"
run starts only when a human clicks a button. The product language throughout the UI says
otherwise — `dashboard/page.tsx` renders a pulsing dot with the text *"Agent Status: Online &
Scanning"* while nothing is scanning. Either add a cron entry point or change the copy.

**Background work is fire-and-forget on serverless.** `app/(app)/discovery/actions.ts:85` starts
`runDiscoveryEngine(...).catch(console.error)` without awaiting, and
`lib/ai/orchestrator.ts:58` does the same with `orchestratorLoop`. On Vercel the function
instance can be frozen or reclaimed once the response is returned, so a long run can simply stop
mid-way. Nothing detects that: the `AgentRun` row stays `RUNNING` forever, and the UI polls a
status that will never change. This is the most consequential architectural issue in the repo,
because it means the core feature is unreliable in exactly the environment it deploys to.

**Two features are shells.** `Sequences` has a page that reads `prisma.sequence.findMany`, a
`SequenceStep` table, and a `sequences` nav item — but nothing anywhere creates a sequence except
`lib/demo/seed.ts:226`, and no code ever executes a step. `Conversations` likewise only receives
replies through `simulateReplyAction` (`app/(app)/conversations/actions.ts:7`); there is no
inbound email webhook. Both should be hidden behind a flag or finished, because right now they
look shipped.

**Nothing sends outreach.** `lib/email.ts` is only ever called for email verification and
password reset. No code path sets an `OutreachMessage` to `SENT`. The pipeline produces drafts
and stops.

---

## 2. Data layer / models

24 models, 11 enums, 783 lines in `prisma/schema.prisma`.

### What's well built

This is the strongest part of the codebase. Indexing is genuinely thorough rather than an
afterthought: every foreign key is indexed, and the columns actually used for filtering carry
their own indexes too — `@@index([status])` on `Company`, `Opportunity`, `AgentRun`,
`OutreachMessage` and `Conversation`, plus `@@index([emailStatus])`. That's the pattern you'd
expect from someone who has watched a list view get slow.

Uniqueness constraints encode real business rules rather than just protecting primary keys:
`@@unique([workspaceId, domain])` on `Company` (line 328) makes discovery idempotent and is what
lets `discovery.ts` use `upsert` safely; `@@unique([userId, workspaceId])` prevents duplicate
memberships; `@@unique([sequenceId, stepNumber])` stops two step-3s; `@@unique([workspaceId, type,
value])` on `Suppression` prevents duplicate do-not-contact entries. `OpportunityScore.opportunityId`
is `@unique`, correctly modelling 1:1 rather than 1:many.

Delete behaviour is deliberate and mostly correct. Workspace-owned records cascade
(`onDelete: Cascade`), so deleting a workspace cleans up after itself, while references to
optional context — `agent`, `opportunity`, `signal` — use `SetNull` so removing an agent doesn't
destroy the work it produced. That distinction was clearly thought about.

Enum coverage is good: 11 enums including a 13-value `SignalType` and a 9-value
`ReplyClassification`, so the pipeline's vocabulary lives in the database rather than in scattered
string literals.

### What to improve

**`Activity` is orphaned.** It has no `workspaceId`, and its only links (`companyId`,
`conversationId`, lines 665 and 667) are both optional. Most rows are written with neither. The
result is a global activity feed that cannot be scoped to a workspace, which is why
`logActivity()` in `discovery.ts:193` accepts a workspace ID and silently throws it away — there
is no column to put it in. Add `workspaceId` (indexed, cascading) and backfill.

**`OutreachMessage` has no `workspaceId`.** It's scoped only through `opportunity`, which is
optional (line 577). So a message with a null `opportunityId` belongs to nobody. This also forces
awkward queries: `dashboard/page.tsx:37` has to filter via `{ opportunity: { workspaceId } }`,
a join where a column would do. Same applies to `Signal`, `Evidence` and `ConversationMessage`,
though those at least hang off required parents.

**Four untyped JSON columns.** `CustomAgent.tools`, `Activity.metadata`, `AgentRun.inputParams`
and `AgentRun.outputData`. Every read of these is an `as any` cast at the call site — e.g.
`orchestrator.ts:29`. Given `zod` is already a dependency, define schemas for these payloads and
parse on read.

**No migration history.** There is no `prisma/migrations/` directory, so every schema change has
gone out via `prisma db push`. That means no review of destructive changes, no rollback, and no
record of when a column appeared. Fine while you're the only user; the first time you need to
undo a schema change it will hurt.

**`Company` is 34 fields wide** with most enrichment fields optional. Not wrong, but as the
enrichment pipeline grows this is the table that will accumulate half-populated columns. Worth
watching, not worth splitting yet.

**Connection handling is loose.** `lib/db.ts` hand-parses `DATABASE_URL` into host/port/user/
password and sets `ssl: { rejectUnauthorized: false }`, disabling certificate verification.
`prisma.config.ts` reads `.env` with a regex and appends `sslaccept=accept_invalid_certs` — that
is a MySQL/PlanetScale parameter and has no meaning for Postgres, which uses `sslmode`. Both work
today by accident rather than intent. There are also four accepted names for the database URL
(`DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`), which makes
misconfiguration hard to diagnose.

---

## 3. Core business logic — scoring and enrichment

This is the heart of the product, so it gets the most detail.

### What's well built

**The scoring engine is the best-written file in the repo.** `lib/scoring/opportunity-score.ts`
is 75 lines, pure, dependency-free and fully testable. All six weights sit in one exported
`SCORE_WEIGHTS` object at the top with a comment explaining each, so tuning the model means
editing one block. The threshold (`QUALIFICATION_THRESHOLD = 60`) and the A–F grade bands are
separate from the weights, which is the right seam. And `__tests__/opportunity-scoring.test.ts`
asserts that the weights sum to 1.0 — a small test that catches the single most likely mistake
anyone will make when tuning it.

**Scoring is decomposed rather than vibes-based.** The intelligence prompt
(`intelligence.ts:34–59`) asks the model for six independent sub-scores, each with its own
reasoning string, instead of one overall confidence number. `mapAIOutputToScoreInput`
(`intelligence.ts:396`) then feeds those into the deterministic weighted formula. That means the
final number is explainable — you can see which factor dragged a company down — and the weighting
policy stays in code rather than in the model's head. That's a materially better design than most
AI scoring implementations.

**There's a real fallback path for the score.** If the model returns no `scoring_assessment`,
`mapAIOutputToScoreInput` derives each factor structurally from what was actually found — evidence
count, problem count, signal count, whether a decision maker has an email
(`intelligence.ts:414–432`). Each factor is still evaluated independently. `clampScore` bounds
everything to 0–100.

**Prompt injection is defended against.** `sanitizeText` (`intelligence.ts:442`) strips special
tokens, redacts `ignore previous instructions` / `system:` / `you are a` patterns, removes HTML,
collapses whitespace and hard-caps at 15,000 characters — and it's applied to scraped web content
before it reaches the prompt (`intelligence.ts:122`). Scraped pages are untrusted input and this
treats them that way.

**Evidence is never trusted.** `intelligence.ts:170` writes `isVerified: false` unconditionally
with the comment *"MUST NOT blindly trust AI verification"*, even when the model claims otherwise.
Correct instinct.

**Retry logic is correct where it exists.** `lib/ai/search.ts` retries only on 429, 5xx and
network failures — `const isRetryable = !status || status === 429 || status >= 500;` — and never
on 4xx, so a malformed query fails fast instead of being hammered three times. The AI calls in
`intelligence.ts:132` and `discovery.ts` use three attempts with linear backoff.

**Cost and rate discipline is present.** Hunter.io enrichment is gated to opportunities scoring 70
or above specifically to protect the 50-credit free tier (`intelligence.ts:241–243`). Website
scraping runs three domains at a time (`BATCH_SIZE = 3`, `discovery.ts:167`) with a 20-second
`AbortController` timeout per fetch (`discovery.ts:74`) and a 15,000-character cap. The discovery
action enforces a monthly budget before starting (`discovery/actions.ts:26–45`), counting companies
created since the 1st against the agent's `budgetLimit`. Search queries cap every interpolated
component — industry 40 chars, region 40, size 30, keyword 25, max 3 keyword variants, max 5
exclusions (`discovery.ts:348–361`) — which is what fixed the Serper 400 errors. 21 enterprise
giants are excluded via `EXCLUDED_DOMAIN_SET` so results aren't dominated by Amazon and Google.

**The orchestrator degrades gracefully.** If the LLM call fails it falls back to a deterministic
state machine that reads the same state string (`orchestrator.ts:136–145`), so the pipeline keeps
moving. It also supports cooperative cancellation: `checkRunStatus` is re-read before every step
(`orchestrator.ts:97`, `:108`), so pausing from the UI actually stops the loop rather than just
setting a flag.

### What to improve

**The app fabricates data instead of failing — in two places, and this is the headline problem.**

`discovery.ts:434` — if the model's JSON has no `domains` key:
```ts
const domains: string[] = parsed.domains || ["vercel.com", "stripe.com", "linear.app"];
```
`discovery.ts:444` — if the whole call throws, the function returns the same three domains. So a
completely failed search produces three plausible companies and reports success.

`intelligence.ts:118` — if Serper returns nothing, research falls back to `performMockSearch`
(`intelligence.ts:334`), which invents a funding round, an expansion story, and two named people
with fabricated email addresses, deterministically hashed from the company name so they look
stable across runs. That text then goes into the prompt, and the model dutifully extracts those
people, which get written to the `Contact` table with `sourceName: "AI Inference"`. The prompt in
the very same file says *"Do not hallucinate names like 'Sarah Jenkins' or 'Marcus Ryle'"* while
the code feeds it exactly that kind of name.

The sharpest illustration: the header comment of the dead `lib/ai/providers.ts` reads *"NEVER
fabricates real companies, people, or data — all demo content is clearly marked as synthetic."*
The file that says this is unused; the files that fabricate are the live ones. Delete both
fallbacks and let failures surface. Nothing else in this list can be debugged until a failed run
looks like a failed run.

**Nothing validates the model's output before it hits the database.** Every engine does
`JSON.parse(text)` and then walks the result directly — `for (const ev of data.evidence)`
(`intelligence.ts:160`), `data.signals` (`:177`), `data.problems.join` (`:200`). If a field is
missing or the wrong type, this throws partway through, after some rows have already been written.
`zod` is already installed and used in two auth routes; the LLM boundary is where it's actually
needed.

**Multi-step writes aren't atomic.** `researchCompany` writes evidence, then signals, then an
opportunity with its score, then contacts, then Hunter contacts, then updates the company — six
separate write phases, no transaction. The only `$transaction` in the entire codebase is in
`app/api/onboarding/route.ts:29`. A failure at step four leaves a company with evidence and
signals but no opportunity, and no way to tell that state apart from a legitimate one.

**`researchCompany` isn't idempotent.** It calls `prisma.opportunity.create` unconditionally
(`intelligence.ts:195`), so researching the same company twice produces two opportunities, two
score rows and duplicate contacts. The orchestrator guards this with an in-memory
`company.opportunities.length === 0` check (`orchestrator.ts:157`), but any direct re-run from the
company page duplicates. Should be an upsert keyed on company plus offer.

**Scores aren't reproducible.** Every sub-score comes from the model. `temperature: 0.2`
(`intelligence.ts:138`) is low but not zero, and no seed is set, so the same company scored twice
can land in different grade bands. For a ranking feature that users will treat as objective, add
at least one deterministic component — firmographic ICP fit can be computed in code from
industry, size and geography without asking a model at all.

**`logActivity` has an ambiguous signature.** `discovery.ts:193` is
`async function logActivity(...args: string[])`, which infers meaning from argument count: four
args means the first is a workspace ID, three means it isn't. It's called with four args at lines
24–99 and three args at lines 130–183. The workspace ID is discarded either way because the table
has no such column. Replace with one explicit typed signature.

**The orchestrator's cost profile is unbounded.** The comment at `orchestrator.ts:81` says "Get up
to 20 companies to process" but the query is `take: 1000`. Each company runs up to 5 iterations
(`maxIterations = 5`), each iteration making an LLM call plus a 1-second delay. A full run is
therefore up to 5,000 model calls and 5,000 seconds of deliberate sleeping — and unlike discovery,
the orchestrator checks no budget at all. `CustomAgent.budgetLimit` exists but is only consulted
in `discovery/actions.ts`.

**One pipeline step does nothing.** The `FIND_BUYER` branch (`orchestrator.ts:164–175`) re-reads
the company from the database and appends a string to the state; it performs no buyer lookup. The
LLM is asked to choose between four actions, one of which is a no-op that always "succeeds".

**Fake citations and hardcoded confidence.** `intelligence.ts:167` falls back to a Google search
URL as an evidence `sourceUrl` when the model doesn't supply one, which produces a citation that
looks real and proves nothing. `intelligence.ts:189` writes `relevance: 0.8` on every signal
regardless of content, so signal relevance carries no information.

**The model name is hardcoded in three places.** `"openai/gpt-oss-120b"` appears as a literal in
`intelligence.ts:135`, `orchestrator.ts:129` and `conversation.ts`. Meanwhile `lib/ai/gemini.ts`
exports `MODEL`, `FAST_MODEL` and `SMART_MODEL` that nobody imports. Changing model means editing
three files and the constants are decorative.

**Outreach identity is hardcoded.** The prompt in `outreach.ts` embeds `Name: Yasir` and
`Company: ProspectIQ` as literals rather than reading workspace settings, so the app can only ever
write email as one sender.

**The suppression list is never enforced.** The `Suppression` model exists with a proper
`@@unique([workspaceId, type, value])` constraint, and zero code references it. Before any real
send exists, that check has to be in the send path.

---

## 4. API / backend layer

23 server actions across 13 `actions.ts` files, plus 8 route handlers under `app/api/`.

### What's well built

**The auth flows are done properly**, and they're the part of the backend that most repos get
wrong. `app/api/auth/register/route.ts` validates with a real `zod` schema including a password
policy (8+ chars, one uppercase, one digit), hashes with bcrypt at cost 10, and issues a 24-hour
verification token. `app/api/auth/reset-password/route.ts` deliberately does not reveal whether an
email is registered — it returns the same success message either way, with the comment explaining
why — applies a one-minute rate limit, invalidates all previous tokens before issuing a new one,
and expires tokens after an hour. The `PUT` handler re-validates password strength, checks
expiry, and deletes the token after use. `verify-email` checks expiry and consumes the token.
These are the right behaviours in the right order.

**The onboarding route is the best backend file.** `app/api/onboarding/route.ts` gates on session,
checks `onboardingComplete` for idempotency so a double submit is harmless, and wraps workspace,
offer, ICP and user updates in a single `$transaction` — with a unique-slug loop inside it so two
users named the same don't collide.

**Session handling self-heals.** `lib/session.ts` auto-provisions a default workspace if a user
somehow has none, which prevents the entire app from erroring for a user who skipped onboarding.

**The demo routes are scoped.** Both `demo/seed` and `demo/reset` require a session and operate
only on `session.workspaceId`, and `resetDemoData` filters every delete by `workspaceId`. They
also use dynamic imports to keep Prisma out of the edge bundle.

**Actions return structured results.** Several (`deleteCompany`, `startDiscovery`) return
`{ success, error }` shapes rather than throwing raw, and `revalidatePath` is called after
mutations so lists refresh.

### What to improve

**Internal errors leak to the browser.** `register/route.ts` ends with:
```ts
return new Response(JSON.stringify({ error: `Debug Error: ${error.message || String(error)}` }), { status: 500 })
```
That returns raw database and stack messages to any client, and the `catch (error: any)` above it
opts out of type checking. Log the detail server-side, return a generic message.

**8 of 13 action files never check who is logged in.** No `getSession()` call appears in
`agents/[id]/actions.ts`, `agents/[id]/settings/actions.ts`, `companies/[id]/actions.ts`,
`contacts/actions.ts`, `conversations/actions.ts`, `deploy/actions.ts`, `outreach/actions.ts` or
`profile/actions.ts`. `deleteContactAction(id)` deletes whatever contact ID it is handed. Server
actions are publicly callable endpoints, not private functions — each one needs its own check.

**Two actions accept identity from the browser.** `triggerIntelligenceRun(companyId, workspaceId)`
(`companies/[id]/actions.ts:8`) takes the workspace as a parameter, and `updateUserProfile(userId, …)`
(`profile/actions.ts:6`) takes the user ID. Both should come from the session only.

**The `|| "demo"` fallback appears 17 times across 15 files.** Every page and several actions do
`const workspaceId = session?.workspaceId || "demo"`. When a session is missing, queries silently
run against a workspace named `"demo"` that doesn't exist, returning empty results instead of an
error — which turns an auth failure into a "you have no data" screen. Throw instead.

**`/api/demo/reset` is a destructive endpoint with no CSRF protection.** It's a plain `POST` route
handler, and route handlers don't get the origin checks that Next.js applies to server actions. A
logged-in user visiting a hostile page can have their workspace wiped by a cross-site form post.
Worse, `resetDemoData` (`lib/demo/seed.ts:299`) deletes companies, ICPs, offers, sequences and
agent runs — the user's real configuration, not just seeded demo rows. And the production guard is
inert: it only blocks when `DEMO_MODE !== "true"`, while `next.config.ts:8` defaults `DEMO_MODE`
to `"true"`. Delete the route, or require an explicit confirmation token.

**No rate limiting on registration.** `register` sends an email on every call with no throttle, so
it can be used to spam arbitrary addresses through your Resend account and burn its quota. The
reset endpoint has a limit; this one needs one too.

**No validation on server actions.** All 23 accept their arguments as trusted TypeScript types.
TypeScript is erased at runtime, so a crafted request can pass anything. `zod` is used in exactly
two auth routes and nowhere else.

**Registration reveals existing accounts.** `register` returns 409 with *"Email already exists"*,
which allows enumeration — inconsistent with the care taken to avoid exactly that in the reset
flow. A common trade-off for UX, worth making deliberately rather than accidentally.

---

## 5. Frontend

55 `.tsx` files, 25 client components, an 11-file shared UI kit.

### What's well built

**The discovery polling loop is the most carefully written client code in the repo.**
`DiscoveryClient.tsx:47–95` guards both ways a poller can hang: it gives up after 5 consecutive
failures, and independently after 10 minutes total, resetting the failure counter on any successful
check even while still running. Both paths set a specific, actionable message rather than spinning
forever. It carries a comment explaining the reasoning. This is production-quality defensive code.

**Server-side pagination is done correctly.** `companies/page.tsx` reads `q` and `page` from the
URL, builds a case-insensitive `OR` filter across name, domain and industry, and runs the page
query and the count in a single `Promise.all` with `skip`/`take` at 50 per page. Filtering happens
in the database, not the browser — the mistake most dashboards of this kind make.

**Next 16's async params are handled.** All three dynamic pages type `params` as
`Promise<{ id: string }>` and `await` it (`agents/[id]/page.tsx:5`, `agents/[id]/settings/page.tsx:5`,
`companies/[id]/page.tsx:5`). That's a real awareness of a breaking change that trips most code.

**Error and loading boundaries exist.** `app/(app)/error.tsx`, `app/(app)/loading.tsx` and
`app/not-found.tsx` are all present — often skipped entirely in projects at this stage.

**The server/client split is disciplined.** Pages are server components that fetch and pass plain
data down; interactivity lives in a sibling `*Client.tsx`. Only 25 of 55 components ship JavaScript.

**The design language is consistent.** A deliberate Apple-ish palette (`#F5F5F7`, `#1D1D1F`,
`#0071E3`, `#6E6E73`) is applied uniformly, and the dashboard's KPI treatment — large plain
numerals separated by hairline dividers instead of boxed cards — shows actual visual judgement
rather than default component-library output.

### What to improve

**`DiscoveryClient.tsx` is 804 lines** — four times the next largest client file. The ICP form,
country/industry pickers, manual domain import, polling and progress UI are all in one component.
This is the file you'll be scared to touch in a month; split it.

**`searchParams` is typed and read synchronously.** `companies/page.tsx:8` and `contacts/page.tsx:8`
declare `searchParams: { q?: string; page?: string }` and read it directly. In Next 16 it's a
Promise, exactly like `params` — which the dynamic pages get right. Inconsistent, and will break.

**`error.tsx` tells a lie and has a wrong button.** It says *"Our team has been notified"* when the
only handling is `console.error` — no error tracking service is wired up anywhere. And the button
labelled "Go Home" calls `window.location.reload()`, which reloads the failing page.

**Polling is a 2-second server action round-trip** with no backoff, so a 10-minute discovery run
issues 300 requests that each open a database connection. Widen the interval as the run ages.

**Dead and unused UI.** `ScoreRing.tsx` (113 lines) and `Skeleton.tsx` are referenced by no page.
`dashboard/page.tsx:1–21` carries six `eslint-disable-next-line no-unused-vars` comments
interleaved inside the import block — unused imports silenced rather than deleted.

**Score colours are built for a dark theme.** `getScoreColor` in the scoring file returns
`text-emerald-400`, `text-amber-400`, `text-red-400` — Tailwind's 400 weights, intended for dark
backgrounds — while the app renders on `#F5F5F7` and white. Contrast will be poor.

**Caching is implicit.** Only `analytics/page.tsx:19` sets `dynamic = 'force-dynamic'`. Every other
page relies on default behaviour, which for pages that read live pipeline data is worth stating
explicitly.

---

## 6. Cross-cutting concerns

### What's well built

**TypeScript is strict.** `tsconfig.json` sets `"strict": true` with `isolatedModules` and the `@/*`
path alias. ESLint 9 flat config extends both `next/core-web-vitals` and `next/typescript`.

**Secrets hygiene is right.** `.gitignore` covers `.env*`, nothing sensitive is tracked, and no key
appears in source. Every external service is optional-guarded: no `SERPER_API_KEY` returns null,
no `HUNTER_API_KEY` skips enrichment, no `RESEND_API_KEY` logs a mock email instead of crashing
(`lib/email.ts:16`). `lib/ai/gemini.ts` uses a placeholder key specifically so builds don't fail
when the real one is absent. The app boots in a degraded state rather than dying — a deliberate and
correct choice for a project deployed continuously.

**The test setup is real even if thin.** `jest.config.ts` wires `ts-jest`, maps `@/*` to match the
app, and declares `collectCoverageFrom` targeting `lib/**` and `app/api/**`. The tests that exist
are meaningful: `demo-fixtures.test.ts` asserts data integrity (unique domains, valid ranges, every
signal referencing a known company) and `opportunity-scoring.test.ts` checks the weights sum to 1.0
and each grade boundary.

**Prisma is configured correctly for App Router** via `serverExternalPackages` in `next.config.ts`.

**The build script is now safe.** `prisma generate && next build` — the previous version ran
`prisma db push --accept-data-loss` on every Vercel deploy, which could silently drop columns from
the live database. Fixed 2026-08-22.

### What to improve

**Strict mode is being opted out of where it matters most.** There are 72 `eslint-disable` comments
and heavy `any` use, concentrated in the files that handle untrusted data: `intelligence.ts` has 12,
`Company360Client.tsx` 10, `demo/seed.ts` 8, `orchestrator.ts` and `discovery.ts` 6 each. The LLM
response boundary is precisely where runtime types can't be assumed, and it's the least typed part
of the codebase.

**No observability.** 53 `console.*` calls, no structured logging, no error tracking, no request
IDs. When a discovery run fails in production the only record is a Vercel log line, and the
`AgentRun.errorMessage` field if the failure happened inside a `try`. `error.tsx` promising
notification that doesn't exist makes this worse than silence.

**Test coverage misses everything risky.** Three test files, 308 lines, covering the scoring
function, the demo fixtures and `utils.ts`. There are zero tests for discovery, intelligence,
outreach, conversation, the orchestrator, auth, or any of the 23 server actions — that is, no tests
on any code that spends money, calls a third party, or writes to the database. The scoring engine
being pure makes it easy to test, and it is; the engines need the same treatment with mocked LLM
and Serper responses.

**Dead code and unused dependencies.** `lib/ai/providers.ts` (152 lines) and `lib/ai/provider.ts`
(59 lines) implement a provider abstraction — `getAIProvider`, `DemoAIProvider`, `OpenAIProvider` —
that nothing outside those two files references. Three npm packages are installed and never
imported: `openai`, `cheerio` and `@google/genai` (`providers.ts` calls the OpenAI HTTP API with
raw `fetch`, not the SDK). `AI_PROVIDER` and `OPENAI_API_KEY` exist only to serve this dead path.

**`lib/ai/gemini.ts` contains the Groq client.** The filename, the unused `@google/genai`
dependency, and comments elsewhere referring to "Gemini Flash" rate limits all point at a provider
the app no longer uses. Rename to `groq.ts`.

**`DEMO_MODE` defaults to `"true"`.** `next.config.ts:8` sets `DEMO_MODE: process.env.DEMO_MODE ?? "true"`,
so a demo flag is on by default in production. It's what makes the demo-reset guard inert, and
`/api/health` will report `mode: "demo"` on the live site.

**No CI.** There is no `.github/` directory, so nothing runs lint, tests or a build before code
reaches Vercel. With `save.ps1` pushing straight to `main`, the first check on any change is the
production deploy.

**No `.gitattributes`.** The absence of `* text=auto eol=lf` is why the repo shows ~130 phantom
modified files when git runs from a Linux environment against a Windows checkout. It also means
line-ending noise in future diffs.

**No `.env.example`.** Seventeen environment variables are read across the codebase and nothing
documents which are required, which are optional, or what happens without each.

**Repo hygiene — resolved 2026-08-22.** Ten scratch files were deleted from the project root:
`test-groq.js`, `test-groq-list.js`, `test-groq-model.js`, `scratch_serper.ts`, `test.ts`,
`test-db.ts`, `test-dashboard.ts`, `test-intelligence.ts`, `prospectiq-fixes-1-4.patch` and
`supabase_migration.sql`. Each was verified unreferenced, outside Jest's `testMatch`, and tracked
in git, so all are recoverable from history. The patch file's contents were confirmed already live
in the code (`MAX_POLL_MS`, `BATCH_SIZE`, `queryAngles`, `mergedResults` all present), and the SQL
file was schema-only DDL with zero `INSERT`/`COPY` statements, reproducible at any time from
`prisma/schema.prisma`.

**`proxy.ts` is NOT a scratch file — an earlier draft of this audit was wrong about it.** In
Next.js 16 the root `middleware.ts` convention was renamed to `proxy.ts`, so this file is live edge
code, not dead weight. It default-exports `withAuth(...)` from `next-auth/middleware` and exports a
`config.matcher` — the exact middleware contract — and git history shows it was authored as
`proxy.ts` from the initial commit; a `middleware.ts` has never existed here. It redirects
unauthenticated traffic on `/dashboard/:path*` to `/login` and bounces logged-in users away from
the four auth pages. Two caveats: its matcher covers only `/dashboard`, leaving the other sixteen
`(app)` routes to the `app/(app)/layout.tsx` gate, and its `authorized` callback returns `true`
unconditionally, which is required for the redirect logic to run but means the file itself grants
no protection beyond the explicit checks. Widening the matcher is the cheapest partial mitigation
for the missing session checks catalogued in section 4. Confirm the convention against
`node_modules/next/dist/docs/` after `npm install`.

Also `AGENTS.md` contains a `nextjs-agent-rules` block asserting that
Next.js has breaking API changes and instructing agents to read `node_modules/next/dist/docs/`.
It claims to be regenerated by `next dev` via `node_modules/next/dist/server/lib/generate-agent-files.js`.
`node_modules` isn't installed yet, so that's unverified — check the file exists after
`npm install` before treating that block as trustworthy.

---

## 7. Final synthesis

**The skeleton is better than the wiring.** The database schema, the scoring engine, the auth
flows, the pagination and the polling guards are all above the standard you'd expect from a
solo-built prototype — properly indexed, properly decomposed, defensively written, with comments
that explain reasoning rather than restate code. Someone made real engineering decisions here.

What holds it back isn't missing features. It's three recurring themes:

**One — the app prefers inventing data to admitting failure.** Fake domains in `discovery.ts`,
fake people in `intelligence.ts`, a Google search URL standing in for a real citation, a hardcoded
`0.8` relevance on every signal, an "Online & Scanning" badge over an idle system. Each one
individually looks like a harmless convenience. Together they mean you cannot tell a working run
from a broken one, which makes every other bug in this document undiagnosable. This is why it's
first on the list below.

**Two — trust boundaries aren't enforced.** Two boundaries matter in this app: the browser and the
language model. Neither is checked. Eight action files skip the session check and two take identity
from their caller; no server action validates its input. On the other side, LLM JSON is parsed and
written straight to the database with no schema. `zod` is installed and used in two auth routes —
the tool is already there, just pointed at the least risky surface.

**Three — long-running work has no home.** The core value of the product is a pipeline that takes
minutes. It's started with an un-awaited promise inside a serverless request, checks no budget in
the orchestrator, isn't transactional, isn't idempotent, and has no mechanism to notice it died.
This is the difference between a demo that works when you watch it and a tool you can rely on.

Maturity: a strong prototype with a production-grade data model. The gap to production is honesty
about failure, validation at the two trust boundaries, and somewhere durable to run the pipeline —
not more features.

### Fix order

**P0 — do these first; nothing else is debuggable until they're done**

1. Delete both fake-data fallbacks: `discovery.ts:434` and `:444`, and `intelligence.ts:118`
   together with `performMockSearch` at `:334`. Let failed runs fail visibly.
2. Validate every LLM response with `zod` before writing: `intelligence.ts`, `discovery.ts`,
   `outreach.ts`, `conversation.ts`.
3. Stop leaking internal errors from `register/route.ts`.
4. Make dead runs detectable — at minimum, mark an `AgentRun` `FAILED` if it has been `RUNNING`
   past a timeout, so the UI stops waiting on work that no longer exists.

**P1 — correctness and safety**

5. Add `getSession()` plus an ownership check to the 8 unguarded action files; stop accepting
   `workspaceId` and `userId` from the browser.
6. Replace the 17 `|| "demo"` fallbacks with a thrown error.
7. Add `workspaceId` to `Activity`; replace `logActivity`'s variadic signature with one explicit one.
8. Wrap the `researchCompany` writes in `$transaction` and make it idempotent.
9. Delete `/api/demo/reset` or gate it behind an explicit confirmation token.
10. Rate-limit registration.
11. Enforce `Suppression` in the send path before any real sending exists.

**P2 — maintainability**

12. ~~Delete the ten root scratch files.~~ **Done 2026-08-22.** Still to do: delete
    `lib/ai/providers.ts`, `lib/ai/provider.ts`, `ScoreRing.tsx`, `Skeleton.tsx` and the three
    unused dependencies. Rename `gemini.ts` to `groq.ts` and centralise the model constant.
    Do **not** delete `proxy.ts` — it is Next 16's middleware file.
13. Test the engines with mocked LLM and Serper responses.
14. Add `.gitattributes`, `.env.example`, and CI that runs lint, tests and build before deploy.
15. Give the orchestrator a budget check and fix `take: 1000` versus its "up to 20" comment;
    implement or remove the no-op `FIND_BUYER` step.
16. Split `DiscoveryClient.tsx`; fix `searchParams` typing on the two pages; fix `error.tsx`'s copy
    and its "Go Home" button; fix the dark-theme score colours.
17. Add a deterministic ICP-fit component to scoring so ranking is reproducible.
18. Either finish or hide Sequences and outbound sending.
19. Introduce migrations before the schema changes again.
