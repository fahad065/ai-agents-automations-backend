# Database architecture — finalized

This is the single source of truth for the new schema. The frontend and
python-services repos' `ai/architecture.md` point back here rather than
duplicating it — if you're in one of those repos, read this file too, you
need it.

A visual version of everything below (plus the bundle-purchase flow and the
as-built audit that motivated it) exists as a Claude Artifact, but that's a
page for a human to look at — this file is the one an AI agent should actually
parse, since it's committed and versioned alongside the code.

## The core correction — read this before touching `userservices`

This was designed wrong twice during the design conversation and corrected
both times. Do not reintroduce either mistake:

1. **A `userservices` row's `type` is always a real type — `agent`,
   `automation`, or `chatbot`. Never `"bundle"`.**
2. **A `userservices` row's `service_id` is always a single reference, never
   an array.**

A bundle purchase is **N separate `userservices` rows** (one per service
actually included in the bundle), each with its own real `type` and a single
`service_id`, all sharing one `bundle_id` as a pure grouping label for
billing/display. If you ever find code or a schema change making
`service_id` an array "for bundles," or allowing `type: "bundle"` on a
`userservices` document, that is the bug this whole design exists to prevent
— it means the pipeline cron, the billing screen, and the dashboard all need
bundle-aware branching again, which is exactly what this redesign removes.

`services.include[]` (bundle composition) is read **once**, at the moment of
subscribe, to do this fan-out. It is never read again after that for an
existing purchase.

## Collections

Thirteen collections. `(_ar)` after a field name means it has an `_ar` twin
(e.g. `name(_ar)` means both `name` and `name_ar` exist) — this is the only
place bilingual content is marked; see `rules.md` for the one field that
deliberately does **not** follow this pattern (`slug`).

### `users` — the hub
```
_id, name, email (unique)
password?, provider (local|google — facebook/apple are DEAD, see rules.md), googleId?
phoneNumber?, country?, avatar?
role: user | admin
status: active | inactive
isDeleted
isEmailVerified, emailVerificationToken?, emailVerificationExpires?
passwordResetToken?, passwordResetExpires?
refreshToken?
planType: trial | paid | free_forever | expired
trialStartDate, trialEndDate
isFreeForever
welcomeDay1Sent, welcomeDay3Sent, welcomeDay7Sent   -- multi-replica cron guards, keep these
totalBilled                                          -- denormalized, keep (dashboard reads it often)
onboarding: {}
notifyPreferences: {}
deletionRequestedAt?, pendingDeletionAt?, deletionReminderSent -- DONE, 2026-11-10 — account-deletion flow, see below
```
Dropped from today's real `User` schema: `facebookId`/`appleId` (dead —
Google is the only working social login), `totalAgents`/`totalAutomations`
(premature denormalization — compute via `userservices.countDocuments()` on
demand instead), and no per-service subscription dates live here — those
belong once, on each `userservices` row, not duplicated onto the user.

### `apikeys` — BYOK key storage (unchanged in spirit)
```
_id, user_id
provider (dropdown, preset list — openai, whatsapp, etc.)
label
encryptedKey (hidden field — never select it by default, never log it anywhere, including activity_logs)
status: active | inactive
isDeleted
lastUsedAt?
```
Dropped: `agentId?` (referenced a `UserAgent` model that no longer exists
anywhere in the schema — same dead reference dropped from several other
collections below). `expiresAt` is not carried forward unless a real
need for key expiration shows up — flag it, don't add it speculatively.

### `notifications` — unchanged
```
_id, user_id
type (12 enum values — pipeline, agent, api key, chatbot lead/handoff, user, system)
title, message
priority: low | medium | high
isRead
metadata: {}
actionUrl?, icon?
```

