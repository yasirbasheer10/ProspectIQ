# Outreach — why the drafts read generic, and how to actually send them

Written 2026-08-23 from a read of `lib/ai/outreach.ts`, `lib/ai/schemas.ts`, `lib/email.ts`,
`app/(app)/outreach/*`, `app/api/onboarding/route.ts` and the `Offer` / `Opportunity` / `Contact` /
`Evidence` models. Nothing in this document has been implemented yet — it is the plan only.

---

## Part 0 — Rule these two out before changing anything

Two things can make the Outreach tab look generic without the AI ever having been involved. Check
these first, because if either is what you're seeing, none of the prompt work in Part 1 matters yet.

**The demo fixtures.** `app/(app)/outreach/page.tsx` lines 37–54: if the DRAFT queue comes back
empty, the page renders two hardcoded fake messages — "Sarah Jenkins / Acme Commerce" and
"Marcus Chen / Vertalo Group". If those are the names you see, nothing was generated at all and the
page is lying to you about having a queue. (Note the irony: "Sarah Jenkins" is the exact name the
intelligence prompt tells the model never to invent.)

**The failure template.** `fallbackToSafeTemplate` in `lib/ai/outreach.ts:170` runs whenever the
Groq call throws three times *or* the response fails zod validation. It writes a deliberately
generic email containing literal `[Insert observation about their recent growth...]` placeholders.
The tell-tale is the `personalizationNotes` field, which starts with "⚠️ AI Generation Failed".
That text isn't shown in the Outreach tab, so check it in the database, or check the `agent_runs`
table for `type = DRAFT_OUTREACH` rows with `status = FAILED` and read their `errorMessage`.

If you're hitting the fallback, the fix is whatever the `errorMessage` says — a bad `GROQ_API_KEY`,
a rate limit, or the model returning a shape zod rejects — not the prompt.

---

## Part 1 — Why genuinely-generated drafts still read generic

Ordered by how much each one costs you. The first is worth more than the rest combined.

### 1. The AI has no idea what you actually sell

This is the root cause. The `Offer` model (`prisma/schema.prisma:256`) has exactly the fields that
would make an email concrete:

```
name, description, valueProposition, services[], targetProblems[],
differentiators[], buyerRoles[], relevantIndustries[]
```

Two separate things go wrong with it.

**Onboarding only fills two of them.** `app/api/onboarding/route.ts:56` creates the offer as
`{ name: "Main Offer", description: offer }`. `valueProposition`, `services`, `targetProblems`,
`differentiators`, `buyerRoles` and `relevantIndustries` are all left empty forever. The onboarding
wizard asks one free-text question and throws away the structure the schema was designed for.

**The outreach prompt never reads the Offer anyway.** `lib/ai/outreach.ts:49` queries the
opportunity with `include: { company: { include: { evidence: true } } }` — no offer, no workspace,
no ICP. All it hands the model is `opportunity.recommendedService`, a free-text string the *research*
step invented, plus a hardcoded sender block:

```
Sender Profile:
Name: Yasir
Company: ProspectIQ (We offer ${opportunity.recommendedService})
```

And `Opportunity.offerId` is never set outside `lib/demo/seed.ts:207` — real opportunities created
by `researchCompany` don't populate it, so even a prompt that wanted to join to the offer couldn't.

So the model is being asked to write a sales email while knowing only a service *name*. It has no
value proposition, no differentiators, no proof, no pricing shape, no idea what problems you
actually solve. A model in that position can only produce plausible-sounding filler. It's doing the
best anyone could with what it's given.

### 2. The prompt explicitly asks for the generic register

`lib/ai/outreach.ts:66-76` instructs: "highly professional, structured outreach proposal", tone
"Professional, structured, and authoritative", "Frame this as a formal proposal or partnership
opportunity rather than a casual cold email", and propose the solution "in a structured way (e.g.
'We propose...', 'Our recommendation is...')".

That *is* the description of corporate boilerplate. Consultant register — "we propose", "our
recommendation", "partnership opportunity", "value or outcome" — reads as generic no matter how
good the underlying research is, because every vendor email uses it. The instruction is working
exactly as written; the instruction is the problem.

Cold email that gets replies is short, specific, plainly worded, and sounds like one person
noticing one thing. The current prompt asks for the opposite.

### 3. The most concrete evidence is thrown away

`Evidence` stores `quote` (the exact words from the source) and `sourceUrl`. The prompt at
`lib/ai/outreach.ts:47` builds its evidence list as:

```ts
company.evidence.map((e) => `- ID: ${e.id} | ${e.title}: ${e.summary}`)
```

