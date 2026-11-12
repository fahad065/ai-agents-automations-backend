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

### `users` — the hub — DONE, 2026-11-12
```
_id, name, email (unique)
password?, provider (local|google — facebook/apple are DEAD, see rules.md), googleId?
phoneNumber?, country?, avatar?
timezone?, company?                                  -- added 2026-11-12: live (Profile page edits both)
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
**Follow-up, 2026-11-12** (user reviewed a real production signup and
asked for the schema to match this list): `notifyPreferences` and
`onboarding` were missing from new signups because Mongoose's default
`minimize` strips empty objects on save — fixed with real defaults for
`notifyPreferences` and `minimize: false` on the schema, plus a backfill.
Seven more fields outside this list were confirmed dead and removed with
the user's sign-off: `totalVideosGenerated`, `totalCreditsUsed`,
`onboardingCompleted`, `trialReminderSent`, `freeForeverGrantedBy`,
`trialExtendedUntil`, `trialExtendedBy` (unset from existing docs on
boot). `timezone`/`company` were kept and added to the list above.

Dropped from today's real `User` schema: `facebookId`/`appleId` (dead —
Google is the only working social login), `totalAgents`/`totalAutomations`
(premature denormalization — compute via `userservices.countDocuments()` on
demand instead), and no per-service subscription dates live here — those
belong once, on each `userservices` row, not duplicated onto the user.

**Implementation notes:**
- `UsersService.onModuleInit()` self-heals every pre-existing doc (old
  `isActive: boolean` → `status` enum, old 5 flat `notifyOnComplete`/
  `notifyOnFail`/`notifyTrialExpiry`/`notifyBilling`/`emailUpdates`
  booleans → one nested `notifyPreferences: {}` object) via two
  aggregation-pipeline `updateMany()` calls, same pattern as
  `ApiKeysService.onModuleInit()` — no manual migration script, same
  sandbox-has-no-Atlas-access reasoning as everywhere else in this file.
  `facebookId`/`appleId`/`totalAgents`/`totalAutomations` are `$unset` in
  the same pass.
- `totalAgents`/`totalAutomations` aren't gone from the API response,
  just gone as **stored** fields — `UsersService.findAll()` (the admin
  list) now computes them fresh per request: one batched
  `UserModule.aggregate()` grouped by `{userId, moduleType}` plus one
  `Chatbot.aggregate()` grouped by `userId` (a `totalChatbots` field is
  new, the frontend's "Modules" column now sums all three), 2 queries
  total regardless of page size — same "batched, not N+1" rule
  `ChatbotsService.findAllAdmin()`/`AdminService.getUsagePerTenant()`
  already established elsewhere in this codebase. Once `userservices`
  exists (Phase 2), this becomes one `userservices.countDocuments()`
  grouped by `type` instead — flagged here so that migration doesn't
  have to rediscover this.
- `AuthService.facebookLogin()` deleted outright — confirmed dead first
  (zero route in `auth.controller.ts` ever called it).
- **Real pre-existing bugs found and fixed while tracing every `isActive`
  reference, not introduced by this pass:**
  - `AuthService`'s YouTube/Instagram OAuth token storage
    (`handleYoutubeCallback`/`getYoutubeStatus`/`disconnectYoutube`/
    `getYoutubeTokens`/`handleInstagramCallback`/`getInstagramStatus`/
    `disconnectInstagram`/`getInstagramTokens`) writes/reads the raw
    `ApiKey` model directly (`this.userModel.db.model('ApiKey')`,
    bypassing `ApiKeysService`) and was still using the old field name
    `isActive` — but `ApiKey` migrated to a `status` enum back on
    2026-11-10 (see `apikeys` above) and that migration never touched
    this file. Since Mongoose's default strict mode silently drops an
    unknown field on write, every connect/create here was writing
    nothing into `status` at all (leaving it at the schema default) while
    every status *read* (`findOne({..., isActive: true})`) matched zero
    documents — meaning `GET /auth/youtube/status` and
    `GET /auth/instagram/status` have been reporting "not connected" even
    immediately after a real, successful OAuth connect. Fixed by
    switching all 13 call sites to `ApiKeyStatus.ACTIVE`/`INACTIVE`.
  - `AccountDeletionService.exportUserData()`'s API Keys sheet read
    `k.isActive` for the same reason — every exported row's "Active"
    column has been blank since the same migration. Fixed to `k.status`.
  - `UsersController.grantFree()` sent `planType: 'lifetime'` — not a
    real `PlanType` enum value (the enum is
    `trial|paid|free_forever|expired`). Fixed to `PlanType.FREE_FOREVER`.
    (This route turned out to be unreachable from the current frontend
    anyway — `users-page.tsx`'s "Grant Free Forever Access" button goes
    through the generic `PATCH /users/:id` → `adminUpdate()`, not this
    dedicated route — left as a correct, available API either way.)
  - Frontend `types/index.ts`/`auth.store.ts`'s `User.planType` type was
    `"trial" | "lifetime" | "pro" | "free"` — none of those last three
    match the real backend enum. Fixed to the real values.
- `notifyPreferences` has no backend-side enforcement today (nothing
  gates an email send on `notifyPreferences.trialExpiry`/`.billing`/etc.)
  — confirmed via grep before restructuring: this was already true of
  the old 5 flat booleans too (pure UI-settable preference data with no
  reader), so the redesign doesn't newly introduce that gap, just
  reshapes the storage. Wiring real enforcement is a separate, future
  feature, not part of this schema alignment.
- `UsersService.updateProfile()`'s `$set` now flattens `notifyPreferences`
  into dotted paths (`notifyPreferences.billing`, etc.) rather than
  replacing the whole nested object, so a partial update never silently
  resets preferences the caller didn't send — defensive, even though the
  one real caller (`settings-page.tsx`) always sends all 5 keys together.
- Frontend: `users-page.tsx` (`status` field, Switch, status filter,
  computed `totalAgents`/`totalAutomations`/`totalChatbots`),
  `settings-page.tsx` (notification toggles read/write
  `notifyPreferences.*`), `usage-page.tsx`/`types/index.ts`/
  `auth.store.ts` (type-only fixes) all updated to match.

**Verified**: `tsc --noEmit` clean, `nest build` clean, existing Jest
suite still 31/31 (untouched by this change — no spec covers
`UsersService`/`AuthService` yet). Booted the compiled app
(`node dist/main.js`) against a deliberately unreachable Mongo URI to
confirm the `UsersModule` → `ChatbotModule`-schema DI wiring resolves
cleanly (gets through `AppModule`/`JwtModule` init, fails only at the
expected `MongooseServerSelectionError` point) — same verification
pattern used for the Sentry wiring earlier in this file. No live MongoDB
Atlas in this sandbox to run the `onModuleInit()` backfill against real
pre-existing documents — traced against
`ApiKeysService.onModuleInit()`'s already-proven identical pattern
instead. Frontend verified via `tsc --noEmit`, `npm run build` (44
routes), and a Playwright pass against mocked `GET /users`/
`PATCH /users/profile` confirming: the Modules column sums
agents+automations+chatbots correctly, the Account Active switch
reflects `status === "active"`, the status filter offers Active/Inactive,
and the notification-preferences save sends the correct nested
`{notifyPreferences: {...}}` body.

### `apikeys` — BYOK key storage -- DONE, 2026-11-10 — see implementation notes below
```
_id, user_id
provider (open-ended string, not enum-constrained — see note below.
          Suggested/known values: atlas_seedance, youtube_data, youtube_oauth,
          openai, anthropic, gemini, elevenlabs, canva, buffer, ollama, instagram_oauth)
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