### `cms` — merged from today's separate `pages` + `blogposts`
```
_id, type: "page" | "blog"
slug (unique PER TYPE — a page and a blog post may share a slug, they render at different URLs)
title(_ar), content(_ar)              -- content is an HTML string
metaTitle(_ar), metaDescription(_ar)
status: active | inactive
isDeleted
pageMeta?: { subtitle(_ar), faqItems: [{question,answer,order}], faqItems_ar: [{question,answer,order}], teamMembers: [{name,role(_ar),bio(_ar),avatar}], contactInfo: {email, supportEmail, twitter, linkedin, address(_ar)} }
  -- NOTE: faqItems/faqItems_ar are two SEPARATE parallel arrays, not one array with per-item _ar fields — verified against the real frontend admin editor and public FAQ page, implemented this way. teamMembers confirmed unread by any frontend page today (about-page.tsx's team section is hardcoded) but kept — real seed data (the founder's bio), costs nothing to preserve.
blogMeta?: { excerpt(_ar), authorId, authorName, category, tags: [], coverImage, publishedAt, readTimeMinutes, viewCount }
updatedAt
```
No `user_id` — this is public content, isolated from the ownership model.

### `userservices` — CORE. The single answer to "what does this customer own."
```
_id, user_id
type: agent | automation | chatbot        -- NEVER "bundle", see the correction above
service_id                                  -- ALWAYS a single reference, NEVER an array
bundle_id?                                   -- grouping label only, set only when bought as part of a bundle
status: trial | active | past_due | suspended | cancelled
isFreeForever                                -- separate boolean, NOT a status value (it's an exemption that short-circuits billing, not a lifecycle stage)
isDeleted
subscriptionStartDate
trialEndDate, nextRenewalDate
cancelledAt?                                 -- set only if/when actually cancelled; there is no forward-looking "end date" for a continuously-renewing subscription
config: {}                                   -- shape depends on type AND the specific service, not type alone:
  -- agent/automation: schedule{frequency,time,days}, customPrompt?, useCustomPrompt?, youtubeChannelId?, videoModel?
  -- chatbot: persona, embedKey (unique), channels{website,whatsapp,instagram}, humanHandoff, fallbackMessage(_ar), bookingUrl?, outlets[]? (multi-location only)
```
`config` is intentionally loose (`Record<string, any>`, validated at the
application layer, not via Mongoose discriminators) — matches how
`UserModule.config`/`Chatbot`'s fields already work today. Keeping it simple
was a deliberate choice over stronger per-type schema validation, given the
project's stated priority is simplicity and reliability over strictness.

### `services` — CORE. The catalog — everything sellable, including bundles.
```
_id, type: agent | automation | chatbot | bundle
name(_ar), slug                              -- slug has NO _ar twin, see rules.md
description(_ar), tagline(_ar)
metaTitle(_ar), metaDescription(_ar)
nicheSlug, pipelineCategory: standalone | niche_pipeline
components: []                               -- niche_pipeline only
requiredApiKeys: []
capabilities(_ar): []
platforms: []                                -- DESCRIPTIVE/marketing only (e.g. ['WhatsApp']) — NEVER a customer's actual channel credentials, those live on userservices.config
icon, color, badge, sortOrder                -- flat fields, NOT nested under a key called "config" (that name is already used, differently, on userservices)
pricing: { monthly, annual, features(_ar): [], hasCustomPlan, customLabel(_ar) }
pricingTiers: []                             -- generic now, any type may use it, not just chatbots: [{key, monthly, annual, features(_ar): []}]
heroStats: [], featureCards: [], howItWorks: [], faq: []   -- "featureCards" deliberately NOT named "features" — pricing.features[] (plan bullets) and this (marketing cards with icon/title/description) are different shapes that collided under one name in the real schema
demoVideoUrl?
brochureUrl?                                 -- a downloadable PDF one-pager for this service (hosted the same way demo videos are, e.g. Vercel Blob). Generic across types, not chatbot-specific, same reasoning as demoVideoUrl. First real use: the restaurant chatbot's PDF overview, generated in a separate "LogicMate — General Q&A" session.
defaultConfig: {}                            -- seeds a new userservices.config with sensible starting values
include: [service_id]                        -- BUNDLE ONLY. Read once at subscribe time to fan out into N userservices rows. Never duplicated anywhere else, never read again after that.
status: active | inactive | coming_soon
isDeleted
stripePriceId?                               -- catalog-level, one per sellable thing. Not wired to Stripe yet — see rules.md.
```