Title and summary only. The quote — the single most specific artefact in the whole pipeline, the
thing that lets an email say *"you wrote X on your careers page"* — never reaches the model. Nor
does the source URL, so the model can't reference where it saw something.

The company's own firmographics are also unused: `industry`, `employeeRange`, `technologies[]`,
`foundedYear`, `businessModel` are all on the record and none are passed.

### 4. It's a summary of a summary of a summary

`problemStatement`, `whyNow` and `recommendedService` are already AI-written prose from the
intelligence step, which itself worked from search snippets. Outreach then summarises those. Every
abstraction pass strips the concrete nouns and keeps the generic connective tissue, so by the third
pass you have grammar with nothing in it.

Feeding raw evidence and signals into the outreach prompt alongside the narrative — rather than only
the narrative — cuts out one lossy hop.

### 5. No example of good output, and a ban list that misses the real offenders

The anti-pattern list bans three phrases: "hope this finds you well", "just bubbling this up",
"quick chat". Meanwhile the fallback template in the same file demonstrates the phrases that
actually make these emails feel canned — "I noticed {company} recently", "Typically, when companies
like yours experience this", "We specialize in", "bottlenecks", "Would you be open to".

There is also no few-shot example. Asking for a good email in the abstract reliably produces the
average of all sales emails, which is the definition of generic. One or two concrete examples of the
voice you want changes output quality more than any other single prompt edit.

### 6. Half the recipients aren't real people

`lib/ai/intelligence.ts:229` writes `[Target] ${dm.role}` as the contact's `fullName` when the
research step couldn't find a name. The outreach prompt receives that as the recipient, and
`fallbackToSafeTemplate` degrades it to "Hi there". An email to a job title instead of a person
cannot be non-generic. This is upstream of outreach — it's a contact-sourcing problem — but it caps
how good the email can be.

### Two real bugs in the Outreach tab, found while reading

**Editing a draft destroys it.** `page.tsx:33` builds `preview: msg.body.substring(0, 150) + "..."`.
`OutreachClient.tsx:100` seeds the edit textarea from `msg.preview`, and `saveEdit` at line 39 writes
that value back to `body` via `updateOutreachStatus(id, 'DRAFT', editBody)`. So opening any draft in
the editor and saving replaces the full email with its first 150 characters plus a literal `...`.
If you have edited drafts, they are already truncated in the database.

**Every contact displays as "null null".** `page.tsx:29` renders
`${msg.contact.firstName} ${msg.contact.lastName}`, but nothing ever populates those two columns —
`intelligence.ts:229` sets only `fullName`, and the Hunter.io path at `:267` also writes `fullName`
by concatenating, leaving `firstName`/`lastName` null. `fallbackToSafeTemplate` reads
`contact.firstName` too, so its greeting silently falls through to the `fullName` split.

**"Approve & Send" does not send.** It calls `updateOutreachStatus(id, 'APPROVED')` and nothing else.
See Part 2.

---

## Part 2 — Making sending actually work, on a free tier

### What exists today

`lib/email.ts` wraps Resend and is used **only** for auth emails (verification, password reset).
When `RESEND_API_KEY` is missing it logs a fake send and returns `{ success: true, mock: true }` —
so a missing key looks like a successful send.

Nothing in the codebase ever sets an `OutreachMessage` to `SENT`. The `sentAt`, `deliveredAt`,
`openedAt` and `repliedAt` columns are all unused. The `Suppression` table has zero references
anywhere. `Contact.isUnsubscribed` is never read or written. The analytics and dashboard pages count
`status: "SENT"` rows, which is why those numbers are always zero.

### The actual blocker is the sender address, not the code

`lib/email.ts:27` sends from `ProspectIQ <onboarding@resend.dev>`. That is Resend's shared sandbox
address, and it is restricted to delivering only to the email address that owns the Resend account.
It can never reach a prospect. Any send path built on top of it will appear to work and silently go
nowhere.

To email arbitrary recipients you must send from a domain you control and have authenticated with
SPF and DKIM records.

### Recommendation

**Register one cheap dedicated domain (about $10/year) and use Resend's free tier** — 3,000 emails
per month, 100 per day, which is far beyond what manual prospecting needs. The code is already
written against Resend, so `lib/email.ts` needs one line changed.

I'm recommending you spend the $10 rather than avoid it, for a reason that matters more than the
money: never send cold email from your main domain or your personal Gmail. If recipients mark it as
spam, the reputation damage lands on the address you use for real business. A separate sending
domain is the standard way to contain that, and it's the cheapest insurance in outbound.