**Implementation notes:**
- `ApiKeysService.onModuleInit()` self-heals every pre-existing doc
  (`isActive: boolean` → `status` enum + `isDeleted`) via one aggregation-
  pipeline `updateMany()`, same pattern as `ModulesService`/`ChatbotsService`
  elsewhere — no manual migration script, since this sandbox has no network
  path to the real MongoDB Atlas instance.
- `deleteKey()` is now a REAL soft-delete (`isDeleted: true`) — it used to
  only ever flip `isActive: false`, which read as "Delete" in the UI but
  behaved like "disable."
- **`provider` is open-ended, not enum-constrained, 2026-11-11** — the user
  explicitly asked that the API Keys dialog support ANY provider, not just
  AI/known ones: "if there is something missing, let user type in the
  input field and we will consider that provider and save it in the
  database." The `@Prop({enum: ApiKeyProvider})` constraint on
  `ApiKey.provider` was removed (now `@Prop({type: String})`) —
  `ApiKeyProvider` stays as a TS enum of known/suggested values, used only
  for type safety at the AI-specific call sites (`ai-provider.util.ts`,
  `testKey()`'s per-provider branches); it's no longer a storage
  whitelist. `ApiKeysService.saveKey()` normalizes whatever gets typed
  (`normalizeProvider()`: trim, lowercase, non-alnum runs → `_`) so
  "Stripe Payments"/"stripe-payments"/"STRIPE PAYMENTS" always land as the
  same stored provider key on repeat adds. Frontend: `api-keys-page.tsx`'s
  Add-key dialog's provider picker changed from a button-grid to a real
  `<select>` dropdown (per the user's explicit ask) with an "Other" option
  that reveals a free-text input for a custom provider name; each known
  option is prefixed with its emoji icon, and "Other" with 🔑 — new
  providers typed this way fall through to the same 🔑 default icon the
  table/badge rendering already used for anything not in the `PROVIDERS`
  list (that fallback already existed, confirmed before relying on it).
  `Chatbot.chatModelConfig`/`embeddingModelConfig` on the chatbots
  collection were deliberately NOT widened — those stay genuinely
  constrained to `ApiKeyProvider` (openai/anthropic/gemini only), since
  the chat/embedding adapters only know how to call those three; this
  change only affects the generic key-storage field.
- **Multi-provider AI support added the same session** — `anthropic` and
  `gemini` added to the provider enum (previously OpenAI was the *only*
  provider the chatbot engine could actually use, regardless of what a
  customer added). New `src/modules/api-keys/ai-provider.util.ts` is the
  shared adapter every AI-calling step goes through: `callChatCompletion()`
  branches per-provider wire format (OpenAI chat-completions vs Anthropic
  messages API vs Gemini generateContent), `getEmbeddingVector()` same for
  embeddings (OpenAI/Gemini only — **Anthropic has no embeddings API at
  all**, enforced in `ChatbotsService.create()`/`update()` via
  `assertEmbeddingProviderValid()`, not just a UI restriction).
- **Provider is always explicit; the specific model within a provider
  defaults to `"auto"`** — confirmed with the user as the right split:
  provider determines which of the customer's own BYOK keys gets billed
  (never safe to auto-pick), while the exact model is a reliability/cost
  default most customers don't need to think about (same shape as the
  pre-existing Python-side `video_model: "auto" | str` field). "Auto" here
  is a fixed per-provider default model (`gpt-4o-mini` / `claude-3-5-
  haiku-latest` / `gemini-2.0-flash`), not a live `models.list()` probe per
  request — unlike `core/model_health.py`'s `get_best_openai_*` helpers on
  the Python side, a live availability check on every customer-facing chat
  message isn't worth the extra round trip.
- `Chatbot.chatModelConfig`/`embeddingModelConfig` (`{provider, model}`,
  both default to OpenAI/auto) live on the `chatbots` collection itself —
  that collection predates this redesign and isn't otherwise documented in
  this file (see the migration-mapping table further below). The chatbot-
  owner-editable fields list (`CUSTOMER_EDITABLE_FIELDS` in
  `chatbots.service.ts`) now includes both. `ChatbotsService.findAllAdmin()`'s
  "needs setup" queue (`setupFlags.noOpenAiKey`) now checks whichever
  provider each bot is actually configured for, not a hardcoded OpenAI
  check, so a bot fully set up on Claude never falsely shows as needing
  setup.
- **Still platform-key-only, not yet fixed:** agents/automations
  (`UserModulesService.runPipeline()` → the Python pipeline service) never
  send a customer's BYOK key at all — every YouTube/Instagram pipeline run
  bills LogicMate's own platform `OPENAI_API_KEY`, contradicting the BYOK
  principle. Confirmed with the user this is a real bug, not by design —
  deliberately sequenced for later ("first we will focus on chatbot
  service and then jump to agents and automations"). Next session touching
  agents/automations BYOK needs to: (1) pass the decrypted key from NestJS
  to Python per run, (2) rewrite `script_writer.py`/`audio_generator.py`'s
  module-level `OpenAI(api_key=OPENAI_API_KEY)` clients to accept a
  per-request key instead, (3) apply the same provider/model-selection
  design confirmed here (provider explicit, model auto-with-override), (4)
  fix `model_health.py`'s availability probe, which currently checks
  LogicMate's own platform account via `client.models.list()` rather than
  the actual customer's — "auto" would otherwise recommend a model the
  customer's own account/tier can't necessarily access.

### `documents` — new entity, DONE, 2026-11-11 (upload capability only — see note on the deferred trigger below)
```
_id, user_id
documentType (open-ended string, not enum-constrained — same reasoning as
              apikeys.provider: country-specific preset suggestions in the
              UI, e.g. UAE -> Emirates ID, but the user must be able to
              type one that isn't in the list)
fileUrl (Vercel Blob public URL)
fileType? (mime type)
fileSize? (bytes)
uploadedAt
isDeleted
```
User-directed, from a larger described flow (trial -> payment -> invoice ->
one-time "you're a paid member, upload an ID" dashboard nudge). Confirmed
via `AskUserQuestion` before building: (1) **separate top-level collection**,
not an embedded array on `User` — matches the `activity_logs`/`notifications`
pattern already established in this redesign (one row per upload, indexed
on `userId`, no unbounded-embedded-array problem as a user uploads more
documents over time); (2) **build the upload capability now, defer the
trigger** — the "show the nudge once, after the user's first confirmed
payment" behavior depends on a "first payment" event that has no home yet
(`userservices`/invoicing isn't built — it's the module planned *after*
`users`, which is what's actually in progress right now). Building a piece
of that out of order risked having to redo it once the real module is
designed.

**Implementation notes:**
- New `src/modules/documents/` (schema/service/controller/module), Mongoose
  class named `UploadedDocument` (not `Document`) to avoid colliding with
  Mongoose's own `Document` type every schema file in this codebase
  imports — collection name pinned explicitly to `documents` via
  `@Schema({collection: 'documents'})` regardless of the TS class name.
- **File storage: Vercel Blob**, not S3/Cloudinary — confirmed via what
  already exists rather than introducing a new provider: `@vercel/blob` is
  already an installed frontend dependency and the user already has a
  working `BLOB_READ_WRITE_TOKEN` (used today by
  `scripts/upload-demo-video.mjs`, a one-off CLI uploader — see frontend
  CLAUDE.md). This backend now also depends on `@vercel/blob` (added via
  `npm install`, confirmed the sandbox's npm registry access works for a
  genuinely new package, not just a locked one) and needs the **same
  `BLOB_READ_WRITE_TOKEN` value added as a Railway env var** — it's a
  Vercel-project-scoped token, not tied to the Vercel hosting itself, so
  reusing it server-side from Railway is fine. Upload is server-side only
  (`DocumentsService.uploadDocument()` calls `put()` directly with the
  token) — the token is never sent to the browser.
- `POST /documents` accepts multipart/form-data (`FileInterceptor('file')`
  from `@nestjs/platform-express` — `multer` itself already resolved
  transitively via that package, only `@types/multer` needed adding as a
  dev dependency for `Express.Multer.File` typing). 10MB cap, JPG/PNG/
  WEBP/PDF only. Admin can pass `body.userId` to upload on a client's
  behalf, same bypass shape as `api-keys`/`chatbots`.
- `GET /documents` (own, or `?userId=` for admin) / `DELETE /documents/:id`
  (soft-delete both the Mongo record and the actual Vercel Blob object via
  `del()` — a failed blob-delete, e.g. token missing in a dev environment,
  never blocks the DB-side soft-delete, same "never let a secondary
  concern block the primary action" pattern used elsewhere in this
  codebase, e.g. `EmailService`'s swallowed send failures).
- **Not built, deliberately deferred (see above):** no `GET
  /documents/types?country=` endpoint — the country -> preset-document-type
  mapping is small, purely presentational data, and lives client-side only
  (same precedent as `api-keys-page.tsx`'s own hardcoded `PROVIDERS` list),
  not worth a backend round trip. No "first payment -> one-time nudge"
  banner trigger — flagged to build once `userservices`/invoicing exists.
  **User specifically asked that the eventual nudge reuse the existing
  `ProfileCompletionBanner` mechanism** (just adding a documents-check to
  it), not a new banner component — noted here so that decision isn't lost
  before `userservices` is built.

**Verified**: `tsc --noEmit` clean, `nest build` clean, existing Jest suite
still 31/31 (untouched by this change). No live Vercel Blob account in this
sandbox to test a real upload end-to-end — `put()`/`del()` calls were
traced against `@vercel/blob`'s own type definitions (`PutCommandOptions`,
`PutBlobResult`), not run live. Worth a real upload test once
`BLOB_READ_WRITE_TOKEN` is set on Railway.

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

### `services` — CORE. The catalog — everything sellable, including bundles. — DONE (agents/automations/chatbots), 2026-11-12; bundles pending (see notes)
```
_id, type: agent | automation | chatbot | bundle
name(_ar), slug                              -- slug has NO _ar twin, see rules.md
description(_ar), tagline(_ar)
metaTitle(_ar), metaDescription(_ar)
nicheSlug, pipelineCategory: standalone | niche_pipeline
pipelineType                                 -- added 2026-11-12: which pipeline the Python service runs; what pipeline_runs snapshots
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

**Implementation notes:**
- `src/modules/services/` (schema/service/controller/module), API at
  `/services` — same route shapes the old `/modules` had (`GET /`,
  `GET /admin/all`, `GET /:idOrSlug`, admin `POST`/`PATCH`/`DELETE`), with
  `?type=` replacing `?moduleType=`. Public list returns `status` in
  `active|coming_soon`; inactive is admin-only. Admin routes now return a
  real 403 instead of the old `{message:'Forbidden'}` with a 200.
- **Migration** (`ServicesService.migrateFromModules()`, runs every boot,
  insert-only): reads the raw `modules` collection and upserts each doc
  into `services` **keyed on, and keeping, its original `_id`**. That's
  the whole trick — `usermodules.moduleId`, `industries.defaultModuleIds`
  and `industry-subscriptions` keep resolving with zero data rewrite (their
  Mongoose `ref` just changed `'ModuleTemplate'` → `'Service'`). A slug
  collision under a different `_id` is logged and skipped, never guessed
  at. No-op once `modules` is dropped; delete the method then.
- **One mapper** (`legacy-module.mapper.ts`) for both the migration and the
  seed: `moduleType`→`type`, `features`→`featureCards`,
  `isActive`+`isComingSoon`→`status`. The seed (`seed-services.ts`) is the
  old `SEED_MODULES` moved verbatim, still in legacy shape, run through the
  same mapper — so seeded and migrated docs can't diverge.
- **Strictly the field list above** (user direction, 2026-11-12: "follow
  the new UML, not the old production fields"). The first release had also
  carried over `category`, `availableIn` and `estimatedCostPerRun`; the
  user chose to keep only `pipelineType` (now added to the list above,
  since `pipeline_runs` already depended on it) and drop the other three.
  Readers moved: `/agents` and `/automations` filter by `nicheSlug`
  instead of `category`; the marketplace's country filter and
  per-run-cost line were removed (country is being phased out anyway).
  `ServicesService.dropRetiredFields()` unsets them from docs the first
  release already wrote (raw collection — Mongoose strict mode would drop
  an `$unset` of paths no longer on the schema).
- `nicheSlug`/`pipelineType` are plain strings, not enums — the old enums
  had drifted from the stored values (`tiktok`, `whatsapp`, `arabic`...).
- **Dropped** (zero readers): `outputType`, `totalUsersCount`/
  `totalRunsCount`/`avgCostPerRun` and `GET /modules/public/stats`.
- The old `ModulesService` backfills (chatbot pricing/tiers/Arabic copy,
  global-market copy, restaurant demo URL) were not ported: they ran on
  every boot for months against `modules`, so the migrated data already
  carries their results, and the seed carries the current copy.
- `ModulesModule` deleted. `modules/schemas/user-module.schema.ts` stays
  (it's the `usermodules` schema, retired in Phase 2).
- **Pre-existing bugs fixed in passing:** `/pricing` and the admin
  `/dashboard/cms-modules` list both silently showed only the first 20 of
  22 catalog entries (default `limit=20`, never overridden); the AR
  localizer wrote a literal top-level `'pricing.features'` key instead of
  the nested field.
- **Flagged, not changed:** the admin editor's Testimonials tab has never
  persisted anything — `testimonials` wasn't on `ModuleTemplate` and isn't
  on `services`, so Mongoose strict mode drops it on save. Needs a decision
  (add the field, or remove the tab).
- **Bundles not done yet.** `industries` (`defaultModuleIds` = the bundle
  contents) still live in their own collection; next step converts each to
  a `type: 'bundle'` service with `include[]`, and moves the `/industries`
  pages + admin editor onto it.

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