### `billing` — the manual payment ledger (append-only; never mutate a historical record's amount/status after the fact — a refund is its own new row, not an edit to the original)
```
_id, user_id
userservice_id? OR bundle_id?                -- exactly one set, never both, never neither
serviceName, serviceType                     -- DELIBERATE denormalized snapshot: if the catalog entry is renamed later, old billing records should still show what the customer was actually charged for at the time
type: setup | renewal | refund
amount, currency
status: pending | paid | failed              -- NO "refunded" status — see the append-only note above
transactionRef
confirmedBy (admin), confirmedAt
billingDate
stripeSubscriptionId?, stripeInvoiceId?      -- not wired yet, see rules.md — the REAL current code has half-wired Paddle fields, not Stripe
isDeleted
```
Dropped from today's real `Billing` collection: `chatbotId` (fully superseded
by `userservice_id`/`bundle_id`), `pipelineRunId` + the `usage` billing type
(no evidence this was ever real metered customer billing — the business
model is subscription-based, not pay-per-run), `apiCosts: {}` (that's
LogicMate's own AI-API spend, not money the customer paid — it belongs on
`pipeline_runs`, see below), `paddleTransactionId`/`paddleSubscriptionId`
(replaced by the `stripe*` fields).

### `invoices` — NEW. One per confirmed `billing` record.
```
_id, invoiceNumber (unique, sequential — e.g. INV-2026-0042)
billingId  -- 1:1 with billing
userId, userserviceId?/bundleId?
lineItems: [{description, amount}]           -- for a bundle, can list each included service for clarity even though billing itself has one amount
subtotal, total, currency
billingPeriodStart, billingPeriodEnd
issuedAt, issuedBy (admin)
sentAt?                                      -- when emailed to the customer as a receipt
```
Created in the same action as a `billing` record when an admin manually
confirms a payment (enters the amount + service details, hits save) — see
`implementation-guide.md` for the renew→billing→invoice→email flow design.

### `activity_logs` — DONE, 2026-11-09. Visible to the account owner (own
entries only) AND admin (every entry, filterable) — corrected from this
section's original "admin-only" framing per explicit user direction while
building it: "if user logs in portal, then user should be able to see all
the activity logs by its user_id only. But if admin logs in, then admin
should see all activity logs of all types of users."
```
_id
userId        -- whose ACCOUNT this entry belongs to (the subject) — NOT necessarily who performed it. When an admin acts on a client's behalf, this is the client's id, so the client sees "an admin did X on your account" in their own feed.
actorId       -- who actually performed it (same as userId for self-service actions)
actorRole: user | admin   -- role at the time of the action, stored not re-derived
action: create | update | delete
entityType, entityId
changes: { before?: {}, after?: {} }         -- an EXPLICIT, hand-picked subset of fields per call site. NEVER the raw document. NEVER encryptedKey/password/embedding. Often just `{ fieldsChanged: [...] }` (key names, no values) when the real values could be sensitive (e.g. chatbot.channels carries plaintext WhatsApp/Instagram tokens).
description
createdAt
```
No `isDeleted` — same "closer to immutable log" reasoning as
`knowledge_bases`/`conversations`: an audit trail that can be hidden by the
account it's auditing isn't an audit trail.

