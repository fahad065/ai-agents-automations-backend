# Traces — running log

Newest entry first. This is "what's actually true right now" — if you're a
fresh Claude Code session picking this up in a different environment than
where it was last worked on, read the top entry before doing anything, then
skim down only as far as you need context.

Append a new entry per session/major milestone. Don't rewrite or delete
old entries — if something here turns out to be wrong, add a new entry
correcting it, don't silently edit history.

---

## 2026-11-11 (later) — New `documents` entity: upload capability built, nudge-banner trigger deliberately deferred

User described a larger flow while asking to start the "users module" work
(trial -> day-25 payment reminder -> admin-confirmed invoice -> one-time
"you're a paid member, please upload an ID" dashboard nudge) and asked for
a new `documents`/`attachments` object in the UML. Two real design
decisions here, both confirmed via `AskUserQuestion` before writing code:

1. **Separate `documents` collection**, not an embedded array on `User` —
   matches the `activity_logs`/`notifications` pattern this whole redesign
   already uses for "a user has many of these."
2. **Build the upload capability now; defer the nudge-banner trigger** —
   "first confirmed payment" has no home yet (`userservices`/invoicing is
   the module planned *after* `users`, not built). Building a stand-in for
   that now risked redoing it once the real module exists.

Shipped: new `src/modules/documents/` module — schema (`UploadedDocument`,
named to avoid colliding with Mongoose's own `Document` type, collection
pinned to `documents`), service, controller. File storage is **Vercel
Blob** — confirmed the user already has `@vercel/blob` + a working
`BLOB_READ_WRITE_TOKEN` wired up on the frontend (the demo-video uploader
script), so this reuses that instead of introducing a new storage
provider; **this backend now needs the same token added as a Railway env
var**. `POST /documents` (multipart, 10MB cap, JPG/PNG/WEBP/PDF),
`GET /documents` (own or `?userId=` for admin), `DELETE /documents/:id`
(soft-delete + best-effort blob cleanup). See `architecture.md`'s new
`documents` section for the full implementation notes, including the
user's explicit instruction (sent mid-build) that the eventual nudge
banner should reuse the existing `ProfileCompletionBanner` mechanism
rather than being a new component — noted there so it isn't lost before
`userservices` gets built.

**Verified**: `tsc --noEmit` clean, `nest build` clean, Jest 31/31 (no
spec changes needed — nothing this touched is covered by the existing
suite). No live Vercel Blob account in this sandbox to test a real upload;
`put()`/`del()` calls were traced against `@vercel/blob`'s own shipped
type definitions, not run live.

---

## 2026-11-11 — `apikeys.provider` opened up to any provider, not just the preset list

