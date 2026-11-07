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
pageMeta?: { subtitle(_ar), faqItems(_ar): [{question(_ar), answer(_ar), order}], contactInfo: {email, supportEmail, twitter, linkedin, address(_ar)} }
blogMeta?: { excerpt(_ar), author, category, tags: [], coverImage, readTimeMinutes, viewCount }
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

### `activity_logs` — NEW. Admin-only.
```
_id, userId, actorRole: user | admin
action: create | update | delete
entityType, entityId
changes: { before?: {}, after?: {} }         -- an EXPLICIT, hand-picked subset of fields per call site. NEVER the raw document. NEVER encryptedKey/password/embedding.
description
createdAt
```
See `rules.md` for how this gets populated (explicit calls through one shared
service, not a generic auto-diffing interceptor) and `implementation-guide.md`
for which actions are actually worth logging first.

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