**If you want literally zero spend**, use **Brevo** (formerly Sendinblue). Its free tier is 300
emails per day and — unlike Resend — it lets you authenticate a single sender *email address*
without owning a domain, so you can send from a Gmail address you already have. Trade-off:
deliverability is meaningfully worse than a DKIM-signed custom domain, and you're putting your
personal address at risk. It has an HTTP API, so swapping `lib/email.ts` to it is a contained change.

**Gmail SMTP via Nodemailer** with an app password (500/day, free) also works and needs no new
account, but it's the weakest option: no delivery webhooks, no bounce handling, no unsubscribe
infrastructure, and repeated cold sends can get your Google account suspended. Fine for testing two
or three emails to yourself; not a foundation.

Whichever you pick, verify delivery by sending to a Gmail address you own and checking
**Show original** for `SPF: PASS` and `DKIM: PASS`. If either fails, everything you send lands in
spam and no amount of copywriting will help.

### What has to be built, beyond picking a provider

Seven pieces, and none is large:

**Sender identity in the database.** The name "Yasir" is hardcoded in the outreach prompt and
"ProspectIQ <onboarding@resend.dev>" in `lib/email.ts`. Both belong on the workspace as a
from-name, from-address, reply-to address and signature, set on a settings page.

**A real send action.** The Outreach tab's Approve button needs a server action that: calls
`getSession()` and verifies the message belongs to that workspace; refuses unless the contact has an
email and `emailStatus` isn't `BOUNCED`; checks `Contact.isUnsubscribed` and the `Suppression` table
for the email and the domain; refuses if status is already `SENT` so a double-click can't send twice;
sends; then in one transaction sets `status = SENT`, `sentAt = now()`, `approvedAt`,
`approvedByUserId`. Right now every one of those checks is missing.

**Plain text alongside HTML.** `sendEmail` accepts only `html`, and the drafts are plain text with
`\n` line breaks. Passed as HTML those newlines collapse and the email arrives as one paragraph. It
needs a text version, plus minimal `<p>` wrapping for the HTML part. Cold email should be plain and
unstyled anyway — no logos, no tracking-pixel-heavy templates, no buttons. Styling is a spam signal.

**An unsubscribe link and route.** This is a legal requirement under CAN-SPAM and GDPR, not a nicety.
Needs a tokenised public route that sets `Contact.isUnsubscribed` and writes a `Suppression` row, a
link appended to every outbound body, and a `List-Unsubscribe` header. The database columns for this
already exist and are unused.

**A daily cap.** Both a provider limit (100/day on Resend free, 300 on Brevo) and a deliverability
one — sending 100 cold emails on day one from a new domain will burn it. Warm up over a couple of
weeks, 10 to 20 a day at first. Worth enforcing in code so you can't do it by accident.

**Reply handling.** `lib/ai/conversation.ts` already has `processIncomingReply`, but nothing feeds
it — there's no inbound webhook. For v1, set `Reply-To` to your normal mailbox so replies reach you
directly, and paste them into the Conversations tab manually. Automatic inbound needs Resend's
inbound routing or Cloudflare Email Routing forwarding to an API route, and can wait.

**Delivery webhooks.** Resend can POST delivered / opened / bounced / complained events. Wiring one
route to fill `deliveredAt`, `openedAt` and to set `emailStatus = BOUNCED` gives you the analytics
page for free and, more importantly, stops you re-sending to dead addresses.

---

## Suggested order

**Phase 0 — find out what you're actually looking at.** Check whether the Outreach tab is showing
the demo fixtures or the failure template. Fifteen minutes, and it may change everything below.

**Phase 1 — fix the two bugs.** The 150-character edit truncation and the "null null" contact names.
Small, self-contained, and the truncation one is actively destroying data.

**Phase 2 — make the drafts specific.** Expand onboarding to capture the offer properly; set
`offerId` on opportunities in `researchCompany`; load the offer, ICP and company firmographics into
the outreach prompt; pass evidence quotes and source URLs instead of summaries; rewrite the prompt
for a plain specific voice with one worked example and a real ban list. This is the phase that
answers your actual question.

**Phase 3 — turn on sending.** Pick the provider, authenticate the domain, move sender identity into
the database, build the guarded send action, add the unsubscribe route, cap the daily volume.

**Phase 4 — close the loop.** Delivery webhooks, suppression enforcement, bounce handling, then
inbound replies.

Phases 1 and 2 are worth doing before 3 regardless. A working send button attached to generic drafts
just means burning your domain reputation faster.