User asked directly: the Add API Key dropdown should keep the existing
preset providers, but if something's missing, let the user type a name
and save it as a new provider — not restricted to the AI/known list.
Confirmed this is the generic BYOK key store the user described
separately in the same conversation ("that API key collection is not
just only for AI... but also other user will be adding different type
of API keys... on the go, so we will be adding multiple different types
of API keys") — this change makes that actually true at the schema
level, not just true by convention.

- `ApiKey.provider`: `@Prop({enum: ApiKeyProvider})` → `@Prop({type:
  String})` — no longer a storage whitelist. `ApiKeyProvider` stays as a
  TS enum, now purely for type safety at the AI-specific call sites
  (`ai-provider.util.ts`, `testKey()`'s branches), not a validation
  constraint.
- New `normalizeProvider()` in `ApiKeysService` — slugifies whatever gets
  typed (trim, lowercase, non-alnum → `_`) so repeat adds of the same
  provider under slightly different casing/spacing always land on the
  same stored key.
- `getUserIdsWithActiveKey()`/`getDecryptedKey()`/`testKey()` widened
  from `ApiKeyProvider` to `string` params — call sites passing a known
  enum value (`ApiKeyProvider.OPENAI` etc.) are unaffected, since enum
  members are just their string literal.
- **Deliberately NOT widened**: `Chatbot.chatModelConfig`/
  `embeddingModelConfig` stay constrained to `ApiKeyProvider` — those
  decide which AI adapter (`ai-provider.util.ts`) actually gets called,
  and that code only knows openai/anthropic/gemini. Only the generic
  key-storage field needed to open up.
- Frontend: `api-keys-page.tsx`'s Add-key dialog's provider picker
  changed from a button-grid to a real `<select>` dropdown (per the
  user's explicit ask for "a dropdown"), with an "Other" option revealing
  a free-text input. Each known option is prefixed with its existing
  emoji icon; "Other" is prefixed with 🔑 — both per a follow-up message
  mid-implementation asking specifically for icon parity on known
  providers and a key-icon default for anything typed in. The
  table/badge rendering already fell back to 🔑 for any provider not in
  the `PROVIDERS` list (confirmed before relying on it, not assumed), so
  a newly-typed custom provider automatically gets the right icon there
  too with no extra code.

**Verified**: backend `tsc --noEmit`, `nest build`, Jest (31/31) all
clean. Frontend `tsc --noEmit` + `next build` (all 43 routes) clean.

---

## 2026-11-10 (latest) — Diagnosed: new-signup admin alerts fail completely silently

User checked production MongoDB directly and found 2-3 real signups from
the day before with zero admin-alert email and no sign of them anywhere
— found out purely by accident, not from any platform signal. Traced
`AuthService.register()` end to end rather than guessing at a Resend
outage.

**Root cause, confirmed in code, not assumed:** `EmailService.send()` —
the one shared method every outbound email goes through — wraps its
entire body in try/catch and on failure only does
`this.logger.error(...)` (a Railway log line) before returning `false`.
It never throws, so `register()`'s two notification calls
(`sendAdminAlert()` for the email, `notificationsService.onUserRegistered()`
for the in-app bell notification, itself wrapped in `.catch(() => {})`)
can both fail for any reason — bad/revoked `RESEND_API_KEY`, lapsed
domain verification, Resend quota/rate-limit, a DB hiccup — with
**zero** surfacing anywhere an admin would actually see it. This is by
design for *not blocking signup* (correct — a flaky email provider
should never fail someone's registration), but the complete absence of
any failure signal is the actual gap: there was never a safety net
behind the "don't block signup" decision.

Also found, while reading the notification path: `onUserRegistered()`'s
`actionUrl` was `/admin/users`, a route that doesn't exist on this
platform (the real admin users page is `/dashboard/users`) — so even a
successfully-created in-app notification would have 404'd on click.

**Fixed:**
- `EmailService.send()`'s catch block now also calls
  `Sentry.captureException()` (tagged `area: email`, the subject, and the
  recipient) — Sentry is already live in this backend (see the "Per-tenant
  usage/error monitoring" section of CLAUDE.md), so this is a one-line
  addition that covers *every* email send at once, not just signup alerts.
  A failed send now shows up in the Sentry dashboard instead of only a
  Railway log line nobody is watching.
- `onUserRegistered()`'s `actionUrl` corrected to `/dashboard/users`.

**Not fixed, flagged instead — needs the user to check things this
sandbox can't reach:** I can't see Railway's logs, the Resend dashboard,
or confirm `RESEND_API_KEY`/`ADMIN_NOTIFY_EMAIL` env vars from here (same
no-network-to-production limitation noted throughout this whole project).
Told the user to check Railway's logs for `[Email] Failed "New signup...`
lines around Nov 10 (now that Sentry captures it going forward, this is
the last time this has to be a manual log hunt), and to check Resend's
own dashboard for bounced/failed sends or an API-key/domain issue around
that date.

**Verified**: `tsc --noEmit`, `nest build`, Jest (31/31) all clean.

---

## 2026-11-10 (even later) — `apikeys` module rebuilt (new UML schema) + multi-provider AI (OpenAI/Claude/Gemini) for chatbots

Picked up the next item in the user's stated sequence ("once you done with
these, then we will jump to api keys and users module"). Started with the
schema migration itself, then a user question mid-implementation ("if
user is adding claude/openai/gemini... do we need to consider model as
well?") turned into a real architecture detour — answered below.

**`apikeys` schema migration** — `isActive: boolean` → `status` enum +
real `isDeleted` soft-delete, `agentId`/`expiresAt` dropped (both
confirmed dead via grep first). Self-healing `onModuleInit()` backfill,
same pattern as every other collection in this redesign (one aggregation-
pipeline `updateMany()` doing the field rename + stale-field cleanup in
one atomic op). `deleteKey()` is now a real delete, not a disable.

**Multi-provider detour** — asked the user directly whether adding a
Claude/Gemini key needs a model-selection concept too, scoped first to
chatbots, then the user widened the question to agents/automations as
well. Investigated rather than assumed, and found something bigger than
expected: **agents/automations don't use BYOK at all** —
`UserModulesService.runPipeline()`'s payload to Python never includes an
API key, and `script_writer.py`/`audio_generator.py` both build their
OpenAI client from a platform-wide `OPENAI_API_KEY` env var at module
load. Every YouTube/Instagram pipeline run bills LogicMate's own account,
not the customer's — a real contradiction of this file's own stated BYOK
principle, not a design gap. Flagged this to the user explicitly rather
than quietly fixing it (changes production billing behavior). User
confirmed: yes, BYOK should be universal across every service, but
**sequencing stays chatbots first, agents/automations later** — so this
session's actual code only touches chatbots; the agents/automations BYOK
fix is a flagged, confirmed-but-deferred item (see `architecture.md`'s
`apikeys` section for the exact follow-up steps).

**What shipped for chatbots:**
- `ApiKeyProvider` gained `anthropic`/`gemini` (+ `testKey()` branches for
  both).
- New `src/modules/api-keys/ai-provider.util.ts` — the shared adapter
  every AI call now goes through: `callChatCompletion()` (OpenAI/
  Anthropic/Gemini each have genuinely different request/response shapes)
  and `getEmbeddingVector()` (OpenAI/Gemini only — confirmed Anthropic has
  no embeddings API at all, enforced server-side in
  `ChatbotsService.create()`/`update()`, not just a UI restriction).
- Design confirmed with the user: **provider is always explicit** (it
  decides which of the customer's own keys gets billed — never safe to
  auto-pick), **the specific model within that provider defaults to
  `"auto"`** (a fixed per-provider default, not a live `models.list()`
  probe per chat message — that would be a real latency cost on a
  customer-facing endpoint for very little benefit). Same shape the
  Python pipeline already uses for `video_model: "auto" | str"`, just
  applied consistently now.
- `Chatbot.chatModelConfig`/`embeddingModelConfig` (`{provider, model}`,
  both default OpenAI/auto) — owner-editable via the existing
  `PUT /chatbots/:id`, nothing new needed route-wise.
- `ChatService.chat()` and `ChatbotsService.addKnowledge()`/
  `updateKnowledge()` rewritten to resolve provider+key per-chatbot
  instead of a hardcoded OpenAI path. `findAllAdmin()`'s "needs setup"
  queue now checks whichever provider each bot is actually configured
  for — previously a bot fully working on Claude would have permanently
  shown as "needs setup" since the check only ever looked for OpenAI.
- Frontend: `api-keys-page.tsx` gained Anthropic/Gemini to the add-key
  provider grid. `chatbot-config-page.tsx` gained a new "AI Model"
  section on the Overview tab (provider dropdown + model input per chat/
  embedding, defaulting to Auto) and the OpenAI-only key-gate dialog/
  banner was generalized to whichever provider the bot is actually
  missing a key for (`AddOpenAiKeyDialog` → `AddProviderKeyDialog`).

**Verified**: backend `tsc --noEmit`, `nest build`, Jest (31/31, one test
updated for `extractLeadInfo()`'s new `provider` parameter) all clean.
Frontend `tsc --noEmit` + `next build` (all 43 routes) clean.

---

## 2026-11-10 (later same day) — Account deletion rebuilt: the first version's design didn't match what the user actually meant

User tested the first version's wording against their own mental model
and it didn't match — they'd pictured something closer to three
genuinely distinct buttons with different mechanics, not one flow with
a single implicit mode. Asked three clarifying questions before
touching code rather than guessing a second time (calendar vs working
days, whether any email fires before the reminder, how "Instant" should
be confirmed) — all three came back as the recommended option, which
simplified the rebuild.

**Deactivate Account** turned out to need zero backend changes — traced
`AuthService.login()` first rather than assuming, and it already throws
`UnauthorizedException('Account deactivated')` for `isActive: false`,
and the admin Users page already has the reactivate toggle. The user's
described behavior was already fully live; nothing to build.

**Delete Account Permanently** rebuilt with a real mode split:
- `requestDeletion(userId, mode: 'instant' | 'scheduled')` — `instant`
  runs `deleteUserData()` synchronously in the same request, no waiting,
  no cancel path (there's nothing pending to cancel). `scheduled` sets
  `pendingDeletionAt = now + 8 calendar days` (not working days — the
  "7 working days" from the first version was a misread; the user's
  actual words were "day 7 reminder, day 8 delete," which only makes
  sense as calendar days).
- New `deletionReminderSent` flag on `users` + `AccountDeletionService.
  sendDueReminders()` — a second cron pass (atomic-claim, same pattern
  as the deletion pass) that fires exactly one reminder email, one day
  before `pendingDeletionAt`, and can never double-send across replicas.
  `sendAccountDeletionRequestedEmail` still fires immediately on request
  too (day 0) — two emails total for the scheduled path, matching the
  "send one immediately too" answer.
- Frontend's confirm dialog now picks a mode first (two cards, "Delete
  in 8 days" / "Delete instantly"), and only renders the typed-`DELETE`
  confirmation input when Instant is selected — the scheduled path keeps
  a plain confirm button, since it already has a real cancel window.

Everything else from the first version (billing anonymized not deleted,
`deleteUserData()`'s exact deletion scope, the `.xlsx` export, the
Terms/Privacy copy already handed to the user) is unchanged — this was
a correction to the *mechanics* of deletion/reminder timing and the
Deactivate/Delete split, not a rebuild from scratch.

**Verified**: `tsc --noEmit`, `nest build`, Jest (31/31) all clean.

**User explicitly asked to push straight to `main` this time** (both
`fahad-development` and `main`, no local-test gate first) — different
from the established CMS-era workflow (push to `fahad-development`,
user pulls and tests locally, then says when to push to `main`). Noted
here in case a future session wonders why this one skipped that step —
it was a direct instruction this time, not a default.

---

## 2026-11-10 — Account deletion + data export built, closes the last item from the previous session's list

User-confirmed policy before any code (asked via a real decision, not
guessed): billing anonymized not deleted (confirmed via reading
`billing.schema.ts` first — no denormalized PII to scrub, so anonymizing
`User` in place is enough), a 7-working-day notice with the account
staying fully usable the whole time (not a lock-then-wait model) so the
user can actually reach Settings to export first, and the export
covering everything including billing history. Full design recorded in
`architecture.md`'s new "Account deletion" section — read that for the
why; this entry is just the what-shipped.

**New `src/modules/account-deletion/`**: `AccountDeletionService`
(`requestDeletion`/`cancelDeletion`/`getStatus`/`exportUserData`/
`performScheduledDeletions`), `AccountDeletionController` (`POST
/account/deletion/request`, `POST /account/deletion/cancel`, `GET
/account/deletion/status`, `GET /account/export`), `AccountDeletionCron`
(`0 3 * * *`, atomic-claim pattern same as `chatbot-billing.cron.ts`).
`users.schema.ts` gained `deletionRequestedAt?`/`pendingDeletionAt?` +
a sparse index. Added `exceljs` (new dependency, wasn't in this repo
before) for the `.xlsx` export — one sheet per data type (Profile, API
Keys, Subscriptions, Chatbots, Knowledge Base, Conversations, Billing,
Activity Log).

Two new `EmailService` templates: `sendAccountDeletionRequestedEmail`
(the deadline + backup instructions + disclaimer, sent the moment
deletion is requested) and `sendAccountDeletionCompletedEmail` (sent
right before the user's own email gets scrubbed — captured into a local
variable first, specifically so this last email can still reach them).

**Terms of Service and Privacy Policy content updated** in `seed()`'s
copy (new ToS section 8 "Account termination and deletion," rewritten
Privacy Policy sections 5 "Data retention" and 6 "Your rights") — but
this only affects a *fresh* seed, not the user's live pages, since
`seed()` only reaches docs with no `lastEditedBy` set and their real
Privacy/Terms docs already have one (every save through `/dashboard/cms`
sets it). Gave the user the exact HTML to paste into their live pages
directly instead of trying to reach the DB from this sandbox (no network
path to Atlas, same limitation as every prior session).

**Verified**: `tsc --noEmit`, `nest build`, Jest (31/31) all clean. Also
booted the compiled app against a deliberately unreachable Mongo URI to
confirm the new module's DI wiring resolves (9 injected models in one
service, more cross-cutting than most modules in this codebase) — the
boot log shows `AppModule dependencies initialized` before the expected
`MongooseServerSelectionError`, same verification pattern used for the
Sentry wiring in an earlier session. No live Mongo in this sandbox to
actually run `performScheduledDeletions()` or exercise the full
request→wait→delete flow end to end — worth a real test against a
throwaway account once this is running somewhere with real DB access.

---

## 2026-11-09 — `activity_logs` built (full), Notifications module audited and two real gaps fixed

With CMS confirmed done and merged, the user moved to the next item on
their own stated order: Activity Logs, then Notifications, then (gated,
see below) account deletion/export — "once you done with these, then
we will jump to api keys and users module and then services and
userservices."

**`activity_logs` — new module, full implementation** (see
`architecture.md`'s `activity_logs` section for the final schema/API —
updated in place, since the user's own requirement during this session
corrected the original "admin-only" framing to "owner sees own, admin
sees all"). Built: `src/modules/activity-logs/` (schema, service,
controller, module, `@Global()` same as Notifications/Email).
`ActivityLogsService.record()` is the one shared entry point — every
call site is explicit, never a generic diffing interceptor (per
`rules.md` #10) — and it swallows its own errors so a logging failure
can never break the real operation it's describing.

Instrumented a bounded, representative set of real call sites (not
every CRUD everywhere, per `implementation-guide.md`'s own guidance,
adapted to the collections that actually exist today rather than the
future `userservices`/`services` which haven't been built yet):
`ApiKeysService` (create/update/delete), `ChatbotsService` (create/
update/delete + knowledge-base create/update/delete), `UserModulesService`
(subscribe/toggle/cancel), `UsersService` (profile update/password
change/deactivate, admin update/delete of another user).

**Real sensitive-data catch while instrumenting, not shipped as-is**:
`ChatbotsService.update()`'s `changes` can include `channels` — the
WhatsApp/Instagram config sub-object, which carries a **plaintext**
access token (never encrypted the way `ApiKey.encryptedKey` is). The
first draft logged `changes.after` verbatim. Fixed before this ever ran
against real data: log only the *field names* that changed
(`Object.keys(changes)`), never their values, for any update whose
editable-field set might include something sensitive. Applied the same
"keys only" pattern to `updateKnowledge()` and `UsersService.updateProfile()`
as a matter of consistency, not because either is currently sensitive —
cheaper to default to safe than to re-audit every future field addition.

**Actor vs. subject, resolved per call site, not forced into one shape**:
`userId` on a log entry is always the *account the entry belongs to*
(so a client sees "an admin configured your chatbot" in their own
feed); `actorId`/`actorRole` is whoever actually did it. For
`ChatbotsService`, the already-loaded `chatbot.userId` gave the real
subject directly (the service already supports admin-acting-on-a-
client's-behalf via its existing `isAdmin` param, so no new plumbing
was needed). For `ApiKeysService`/`UsersService.adminUpdate/adminDelete`,
added an optional `actor`/`adminId` parameter since the controller
already resolves owner-vs-caller separately from `req.user` and the
service had no way to see both before this.

API: `GET /activity-logs/my` (own feed), `GET /activity-logs/admin`
(admin-only, `userId`/`entityType`/`action` filters) — both paginated
(`page`/`limit`), backed by `{userId:1,createdAt:-1}` /
`{createdAt:-1}` / `{entityType:1,createdAt:-1}` indexes so this stays
fast as the collection grows, per the user's explicit "make sure all
the APIs are paginated... reliable and fast... if there are tons of
records" requirement.

**Notifications module audit** — schema/service/controller were already
largely complete (pagination, soft delete, unread count, user+admin
fan-out via `notifyUserAndAdmin`) — `architecture.md` already said
"unchanged," confirmed correct, no schema migration needed. Two real
gaps found and fixed, both on the frontend side (see that repo's
`traces.md`): (1) the dashboard auth-gate middleware set `?from=` on
the redirect to login, but the login/signup forms only ever read
`?redirect=` — meaning the user's described "click an email link while
logged out → sign in → land on the actual intended page" flow was
silently broken for every protected URL, always dropping back to the
plain `/dashboard`; (2) `actionUrl` navigation only worked (partially)
on the full `/dashboard/notifications` page via `router.push()`, which
can't open an external link (e.g. a YouTube URL from
`onPipelineComplete`) — and the header's notification-bell dropdown
didn't navigate on click at all, only marked as read.

**Verified**: `tsc --noEmit`, `nest build`, Jest all clean (31/31 — had
to add a `activityLogsService` mock to `chatbots.service.spec.ts`'s two
manual `new ChatbotsService(...)` call sites, since that constructor
gained a new required dependency).

**Not started yet, explicitly gated**: account deletion + data export
(Excel backup, then real deletion beyond today's `isActive:false`
soft-deactivate) — this needs the user's decision on data-retention
policy (hard delete vs. anonymize-and-retain-billing vs. a grace
period) before any code gets written; asked via the chat, not guessed.

---

## 2026-11-08 (even later) — `CmsPageSlug` enum values corrected to match real saved data

The user hit a real 404 testing `/cookies` locally and traced it to this:
they'd been saving the 7 structural pages from `/dashboard/cms` using
their own slugs — `about-logicmate`, `contact-us`, `privacy-policy`,
`terms-of-service`, `cookie-policy`, `frequently-asked-questions`,
`refund-policy` — not the short `about`/`contact`/`privacy`/etc the
`CmsPageSlug` enum assumed. Every public page's fetch (hardcoded to the
short form) was looking up a slug that didn't exist in their data.

Fixed by changing the code to match their saved values, not the other
way around (no data was touched): `CmsPageSlug`'s enum values in
`cms.schema.ts` updated to the real slugs above — this is the single
source of truth, so `seed()` and `backfillAboutGlobalMarketContent()`
(both reference it via `CmsPageSlug.ABOUT` etc., never a raw string
literal) picked up the fix automatically, no other backend file needed
touching (confirmed via `grep -n "CmsPageSlug\."` across `src/modules/
cms/` — every usage goes through the enum). See the frontend repo's
`traces.md` for the matching frontend-side fix (every hardcoded fetch
URL and the admin editor's `CORE_PAGE_SLUGS`).

**Worth remembering**: the Next.js *route* a page lives at (`/cookies`)
and the *slug stored in Mongo* for that page's `cms` document
(`cookie-policy`) are two completely independent things — one's a URL
path segment picked by a folder name, the other's a database lookup key.
Nothing requires them to match; they just happened to not match here
because the admin typed a different value when first saving.

Verified: `tsc --noEmit`, `nest build`, Jest (31/31) all clean.

---

## 2026-11-08 (latest) — CMS migration merged to `main` — Phase 6's cms piece is done

User tested the whole flow locally against `fahad-development` (creating
pages, blog posts, the new "+ New Page" flow, FAQ sections on arbitrary
pages, hiding the navbar language selector) and confirmed it all worked,
then said to push everything to `main` in all three repos and mark the
CMS migration done.

- **Backend**: `fahad-development` fast-forwarded cleanly onto `main`
  (no divergence — `main` had zero commits `fahad-development` didn't
  already have). Re-ran `tsc --noEmit`, `nest build`, and the Jest suite
  (31/31) on `main` after the merge, all clean, then pushed. 6 commits
  landed: the `ai/` folder, `trends`/`content_ideas` deletion decision,
  `services.brochureUrl`, and the full CMS merge + API redesign.
- **Frontend**: same clean fast-forward, no divergence. Re-ran
  `tsc --noEmit` and `next build` on `main` after the merge, clean, then
  pushed. This included everything from the initial CMS rewrite through
  "+ New Page", the generic-page FAQ support, and the navbar language
  selector hide.
- **python-services**: also fast-forwarded — this repo's
  `fahad-development` only ever carried the `ai/` documentation folder
  (confirmed via `git diff --stat` before merging — docs-only, zero code
  touched), unrelated to the CMS work specifically but merged for
  consistency since the user asked for all three repos.
- `ai/implementation-guide.md`'s Phase 6 section updated to mark the
  `cms` merge ✅ done, with the one real caveat spelled out: **the actual
  data migration (`scripts/migrate-cms.js` against the real Atlas DB) and
  the manual drop of the old `pages`/`blogposts` collections still
  haven't happened** — no session has had network access to Atlas. The
  code has read/written exclusively through `cms` since it shipped, so
  this is a remaining data-move step, not a design gap. Flagging this
  clearly rather than overstating "done" as "fully migrated."

**Next up, per `implementation-guide.md`**: Phase 0 (delete the other
confirmed-dead collections — `niches`, `subscriptions`, `trends`,
`industries`, `industry-subscriptions`), then Phase 1 (`services`
catalog) — not started yet.

---

## 2026-11-08 (later same day) — CMS API redesigned too, not just the schema — "Pages"/"BlogPosts" fully gone now

**Why:** the entry below shipped the schema merge with a deliberate
backward-compat strategy — keep the old `/cms/pages/:slug`,
`/cms/blog(/:slug)`, `/cms/admin/pages/:slug`, `/cms/admin/blog...` routes
and method names exactly as they were, so the frontend needed zero
changes. The user explicitly rejected that approach: "I don't want any
page/component in frontend and any api related to these collections:
'BlogPosts' and 'Pages'. You can delete them. Now I need complete new
code for CMS module in both frontend and backend." So this isn't a
bugfix on top of the earlier entry — it's a second, deliberate pass that
throws out the backward-compat shim and rebuilds the API itself around
the unified model.

**Done:**
- `cms.controller.ts` rewritten — one resource, not two route groups.
  Public: `GET /cms/content?type=&category=&tag=&page=&limit=` (list),
  `GET /cms/content/:type/:slug` (single). Admin: `GET /cms/admin`
  (list, `?type=&search=&page=&limit=`), `GET /cms/admin/:id` (also
  accepts a slug — see below), `POST /cms/admin` (create — blog only in
  practice, see below), `PUT /cms/admin/:id`, `DELETE /cms/admin/:id`
  (soft delete), `POST /cms/admin/seed`.
- `cms.service.ts` rewritten to match: `getPublic`/`listPublic` (public),
  `adminList`/`adminGet`/`adminCreate`/`adminUpdate`/`adminDelete`/`seed`
  (admin) — replacing `getPage`/`getPageAdmin`/`updatePage`/`seedPages`/
  `getBlogPosts`/`getBlogPost`/`getAllBlogPostsAdmin`/`createBlogPost`/
  `updateBlogPost`/`deleteBlogPost`. `splitDto`/`flattenCms` kept (generic
  dto-shape helpers, not tied to the old collection names) but now
  type-aware via one `metaFieldsFor(type)` lookup instead of two separate
  field-list constants threaded through by hand at each call site.
- `adminGet`/`adminUpdate` accept **either** a real ObjectId or a slug —
  this is what lets the admin pages-editor keep addressing a page by its
  fixed slug ("about", "faq", ...) without a separate lookup-by-slug
  endpoint.
- Pages are **not** freely creatable from `POST /cms/admin` the way blog
  posts are — `adminCreate` still requires `dto.type` to be `'page'` or
  `'blog'` and will create either, but the admin UI only ever calls it
  for blog; the 7 fixed page slugs (`PAGE_SLUGS` in the frontend) are
  real Next.js routes, so creating an arbitrary 8th page document
  wouldn't do anything — same reasoning as before, just now stated
  explicitly in the controller/service rather than implied by what the
  frontend happened to call.
- **`src/modules/cms/schemas/page.schema.ts` and `blog-post.schema.ts`
  deleted outright** (the previous entry below left them in place, unused,
  as a safety net — the user explicitly authorized deleting them this
  time: "You can delete them"). Confirmed via grep first that nothing
  else in `src/` still imports either file.
- **Frontend**: every public marketing page's fetch call updated to the
  new `/cms/content/...` shape (`about-page.tsx`, `contact-page.tsx`,
  `faq-page.tsx`, `legal-page.tsx`, `blog-post-page.tsx`,
  `blog-list-page.tsx`, `app/(marketing)/blog/[slug]/page.tsx`'s
  `generateMetadata`). `dashboard/cms-page.tsx` (the live admin editor)
  fully rewritten against `/cms/admin...` — renamed the colliding
  `interface CmsPage` (shadowed the exported `CmsPage` component) to
  `CmsItem`, kept the two-tab/two-modal structure (pages vs. blog posts
  still get separate, focused forms — their field sets genuinely differ,
  this was a deliberate choice stated to the user, not an oversight) but
  both modals now hit the one shared admin resource.
  `admin/admin-cms.tsx` (confirmed dead, never imported — same recurring
  dead-shadow-file pattern this codebase has hit before) was deleted in
  the same pass.
- `scripts/migrate-cms.js` **unchanged** — it's a one-time ops script that
  reads the raw `pages`/`blogposts` Mongo collections directly (not
  through any API), so it isn't "frontend/component or API tied to those
  collections" in the sense the user meant; it still needs to exist,
  unmodified, until the migration has actually been run once against
  real data.

**Verified:** backend — `tsc --noEmit` clean, `nest build` clean, Jest
31/31 passing (untouched specs, unaffected by this). Frontend — had to
`npm install` first (no `node_modules` existed in this sandbox yet, 790
packages installed), then `tsc --noEmit` clean and `next build` clean,
all 42 routes generating.

**Still true from the previous entry, unchanged:** the migration script
still hasn't been run against real data from this sandbox (no
`MONGODB_URI`/network path to Atlas) — **the app will not work correctly
until it has been**, since both the old and new backend code read from
`cms`, never `pages`/`blogposts`. Nothing about this pass changes that
next step.

---

## 2026-11-08 — CMS merge implemented (Phase 6's cms piece, done early — zero dependencies)

**Done:** `src/modules/cms/schemas/cms.schema.ts` (new, the merged `pages`+
`blogposts` shape from `architecture.md`), `scripts/migrate-cms.js` (one-time,
run by hand, not wired into app boot), `cms.service.ts` rewritten against
the new schema, `cms.module.ts` repointed at it. **`cms.controller.ts`
needed zero changes** — every method name it calls
(`getPage`/`getPageAdmin`/`updatePage`/`seedPages`/`getBlogPosts`/
`getBlogPost`/`getAllBlogPostsAdmin`/`createBlogPost`/`updateBlogPost`/
`deleteBlogPost`) is preserved exactly, and a `flattenCms()` helper in the
service spreads `pageMeta`/`blogMeta` back onto the top level before any
response leaves the API — so **the frontend needs zero code changes for
this phase**, verified by reading the actual admin editor
(`cms-page.tsx`) and public pages (`faq-page.tsx`, `blog-list-page.tsx`,
`blog-post-page.tsx`, `contact-page.tsx`) field-by-field, not assumed.

**Two real data-loss risks caught while writing the migration script, not
by inspection alone** — `architecture.md`'s `pageMeta`/`blogMeta` shape, as
written before this, was missing `teamMembers` (real `Page` field, holds
the founder's bio — confirmed via `grep` that no frontend page actually
reads it today; about-page.tsx's team section is hardcoded, not CMS-driven
— kept anyway since preserving real seed data costs nothing) and
`publishedAt`/`authorId` (real `BlogPost` fields, used for sort order and
admin attribution respectively). Both added to `cms.schema.ts` **and**
`architecture.md`'s `cms` section — already fixed, not left dangling.

**One real design correction, caught by reading the frontend instead of
assuming:** `architecture.md` originally described `faqItems(_ar)` as one
array with each item carrying its own `question_ar`/`answer_ar` — that was
wrong. The real frontend (`cms-page.tsx`'s admin editor, `faq-page.tsx`'s
public render) uses **two entirely separate parallel arrays**, `faqItems`
(English) and `faqItems_ar` (Arabic), each item plain `{question, answer,
order}`. `cms.schema.ts` implements the two-array version, matching real
usage, and `architecture.md` has been corrected to match.

**Deliberate behavior change, not a bug:** `deleteBlogPost` is now a soft
delete (`isDeleted: true`) instead of a real Mongo delete — matches the
`isDeleted` pattern already on every other collection in the new schema,
per the original design.

**Not done yet — next steps, in order:**
1. Run `scripts/migrate-cms.js` against the real database (needs
   `MONGODB_URI` — no network path to Atlas from this sandbox, so this
   hasn't been run against real data at all yet. **The app will not work
   correctly — every page/post lookup will 404 — until this has been run**,
   since the code now reads from `cms`, not `pages`/`blogposts`.)
2. Spot-check a handful of migrated documents by hand (the script prints
   exactly what to check).
3. Manual CRUD testing against localhost — the actual ask behind this
   phase (per the user's workflow: push to `fahad-development`, pull
   locally, test CRUD, then say when to push to `main`).
4. Only after that's confirmed working (much later, a separate step):
   manually drop `pages`/`blogposts` from Atlas.

---

## 2026-11-07 (later still) — `services.brochureUrl` added

A new optional field, `brochureUrl`, added to `services` right after
`demoVideoUrl` — a downloadable PDF one-pager per service, generic across
types (not chatbot-specific, same reasoning as `demoVideoUrl`). First real
use: a PDF brochure for the restaurant chatbot, generated in a separate
"LogicMate — General Q&A" session, meant to be sent to leads. Frontend
consequence (not yet built): the service detail page gets a second button
alongside "See it works" (opens the demo video) — "Download Brochure /
Overview" (downloads the PDF via `brochureUrl`). See the frontend repo's
`ai/overview.md`.

---

## 2026-11-07 (later same day) — `trends` confirmed for deletion, `content_ideas` flagged to join it

**Answered:** the open question in the previous entry below. The user
confirmed `trends` should be deleted now, not paused — framed as "when we
start working on agent, we will come with more feasible solution to
implement any kind of agent," meaning the old YouTube-specific
trend-discovery mechanism isn't being carried forward at all; agent
implementation gets redesigned from scratch when that phase is reached, not
patched from what exists today.

**Follow-on, not yet explicitly confirmed by the user:** `content_ideas`
references `trends` by id (`trendId`) — flagged back to the user that it
should almost certainly be deleted alongside `trends` rather than left
pointing at a dropped collection. `architecture.md`/`rules.md`/
`implementation-guide.md` have been updated to reflect `trends` as
confirmed-delete and `content_ideas` as recommended-delete (pending
explicit confirmation — check for a later trace entry before assuming
either way). `pipeline_runs` is unaffected — it stays paused, not deleted,
since it's generic run-tracking infrastructure, not tied to the old
ideation approach specifically.

Both `trends` and `content_ideas` (once/if confirmed) move to **Phase 0**
in `implementation-guide.md`, not Phase 7 — unlike `modules`/`usermodules`,
neither has a replacement to build first, so there's no reason to defer
deleting them.

---

## 2026-11-07 — Architecture finalized, branches created, `ai/` folders written

**What happened:** A long design conversation (originating in a different
Claude Code session, on claude.ai) worked through the full database
redesign now documented in `architecture.md`. All 13 collections were
finalized field-by-field, cross-referenced against the real pre-redesign
schemas. A visual ERD exists as a Claude Artifact (not linked here since
artifact links aren't stable/fetchable by a cold agent — this `ai/` folder
is the durable, versioned record instead).

**Done this session:**
- Created and pushed the `fahad-development` branch from `main` in all
  three repos (`ai-agents-automations-backend`,
  `ai-agents-automations-frontend`, `logicmate-python-services`). All work
  happens on this branch until explicitly told to push to `main`.
- Wrote this `ai/` folder (backend repo) and equivalent lighter versions in
  the other two repos.
- No implementation has started yet. Phase 0 (deleting confirmed-dead
  collections) and Phase 1 (`services` catalog) are next, per
  `implementation-guide.md`.

**Open question, not yet resolved — read before touching `trends`:**
The user asked to manually delete `trends` from the database (alongside
`niches`/`subscriptions`/`industries`/`industry-subscriptions`/`modules`/
`usermodules`) once each phase is implemented. Everything else on that list
checks out against `architecture.md`'s delete/replace table. `trends` does
not — it was previously categorized as **paused, not deleted**, same as
`pipeline_runs`/`content_ideas` (real, needed for the agents/automations
phase, just unused by chatbots today). `trends` is also referenced by
`content_ideas.trendId` — deleting one without the other leaves a dangling
reference. This was flagged back to the user in the same turn; their answer
hadn't arrived yet when this entry was written. **Before deleting `trends`,
confirm: (a) is the intent to drop trend-discovery from the agents/
automations rebuild entirely (in which case `content_ideas` likely needs
the same treatment), or (b) was `trends` meant to be grouped with the
Phase-2-paused collections like `pipeline_runs`/`content_ideas` and the
delete instruction was really about the others on that list.** Don't guess
— check this trace file's next entry (if one exists, the question was
answered) or ask.

**Not started:** no schema code written yet, no migration scripts written
yet, no frontend "My Services" work started, Stripe untouched (correctly —
not needed yet).

## 2026-11-12 — `users` schema finalized per architecture.md

Closes the `users` collection section of the redesign — user asked to
"implement complete users module both frontend and backend structure as
per new UML diagram," following straight on from the `documents` module
(see the entry above and the frontend's matching traces.md entry for that
one). See `ai/architecture.md`'s `users` section for the full before/after
and the implementation notes — summary here:

- `isActive: boolean` → `status: 'active'|'inactive'` enum (the
  convention this redesign already applies to every other collection).
- 5 flat notify booleans → one nested `notifyPreferences: {}` object.
- `facebookId`/`appleId`/`AuthProvider.FACEBOOK`/`AuthProvider.APPLE`
  deleted outright (dead — `AuthService.facebookLogin()` had no route,
  Apple never existed).
- `totalAgents`/`totalAutomations` dropped as stored fields — now computed
  fresh per admin-list request (batched aggregates, not N+1), with a new
  `totalChatbots` added alongside them.
- `UsersService.onModuleInit()` self-heals every pre-existing doc, same
  pattern as `ApiKeysService.onModuleInit()`.
- **Found and fixed while tracing every `isActive` call site (real,
  pre-existing bugs, not introduced here)**: `AuthService`'s YouTube/
  Instagram OAuth token storage was still writing/reading the old
  `ApiKey.isActive` field name after that collection migrated to `status`
  on 2026-11-10 — meaning OAuth connection-status checks have been
  silently broken (always "not connected") since that migration.
  `AccountDeletionService.exportUserData()`'s API Keys export sheet had
  the same stale-field bug. `UsersController.grantFree()` was sending a
  `planType` value (`'lifetime'`) that isn't in the real enum. All three
  fixed alongside this pass since they're the same class of bug this
  exercise was already hunting for.

Verified: `tsc --noEmit` + `nest build` clean, Jest 31/31, and a direct
boot against an unreachable Mongo URI to confirm the new
`UsersModule`→`ChatbotModule` DI wiring resolves (no live Atlas in this
sandbox to run the backfill against real documents).

## 2026-11-12 — Phase 0: dead-collection code removed (industries deferred)

User will drop the collections from MongoDB Compass manually; this pass
removes the code. Deleted outright: `src/modules/niches/`,
`subscriptions/`, `trends/`, `content-ideas/` (+ their `app.module.ts`
registrations). Confirmed zero cross-references first (grep across all
three repos — the Python service never called any of them). `NichesModule`
was never even registered in `app.module.ts`.

**Deliberately NOT removed yet: `industries` + `industry-subscriptions`.**
Both are still live: `/industries` + `/industries/:slug` are public
marketing pages (navbar, footer, hero, CTA, niches section all link
there), `/dashboard/industries` is the admin editor, and the dashboard
overview reads `/industry-subscriptions`. architecture.md already flagged
industries as "confirm where the marketing content goes first." Plan:
industry bundles become `services` docs with `type: 'bundle'` +
`include[]` in Phase 1 (that's exactly what a bundle is in the new
schema), and `industry-subscriptions` is replaced by the `userservices`
bundle fan-out in Phase 2 — delete both modules' code at that point, then
drop the collections.

Note `/dashboard/subscriptions` (frontend) is NOT tied to the dead
`subscriptions` collection — it reads `/usermodules`. Kept.

Frontend: `modules-page.tsx`'s marketplace called `GET /niches`, which
404'd (never registered) and rejected the whole `Promise.all` — the "+ Add
Module" grid has been coming up empty. Fixed: niche filter pills are now
derived from the loaded modules' own `nicheSlug`. Dead
`discoverTrend`/`generateIdea`/`getIdeas`/`runPipeline` helpers removed
from `dashboard-api.ts`.

## 2026-11-12 — Phase 1: `services` catalog (agents/automations/chatbots)

New `services` module replaces `modules` end to end — see architecture.md's
`services` implementation notes for the full detail. Highlights:
- Boot-time migration `modules` → `services`, insert-only, keyed on and
  preserving each doc's original `_id` so every existing reference keeps
  resolving. User asked whether it runs once or every deploy: every boot,
  but it only ever inserts, so after the first run it changes nothing.
- One mapper for migration + seed (`moduleType`→`type`,
  `features`→`featureCards`, `isActive`/`isComingSoon`→`status`).
- `ChatbotsService` now reads pricing/tiers from `ServicesService`.
- `ModulesModule` deleted.
- New `services.service.spec.ts` (11 tests: mapper rules, seed integrity —
  22 entries, 9 chatbots with Basic/Pro tiers — `_id` preservation,
  insert-only, undefined-stripping, slug-collision skip, no-op after
  `modules` is dropped). Suite now 42/42.
- Could not run the migration against a real MongoDB here: the in-memory
  server's binary download is blocked by the sandbox egress policy, and
  installing an alternative server was declined by the permission policy.
  Covered by the spec above plus a DI boot check instead. **First real run
  is the next Railway deploy** — check its log for "Migrated N module(s) ->
  services" (expect 22) before dropping `modules` in Compass.

Also fixed the same day, separately: `users.notifyPreferences` had a `{}`
default, which Mongoose's `minimize` strips on save — so new signups were
stored with no `notifyPreferences` at all (user spotted it on a real
production signup). Default is now the real values; the existing
`UsersService.onModuleInit()` backfill heals any user already missing it.

## 2026-11-12 — Schemas trimmed to the UML + confirm-before-migrating rule

User pushed back that `services` had copied old production fields instead
of following the UML. Owned it: every UML field was present, but I'd kept
4 extras (`pipelineType`, `category`, `availableIn`, `estimatedCostPerRun`)
without asking. User chose: keep `pipelineType` (added to the UML — the
`pipeline_runs` section already depended on it), drop the other three. On
boot, `ServicesService.dropRetiredFields()` unsets them from the docs the
first release already wrote to production.

Same review on `users`, confirmed with the user before changing anything
(new rules.md #13): `minimize: false` so `onboarding: {}` and
`notifyPreferences` actually save; 7 dead fields removed and unset on boot;
`timezone`/`company` kept and added to the UML. New
`users.service.spec.ts` covers the cleanup. Suite 47/47.

## 2026-11-12 — industries removed; modules migration removed

User: "we don't need industries … we are dealing directly with services."
Deleted `src/modules/industries/` and `src/modules/industry-subscriptions/`
(+ `app.module.ts` registrations); nothing else in the backend or the Python
service referenced them. Industries were NOT converted into bundle services.

Also removed `ServicesService.migrateFromModules()` (and its 5 tests — suite
now 42/42): it already ran in production, the user confirmed the services
data, and they're dropping `modules` by hand. `dropRetiredFields()` and the
seed stay.

Collections the user will drop by hand: `modules`, `industries`,
`industry-subscriptions` (plus Phase 0's `niches`, `subscriptions`,
`trends`, `content_ideas`). Next: Phase 2 `userservices`, then delete the
`usermodules` code.

## 2026-11-12 — Backlog recorded (no code)

User asked to record, not build: (A) move file storage from Vercel Blob to
S3-compatible storage + Cloudflare behind one backend FileUploadService
(videos keep displaying from Blob until then); (B) generate and email an
onboarding contract after the first payment, signed + uploaded to
Documents; (C) rollout order — all chatbot templates in the admin panel,
then agents, then automations, with lead sourcing per service in parallel.
Full notes + suggestions: implementation-guide.md "Backlog". User asked to
be reminded of these.

## 2026-11-13 — Account deletion now removes uploaded documents (bug fix)

Found while reviewing the production Privacy Policy/Terms text: deleting an
account removed chatbots, knowledge base, conversations, API keys,
subscriptions and notifications — but NOT the `documents` collection (which
can hold identity documents such as an Emirates ID) or their stored files,
because the documents module was added after account deletion was built.
The data export also left documents out.

`DocumentsService.purgeAllForUser()` hard-deletes every document row for the
user (including already-soft-deleted rows, which still hold ID metadata) and
best-effort deletes each stored file (a failed file delete never blocks the
account deletion). Called from `AccountDeletionService.deleteUserData()`
(both Instant and 8-day paths). Export gained a "Documents" sheet. New
`documents.service.spec.ts`; suite 44/44.

## 2026-11-13 — Email addresses: real Reply-To + role-based mailboxes
Mail is sent from `noreply@logicmate.io` (send-only, no inbox) with no
Reply-To, while several templates say "reply to this email" — so replies
(e.g. payment receipts) were lost. `EmailService.send()` gained a `replyTo`
param, sent as Resend `reply_to`, default `REPLY_TO_EMAIL || hello@logicmate.io`.
Trial/chatbot-trial emails reply to `billing@`, account-deletion emails to
`privacy@`; their in-body contact addresses changed to match. Mailbox roles:
hello@ general/admin alerts, support@ technical, billing@ payments/refunds,
privacy@ data/cookies/deletion, legal@ terms/contracts. No `.ai` addresses.
tsc (build config) clean, jest 44/44, nest build OK.

## 2026-11-16 — Service list sections: Arabic editable + value_ar
`HeroStat` gained optional `value_ar` (e.g. "Instant" → "فوري"); heroStats is
stored as `[Object]`, so no migration — existing docs just lack it and fall
back to `value`. architecture.md updated to list every list-section `_ar`
sibling. Frontend side (admin inputs + detail pages rendering them): see
frontend traces.

## 2026-11-16 — users + services regrouped into sub-objects (user-approved migration)
User asked for related fields to be grouped instead of flat; final field
list confirmed before migrating (rules.md #13).
- **users**: name/email/password/role/status/isDeleted/onboarding/
  notifyPreferences stay top level; `profile`{phoneNumber,country,avatar,
  timezone,company}, `auth`{provider,googleId,isEmailVerified,verification +
  reset tokens,refreshToken}, `plan`{planType,trialStartDate,trialEndDate,
  isFreeForever,totalBilled}, `welcomeEmails`{day1/3/7Sent}, `deletion`
  {requestedAt,pendingAt,reminderSent}. Migration
  `UsersService.groupFlatFields()` (onModuleInit): one raw-collection pipeline
  updateMany — `$mergeObjects` of the flat values with any existing group
  (existing wins), then `$unset` of every old path; filter only matches docs
  with an old field, so it's a no-op after first boot. Drops old indexes
  `googleId_1`/`planType_1`. New `sanitizeUser()`/`USER_PUBLIC_PROJECTION`
  strip password + every auth token from API responses (previously only
  password/refreshToken were stripped — verification/reset tokens leaked into
  /users/profile responses). PATCH /users/profile takes `{name, profile:{…}}`;
  PATCH /users/:id takes `{name,status,role,profile:{phoneNumber,country},
  plan:{planType,trialEndDate,isFreeForever}}`, both written as dotted paths.
  Response keys of GET /admin/usage and GET /account/deletion-status kept flat.
- **services**: `content`/`seo`/`display`/`pipeline`/`pricing` (pricingTiers →
  pricing.tiers, stripePriceId → pricing). `badge` DROPPED (user's call — it
  duplicated status). Before unsetting badge, any doc with badge "Coming Soon"
  and status active is set to coming_soon so the site looks the same.
  Migration `ServicesService.groupFlatFields()` runs before the seed; drops
  old index `type_1_status_1_isDeleted_1_sortOrder_1`. Seed mapper emits the
  grouped shape. `ChatbotsService` reads `module.pricing.tiers`.
- Specs: users migration (5 cases), services migration (4), plus fixed the
  chatbot go-live spec whose mock still used flat `isEmailVerified` (it was
  passing vacuously) and added the verified-owner-can-go-live case. 53/53.
- Not run against a real MongoDB (no network path from this sandbox) — the
  pipeline relies on `$mergeObjects` omitting missing fields, documented
  MongoDB behaviour. Check the boot log lines "Grouped …" on the next deploy.

## 2026-11-16 — Knowledge-base word-matching search (Claude-only bots)
Anthropic has no embeddings API, so a chatbot running on a Claude key alone
(chatModelConfig.provider = anthropic, no OpenAI/Gemini key for embeddings)
fell to `allKnowledge.slice(0, 8)` in ChatService.chat() — only the first 8
entries were ever visible to the model; entry #9+ produced fallback replies.
Same `slice(0, 4)` in the "embedding call failed" and "entries saved without
embeddings" branches. New `chat/keyword-rank.ts` `rankByKeywords()`: small
BM25-style scorer (idf-weighted, FAQ question matches ×2, Unicode tokens so
Arabic works, crude plural folding, stopwords dropped); top 6; if nothing
matches (e.g. "hi") it keeps the old first-N behaviour. Used in all three
non-embedding paths. Semantic search path unchanged. Spec: 7 cases incl. a
30-entry restaurant KB with the answer past the old cut-off. 60/60.

## 2026-11-16 — Restaurant chatbot end-to-end run (63/63) + 4 production bugs fixed
First full Basic → Pro run against the REAL backend (dist/, NODE_ENV=production),
REAL frontend build and REAL MongoDB 7 (Docker, `mirror.gcr.io/library/mongo:7`
— Docker Hub rate-limits; Atlas is unreachable from the sandbox: Mongo needs a
direct TCP connection, only HTTPS goes through the proxy). Only OpenAI/Resend/
Meta are answered locally by `test/e2e/fake-net.cjs`. Harness + docs:
`test/e2e/` (README, run.sh) and `docs/test-cases/restaurant-chatbot.md`
(every case with input → expected output). Same real Mongo also ran the
users/services grouping migrations on old-shape docs: 18/18 checks + idempotent.

Bugs found and fixed:
1. **Website widget blocked in production.** CORS allowed only FRONTEND_URL,
   but the widget calls /api/v1/chat/* from customers' own sites. main.ts now
   uses a CORS delegate: /api/v1/chat/* = any origin, no credentials; all
   else unchanged. Reproduced with a preflight from a foreign origin first.
2. **WhatsApp/Instagram never replied.** Webhooks computed a reply and dropped
   it. ChatService.sendMetaReply() posts to graph.facebook.com/v21.0/{phoneNumberId}/messages
   and graph.instagram.com/v21.0/{accountId}/messages with the bot's token.
3. **Webhooks accepted anyone.** Verify handshake accepted any token; POSTs had
   no signature check. Now: per-bot random `verifyToken` per channel (generated
   on save), handshake must match it (marks webhookVerified); every POST must
   carry X-Hub-Signature-256 = HMAC-SHA256(channel.appSecret, raw body)
   (NestFactory rawBody: true), else 403 before any AI call. A channel without
   appSecret counts as not set up. Echoes ignored. Basic bots / disabled
   channels ignored with 200 (no AI call — protects BYOK credits).
4. **Public /chat trusted the caller's `channel`** — now always 'website'.
Also: two user indexes still pointed at old flat paths (trialEndDate,
pendingDeletionAt) → plan.trialEndDate / deletion.pendingAt, old ones dropped.

Schema: WhatsappChannel + InstagramChannel gained `appSecret`; Instagram
gained `verifyToken` (WhatsApp already had it, unused). Unit tests 68/68.

## 2026-11-16 — Restaurant chatbot pricing: round numbers
Owner set: Basic $79/mo or $49/mo billed annually; Pro $120/mo or $99/mo
billed annually. Live prices are set by the admin (Services → Pricing tab);
code changes only keep fresh installs and docs in line:
- seed-services.ts restaurant-chatbot: pricing + tiers 79/49 and 120/99
  ($setOnInsert only — never touches an existing document).
- test/e2e/restaurant-e2e.cjs: Basic fee 79, Pro fee 120. Full run 63/63.
- docs/brochures/restaurant-chatbot.html + README table updated, PDF re-rendered.

## 2026-11-16 — Service saves: unknown fields are now a 400, not silently dropped
Owner's morning edit to the restaurant chatbot's content "came back" as old
content. Checked: the seed is $setOnInsert-only and an edit survives a restart
(tested on local Mongo). The real cause: a save sent in the old flat shape
(`description`, `heroStats`… at the top level — a page loaded before the 04:15
regroup deploy) returned 200 while Mongoose strict mode stripped every field,
so nothing was stored. ServicesService.create/update now use strict 'throw'
(+ runValidators) and map StrictModeError/ValidationError to a 400
("Unknown field … Reload the page and save again."). The admin form's
`testimonials` (never on the schema, never stored) is no longer sent and its
tab is hidden. Also typed keyword-rank.spec.ts's knowledge-base fixture.

## 2026-11-16 — Gym chatbot: content, brochure, prices
Owner confirmed the gym uses the restaurant's prices (Basic $79/mo or $49/mo
annually; Pro $120/mo or $99/mo annually). Seed for gym-chatbot updated to
match (insert-only, no live data touched); brochure source added at
docs/brochures/gym-chatbot.html. Admin content handed over as a .md file
(owner pastes it into Services → Gym Membership Bot).

## 2026-11-16 — Gym chatbot e2e suite + test cases
test/e2e/gym-e2e.cjs (same flow as the restaurant suite, gym data: pool,
women-only hours, membership price edit, trial + class booking link, two
branches) and docs/test-cases/gym-chatbot.md. Extra case: asking to book a
specific class only shares the booking link, never confirms a spot. First run
on a fresh database: 64/64.

## 2026-11-17 — Knowledge links, branch facilities, e2e for the dashboard rework
- Knowledge entries: optional `linkLabel` next to `sourceUrl`; an faq can be
  text, a link, or text + link (e.g. address + Google Maps). chat/knowledge-format.ts
  is the one place that renders entries for the AI and builds embed text, and
  validates them (question required, answer or link, http(s) links only).
  Older `url` entries used to render as an empty snippet — they now reach the bot.
  The prompt tells the model to share links exactly.
- Outlet gained `facilities: string[]` (labelled per template in the dashboard)
  and is shown to the AI as "Facilities/services".
- Setup-guide email links to /dashboard/modules (My Services).
- e2e: gym suite now subscribes through Browse Services, adds a text + Google
  Maps answer through the UI, checks template-specific Locations fields and
  My Services. Gym 75/75, restaurant 65/65; unit tests 74/74.

## 2026-11-17 — Phase 2 (chatbots): `chatbots` → `userservices`
Owner confirmed the field list (rules.md #13): plan object for tier + per-deal
prices; no custom/blank chatbots (every bot comes from a catalog service);
`awaiting_setup_payment` → `past_due`; chatbots first, `usermodules` next.
- New `src/modules/userservices/` (global): `UserService` + `ChatbotUserService`
  models on one `userservices` collection; `chatbot-view.ts` keeps the
  `/chatbots/*` API shape; `userservices.migration.ts` (onModuleInit, same
  `_id`, idempotent, never deletes `chatbots`).
- Repointed: ChatbotsService/controller, ChatbotBillingCron (status/trialEndDate/
  trialReminderSentAt), billing-status util, ChatService (embedKey lookup,
  webhooks), UsersService counts, account deletion/export, BillingService
  (`findByUserService`). knowledgebases/conversations/billings use
  `userserviceId`. Deleted `chatbots/schemas/chatbot.schema.ts`.
- `updatePricing` now ends a trial only when a setup fee is set (it used to end
  it on any price/tier change).
- Removed Nest starter leftovers: app.controller/app.service, test/app.e2e-spec.ts,
  test/jest-e2e.json, `test:e2e` script (needed supertest, never installed).
- Verified: unit 74/74; migration 20/20 on local Mongo + second boot no-op;
  migrated bot answers on its old embedKey + webhook handshake; e2e
  restaurant 66/66, gym 76/76.
- Collections the owner can now drop by hand (after checking production):
  `chatbots`, plus the earlier `modules`, `industries`, `industry_subscriptions`,
  `niches`, `subscriptions`, `trends`, `content_ideas`.

## 2026-11-17 — Agents/automations on `userservices`; `usermodules` code deleted
Owner: no customer data in `usermodules`, so nothing migrated.
- `PipelineUserService` model (same `userservices` collection, typed `config`:
  pipelineType, niche, schedule{frequency,time,days}, paused, customPrompt,
  videoModel, apiKeyMode, lastRunAt/totalRuns/totalCost).
  `pipeline-services.{service,controller,cron,module}.ts` + `pipeline-view.ts`
  replace `usermodules/*` and `modules/schemas/user-module.schema.ts` (deleted).
- Routes `/userservices/*`, same response shape as before; `/usermodules/*`
  alias kept until the Python service on main is redeployed (its branch
  `claude/env-vars-repo-setup-js2a6s` now calls /userservices).
- Subscribe takes name/type/pipeline from the catalog (not the request body),
  refuses chatbots, duplicates and coming-soon services.
- Status: trial→past_due when the trial ends unpaid (was "expired"); pause is
  `config.paused` (was status "paused"); remove = isDeleted + cancelled.
- Bugs fixed on the way: Instagram key lookup used `isActive` (field no longer
  exists) so it never found a key; run-status returned the user's latest run of
  ANY service (now this service's, matched by ObjectId — a string agentId never
  matched); admin overview/extend-trial/pause-all queried `isActive`/
  `pausedReason`, which never existed.
- Verified: unit 74/74; e2e agent 32/32 (new), restaurant 66/66, gym 76/76.

## 2026-11-17 — One admin "Customer Services" page (chatbots + agents + automations)
Owner asked why the admin sidebar had separate Customer Chatbots and Customer
Subscriptions pages. No reason left: both list `userservices` rows. Merged.
- Admin subscription actions are type-agnostic now (`PipelineServicesService`
  uses the untyped `UserService` model for them, `$set` only, so a chatbot's
  config is never re-cast): `PATCH /userservices/:id/extend-trial`,
  `/free-forever`, and new `/cancel` (status cancelled + cancelledAt, row and
  history kept, activity-logged). `/cancel` was called by the old
  Subscriptions page's "Cancel Subscription" button but never existed — that
  button had always failed.
- `toChatbotView().billing.isFreeForever` added so the admin list can show it.
- Verified: unit 74/74; e2e agent + gym extended with Customer Services checks.

## 2026-11-17 — Removed the temporary `/usermodules` route alias
The Python service on main (0739bf9) calls `/userservices`, so
`PipelineServicesController` now answers only on `/userservices`. The agent e2e
suite checks `/usermodules/:id/record-run` returns 404. Old comments that
named `usermodules` crons now name `pipeline-services.cron.ts`.

## 2026-11-17 — Chatbot AI model: one provider, model picker, no scroll jump
Owner (testing the gym bot) asked for one provider instead of chat +
embedding, a model dropdown fetched from the provider with Auto as default,
and reported the page jumping to the top when opening a provider dropdown.
- One provider: `config.chatModelConfig` is the only AI setting;
  `embeddingModelConfig` removed from schema/view/editable fields (old values
  left in existing docs are ignored). `embeddingProviderFor()` in
  ai-provider.util.ts: OpenAI/Gemini embed with themselves (default embedding
  model), Anthropic → no embeddings → keyword ranking. Changing provider
  re-embeds the knowledge base in the background; the chat engine only
  compares vectors of the query's length meanwhile. Needs-setup checks the
  one provider's key.
- `GET /chatbots/:id/models?provider=` lists chat models from the bot
  OWNER's key (BYOK): OpenAI /v1/models filtered to gpt-/o*/chatgpt-
  (no embedding/audio/image/realtime), Anthropic /v1/models, Gemini
  generateContent models. Returns `{keyMissing}` with no key, `{error}` if
  the provider rejects it. Frontend `ModelPicker`: Auto first and default;
  changing provider resets to Auto.
- Scroll jump root cause: cmdk scrolls its highlighted item into view as the
  list mounts, before Base UI has positioned the popover, so the browser
  scrolled the page to the top. `Combobox` now mounts the list two frames
  after opening and focuses the search with `preventScroll` — fixes every
  dropdown in the app.
- Verified: unit 79/79 (new ai-provider.util.spec.ts); gym e2e gained an
  "AI model" section (scroll, model list, save, Claude switch, re-embed).

## 2026-11-18 — Clinic prep: insurance per UAE branch; E-commerce/Education dropped
- `Outlet.insurance: string[]` (default []). The chat prompt lists it per branch
  ("Insurance accepted: …", anything else → say it's not listed, offer the team).
- E-commerce and Education chatbots removed from the services seed (so they
  aren't recreated after the owner deletes them in Compass) and the template
  slug map. Catalog is now 20 services / 7 chatbots.
- Clinic pricing (Basic 99/79, Pro 149/119) is set by hand in the Service
  Catalog — owner asked that nothing new go into the seed.
- Production admin login removed from CLAUDE.md (still in git history —
  owner to rotate the password).
- Verified: unit 80/80 (new insurance prompt test); real-stack check of the
  Locations form (8/8); gym + restaurant e2e.

## 2026-11-18 — Startup migrations removed; invoices; one API key form
- **Startup**: every one-time migration hook deleted (UsersService,
  ApiKeysService, ServicesService regroup/retired-field cleanup,
  UserServicesMigration, CmsService About backfill) — production was already
  migrated. The services seed now runs only when `services` is empty
  (`estimatedDocumentCount() === 0` → insertMany). The chatbots→userservices
  converter lives on as a test fixture (`test/fixtures/chatbot-row.ts`).
  Migration check scripts in test/e2e removed.
- **Bug fixed**: Confirm payment never passed `billingRecordId`, so a
  customer's "I've paid" record stayed PENDING forever. `confirmPayment` now
  finds the latest PENDING row of that kind (or creates a PAID one when the
  customer never submitted), marks it PAID and issues an invoice.
- **Invoices** (owner-approved: LogicMate Dubai as issuer, no VAT, email PDF +
  Billing tab): fields on `billings` + `invoicecounters`; pdfkit PDF;
  `GET /billing/:id/invoice` (owner/admin); `EmailService.sendInvoiceEmail()`
  attaches it. Issuer config in `billing/invoice-issuer.ts`.
- **Docs**: CLAUDE.md rewritten to the current code; the dated feature
  write-ups moved to `ai/feature-history.md`.
- Open: `PIPELINE_SECRET` / `CRON_SECRET` have hard-coded fallbacks in code —
  must be set on Railway.

## 2026-11-18 — Clinic chatbot test cases + e2e; clinic demo site
- New `docs/test-cases/clinic-chatbot.md` + `test/e2e/clinic-e2e.cjs`
  (`run.sh clinic`): full Basic → Pro run like the gym suite, plus
  clinic-specific cases — per-branch "Insurance accepted" (field shown only
  for a UAE branch, hidden for Kenya, typed value kept across a country
  switch, each branch's own list in the AI instructions, no insurance line
  for a non-UAE branch), medical question → fallback + hand-off, emergency
  number, appointment request → booking link (never confirms a slot),
  $99/$149 pricing, invoice for the Pro upgrade. 97/97 passed.
- The suite sets the clinic service to $99/$79 and $149/$119 in the e2e
  database first (what the admin did by hand in production); the seed still
  has the old prices, which only matter for a brand-new empty database.
- Demo website for recording: `fahad065/logicmate-clinic-website`
  ("Noor Family Clinic", 5 UAE branches, branch-specific insurance).

## 2026-11-19 — Clinic demo site made international
- Owner direction: the clinic chatbot is sold worldwide, not just the GCC.
  The demo site is now "Meridian Family Clinic" with one clinic each in New
  York, London, Dubai, Sydney and Toronto — local currency prices, local
  insurance plans (Medicare, OHIP, Bupa, Aetna, Daman…), time zones and
  emergency numbers.
- Owner approved: the Locations tab's "Insurance accepted" field now shows
  for clinic branches in every country (`showsInsurance(profile)` — no
  country check). The backend already sent any branch's list to the AI.
  Clinic e2e updated (field shown for 6 countries; New York/Dubai lists kept
  apart). Clinic CMS copy (EN+AR) and brochure reworded with international
  examples (Medicare, Bupa) instead of Daman/AXA/Al Barsha.
- Harness fix: `run.sh` now retries the `lm_e2e` wipe until Mongo accepts
  connections and aborts if the database isn't empty — a run had silently
  started on the previous day's data (2 API keys, invoice LM-…-0002).
  Clinic suite: 101/101.

## 2026-11-19 — Hand-off with no contact details
- Owner report (local clinic test): an out-of-scope question triggered the
  hand-off email with Name/Phone/Email all "—". Not lost data — the visitor
  never shared any — but the team had no way to reach them and the email
  didn't say why.
- `chat.service.ts`: hand-off is decided before anything is appended; when
  it happens and neither phone nor email is known (website/Instagram —
  WhatsApp always has the phone), the reply gets one line asking for name +
  phone/email (Arabic when the bot is Arabic-only or the visitor wrote in
  Arabic). Asked on the first hand-off and again on an explicit "talk to a
  person", not on every unanswered question.
- Hand-off email: no empty rows; shows "No contact details yet — the bot has
  asked for them; you'll get a New lead email if they reply". Lead email:
  when the conversation was already handed off, says the customer is waiting
  for the team; empty rows are hidden in both emails. Unit tests +4 (77);
  e2e clinic 102/102, gym 107/107, restaurant 67/67.