Indexes: `{userId:1, createdAt:-1}` (own feed + admin's per-user filter),
`{createdAt:-1}` (admin's default global feed), `{entityType:1,
createdAt:-1}` (admin filter by module).

API: `GET /activity-logs/my` (own feed, paginated `page`/`limit`), `GET
/activity-logs/admin` (admin-only, paginated + `userId`/`entityType`/`action`
filters).

Instrumented so far (a deliberately bounded, representative set per
`implementation-guide.md`'s own guidance — not every CRUD everywhere):
`ApiKeysService` (create/update/delete), `ChatbotsService` (create/update/
delete + knowledge-base create/update/delete), `UserModulesService`
(subscribe/toggle/cancel), `UsersService` (profile update/password change/
deactivate, plus admin update/delete of another user). Adding a new call
site anywhere else is one `activityLogsService.record({...})` call — see
`rules.md` for the one-shared-method convention.

### Account deletion — DONE, 2026-11-10, revised same day
Not a schema of its own — three fields on `users` (above) plus a new
`src/modules/account-deletion/` module. Three Settings → Security
buttons, three different mechanisms:

1. **Deactivate Account** — unchanged, pre-existing, instant.
   `UsersService.deactivate()` sets `isActive: false`; login already
   throws `UnauthorizedException('Account deactivated')` for any
   `isActive: false` user (confirmed by reading `AuthService.login()`
   before claiming this — it was already enforced, nothing to build).
   All data stays exactly as-is. Reversible only by an admin flipping
   the same flag back from `/dashboard/users` (`UsersService.
   adminUpdate()` — also pre-existing) — the user's only path there is
   emailing hello@logicmate.io and asking.
2. **Delete Account Permanently → Instant** — `requestDeletion(userId,
   'instant')` runs the full destructive cascade synchronously, in the
   same request, no waiting period, no email reminder (there's nothing
   to remind about). Frontend requires typing `DELETE` before the button
   activates, given there's no cooling-off period at all once confirmed.
3. **Delete Account Permanently → 8 days** — `requestDeletion(userId,
   'scheduled')` sets `pendingDeletionAt = now + 8 calendar days` (plain
   days, not working days — revised from the original "7 working days"
   design the same day, once the user clarified they meant calendar
   days). The account stays fully usable the entire time — this was
   deliberate from the first version and didn't change: locking the
   account during the window would defeat the point of giving the user
   time to actually reach Settings and export. Two emails, not one:
   `sendAccountDeletionRequestedEmail` fires immediately (day 0,
   confirms the exact date), `sendAccountDeletionReminderEmail` fires
   once on day 7 — exactly `REMINDER_DAYS_BEFORE` (1) ahead of
   `pendingDeletionAt`, claimed atomically via a new `deletionReminderSent`
   flag on `users` (same multi-replica pattern as every other reminder
   flag in this codebase) so it can never double-send. Can be cancelled
   from Settings any time before day 8.

**Billing retained, anonymized — never hard-deleted**, for both Instant
and scheduled paths alike. No denormalized name/email snapshot exists on
`Billing` to begin with (confirmed by reading the schema before deciding
this), so anonymizing the `User` doc in place (stable `_id`) is
sufficient — `Billing.userId` and `ActivityLog.userId`/`actorId` keep
resolving, now to a scrubbed identity, with zero changes needed to
either collection. `deleteUserData()` is the one shared method both
paths call — hard-deletes `Chatbot`+`KnowledgeBase`+`Conversation`,
`ApiKey`, `UserModule`, `Notification`, then anonymizes `User` (name/
email/phone/OAuth ids/password/refreshToken scrubbed, a stable but
no-longer-real email so the unique index keeps holding). `PipelineRun`
deliberately left untouched, same "cost/audit-ish data" reasoning as
`Billing`.

**Export is genuinely everything**: profile, API key metadata (never
raw/decrypted keys), chatbots, knowledge base, conversations
(summary-level — counts/channel/status, not full message transcripts,
flagged as a scope boundary rather than silently dropped),
subscriptions, full billing history, and their own activity log — one
`.xlsx` (via `exceljs`) with one sheet per collection, built in
`AccountDeletionService.exportUserData()`. Available regardless of
which deletion path is chosen (or neither — it's just a backup feature
on its own).

`AccountDeletionCron` (`0 3 * * *`, earliest of the day's crons since
it's the most destructive) runs two atomic-claim passes every day:
`sendDueReminders()` first, then `performScheduledDeletions()`.

API: `POST /account/deletion/request` (body: `{mode: 'instant' |
'scheduled'}`), `POST /account/deletion/cancel` (scheduled path only —
Instant has nothing to cancel), `GET /account/deletion/status`, `GET
/account/export` (streams the `.xlsx`) — all under `JwtAuthGuard`,
self-service only, no admin override (deleting someone else's account
isn't a feature).

### `feedback` — one rating per customer per owned service, moderated before public
```
_id, user_id
userservice_id                               -- UNIQUE per {user_id, userservice_id} — enforced as a DB-level unique index, not just app logic
serviceId                                    -- denormalized, so a public catalog page can query feedback directly without joining through userservices
rating (1-5), text
isApproved
approvedBy?, approvedAt?
isDeleted
```
Uniqueness is per `userservice_id`, not per `service_id` — a customer running
two separate chatbots built from the same template can review each
independently.

### `knowledge_bases` — chatbot child data (the chat engine answers from this)
```
_id, userservice_id                          -- was chatbot_id
type: text | faq | url
question?, answer?                           -- faq only
content?                                     -- text/url
sourceUrl?                                   -- url only
embedding: []                                -- hidden by default; a vector array, not for display; empty if the bot owner has no OpenAI key (graceful BYOK degrade, unchanged behavior)
createdAt, updatedAt
```
No `isDeleted` — deliberate, see `rules.md`.

### `conversations` — chatbot child data (chat session logs)
```
_id, userservice_id                          -- was chatbot_id
sessionId, channel: website | whatsapp | instagram
messages: [{role, content, timestamp}]       -- embedded; fine for a typical session, a real (if unlikely) MongoDB 16MB document-size ceiling for an unusually long-running one
status: active | closed | handoff
visitorName?, visitorEmail?, visitorPhone?
leadNotifiedAt?, handoffNotifiedAt?
createdAt, updatedAt
```
No `isDeleted` — deliberate, see `rules.md`.

### `pipeline_runs` — agents/automations execution history. PHASE 2 — paused, not dropped.
```
_id, userservice_id                          -- REQUIRED now (was optional moduleId)
pipelineType                                 -- plain snapshot string now, not the old narrow enum, see note below
runId (unique — enforce this for real; today's equivalent unique index exists in code but is commented out, a live bug)
status: pending | running | complete | failed | cancelled
currentStep, totalSteps
folderPath?                                  -- output folder, needed for resume-without-rebilling
clipsGenerated, clipPaths: []
niche?, title?, topic?
youtubeUrl?, shortsUrls: [], thumbnailPath?, videoPath?
totalCost, costBreakdown: {}                 -- THIS is where LogicMate's own AI-API spend belongs (not on billing)
apiKeysUsed: []
steps: [{step, label, status, startedAt?, completedAt?, error?}]
logs: []                                     -- capped ~500 entries
errorMessage?
startedAt?, completedAt?
createdAt, updatedAt
isDeleted
```
Real inconsistency fixed here: today's code has two separate, drifted-apart
enums for "what kind of pipeline is this" — `ModuleTemplate.pipelineType` (16
values) and `PipelineRun`'s own narrower `PipelineModuleType` (5 values), so a
run for anything outside that narrower list had no valid value to store.
`pipelineType` is now just a snapshot string sourced from the owning
service's real `pipelineType` at run time, not a separately-maintained enum.

Has no chatbot use today — chatbots answer live over HTTP, there's nothing
asynchronous to track. Needed again the moment agents/automations work
resumes, in whatever shape that redesign takes — unlike `trends`/
`content_ideas` below, this one isn't tied to the specific old
script-ideation approach, just generic run-tracking (status/steps/cost/
output), so it stays paused rather than deleted.

## What this replaces / what gets deleted

| Old collection | Status | Replaced by |
|---|---|---|
| `niches` | **DELETE** — confirmed zero real callers anywhere in the codebase | n/a, dead code |
| `subscriptions` | **DELETE** — confirmed zero real callers | `userservices` was always the real mechanism |
| `industries` | **DELETE** (confirm where, if anywhere, `/industries/:slug` marketing content goes first — `nicheSlug` on `services` already covers the filtering need) | n/a |
| `industry-subscriptions` | **DELETE** — live in the UI but `subscribe()` never actually creates a `usermodules`/`userservices` row; a bundle bought through it can take a payment and run nothing | `userservices` fan-out (see the bundle-flow design) |
| `modules` (ModuleTemplate) | Replaced once migrated | `services` |
| `usermodules` (UserModule) | Replaced once migrated | `userservices` (type: agent\|automation) |
| `chatbots` (ownership fields only) | Replaced once migrated | `userservices` (type: chatbot) |
| `chatbots.billing` subdocument | Replaced once migrated | `userservices` (current state) + `billing` (transaction history) |
| `Billing` (old ledger) | Replaced once migrated | `billing` (new shape) |
| `trends` | **DELETE** — confirmed. The old YouTube-specific trend-discovery mechanism isn't being carried forward; agent implementation gets redesigned from scratch when that phase is reached. | n/a — no replacement, a future redesign decides what (if anything) replaces this |
| `content_ideas` | **DELETE, recommended** — references `trends` by id (`trendId`), so deleting one without the other leaves a dangling reference. Flagged, not yet explicitly confirmed by the user — see `traces.md`. | Same as `trends` |

Manual deletion of each old collection from the database happens by hand,
after its replacement is built, migrated, and verified — this is an
operational step, not something the application code automates. See
`implementation-guide.md` for the order.
