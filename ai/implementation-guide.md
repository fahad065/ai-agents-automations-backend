# Implementation guide — phase order

Read `architecture.md` and `rules.md` first. This is the build order and
why, not a day-by-day schedule. Update `traces.md` as phases complete —
that's what tells the next session (possibly in a different environment)
where things actually stand.

Deleting an old collection from the database at the end of a phase is a
**manual, operational step** done directly against MongoDB Atlas once that
phase's replacement is verified working — the application code does not
drop collections itself.

## Phase 0 — Delete the confirmed-dead collections
No dependencies, zero risk. `niches`, `subscriptions` (zero real callers,
confirmed). `trends` (confirmed by the user — the old YouTube trend-
discovery mechanism isn't being carried forward; agent implementation gets
redesigned from scratch when that phase is reached). `content_ideas`
almost certainly joins this — it references `trends` by id, so keeping one
without the other leaves a dangling reference — flagged as a
recommendation, confirm before actually dropping it. `industries`,
`industry-subscriptions` once it's confirmed where (if anywhere) the
`/industries/:slug` marketing content goes — `nicheSlug` on `services`
already covers the filtering/grouping need, so this is mostly a frontend
content question, not a data-loss risk.

Unlike `modules`/`usermodules` further down, none of these five have a
replacement to wait for — there's nothing to migrate data *into*, so there's
no reason to defer this phase at all.

## Phase 1 — `services` (the catalog)
**Status, 2026-11-12: ✅ DONE.** Agents/automations/chatbots migrated, every catalog reader on `/services`, migration code removed. `industries` + `industry-subscriptions` code deleted at the user's direction (not converted to bundles). Collections left for the user to drop by hand: `modules`, `industries`, `industry-subscriptions` (plus Phase 0's `niches`, `subscriptions`, `trends`, `content_ideas`). **Next: Phase 2 (`userservices`)**; once that's verified, the `usermodules` code is deleted and the user drops that collection.

Everything downstream references it. Build the schema (see
`architecture.md`), write a one-time migration script that reads every
`ModuleTemplate` document and writes a `services` document — **agents,
automations, and chatbots together, in one pass**, not chatbots-only. The
catalog itself isn't where "chatbot first" applies; splitting it would mean
running two parallel catalog systems for a while, which is exactly the kind
of fragmentation this whole redesign removes. Update every catalog-reading
code path (`/agents`, `/automations`, `/chatbots`, `/pricing`, the admin
`cms-modules` editor, the new `/services` marketing page) to read from
`services` instead of `modules`.

Delete `modules` only after this is verified.

## Phase 2 — `userservices` (ownership) + the subscribe/bundle fan-out
Depends on Phase 1. Build the schema and the fan-out logic (one bundle
subscribe → N `userservices` rows sharing a `bundle_id`, per the corrected
design in `architecture.md`). Migrate `Chatbot`'s ownership fields into
`userservices` (type: chatbot) **first** — build it, verify it end-to-end
against a real chatbot, ship it — then migrate `UserModule` the same way,
reusing the same script pattern. This is the first phase where real
customer-facing behavior changes, so it gets tested hardest.

Delete `usermodules` and the ownership fields on `chatbots` only after both
migrations are verified. (The `chatbots` collection itself may still need to
exist briefly for `knowledge_bases`/`conversations` to reference during
Phase 3's transition — check before dropping it entirely.)

## Phase 3 — `knowledge_bases`, `conversations`
Depends on Phase 2 (needs real `userservices` rows to attach to). Repoint
the FK from `chatbot_id` to `userservice_id`. This is what makes a migrated
chatbot actually *work* — answers from its knowledge base, logs its
conversations — not just exist as a renamed ownership record.

## Phase 4 — `billing`, `invoices`
Depends on Phase 2 (needs `userservice_id`/`bundle_id` to reference). Build
the manual renew → billing → invoice → email flow: an admin enters the
amount + service details for a customer who already paid (bank transfer,
proof sent via email/WhatsApp or submitted in-app), hits save, and that one
action creates the `billing` record, the `invoice` record, flips
`userservices.status` to active, and emails the invoice to the customer as
a receipt. Build this as one reusable service method, not controller-only
logic — so when Stripe eventually replaces the manual click with a webhook
(see `rules.md` #11), the webhook calls the same method instead of needing
its own parallel implementation. Support renewing a whole bundle
(`bundle_id`) in one action, not just a single service.

Migrate the old `Billing` ledger and every `Chatbot.billing` subdocument
into the new `billing` shape. Delete the old collection/subdocument only
after verified.

## Phase 5 — Frontend: "My Services"
Depends on Phases 2+3+4 all being live. One sidebar item, one
`userservices`-backed list (`userservices.find({user_id})`), one detail
page per service with a type-adaptive tab view — not a second sidebar item,
not a separate page per type. Chatbot tabs: Overview, Knowledge Base,
Channels, Conversations, Analytics, Billing (reuses the existing
`chatbot-config-page.tsx` pattern). Agent/automation tabs: Overview,
Schedule, Run History (powered by `pipeline_runs`, once Phase 7 lands),
Billing. See the frontend repo's `ai/` folder for the frontend-specific
breakdown.

## Phase 6 — `feedback`, `activity_logs`, `cms` merge
None of these block anything above, and nothing above blocks them —
genuinely parallelizable with Phases 2–5, or done as cleanup once the core
is stable.

**`cms` (merging `pages` + `blogposts`) is ✅ done — code complete, merged
to `main` in both backend and frontend, 2026-11-08.** It moved earlier
than the rest of this phase, per the "could move earlier" note that used
to be here — it had zero dependency on anything else. One unified `cms`
collection/API now, type-discriminated `'page' | 'blog'`, no more code
anywhere referencing the old split `pages`/`blogposts` collections or
schemas (both schema files were deleted outright, not just
superseded). The admin UI (`/dashboard/cms`) can create, edit and delete
both pages and blog posts — pages aren't limited to the original 7 fixed
slugs anymore; a new page slug renders through a generic catch-all route
on the frontend with zero code change per page. See both repos'
`traces.md` for the full detail.

**Still an open, manual follow-up, not blocking anything**:
`scripts/migrate-cms.js` has not actually been run against the real
production/Atlas database from any session yet (no sandbox has had
network access to Atlas) — someone with real DB access needs to run it
once, spot-check the output, and only then manually drop the old `pages`/
`blogposts` collections from Atlas. The app has read/written exclusively
through `cms` since the code shipped, so this is just finishing the data
move, not a design gap.

`feedback` and `activity_logs` have not been started.

For `activity_logs`: start instrumenting the known, bounded set of
business-meaningful actions first (not every CRUD everywhere) —
`userservices` create/update/cancel, `apikeys` create/delete,
`knowledge_bases` create/update/delete, `feedback` create. Don't
double-log `billing`/payment confirmation into `activity_logs` — `billing` +
`invoices` already are the audit trail for money.

## Phase 7 — Agents/automations: `pipeline_runs` + the Python rewrite
Explicitly later, per the chatbot-first priority. `trends`/`content_ideas`
are gone by this point (Phase 0) — agent implementation gets designed fresh
here, not ported from the old script-ideation approach. Migrate
`UserModule`'s execution-tracking fields into `pipeline_runs`, fix its
dangling `agentId` → `userservice_id` reference. Build the Python pipeline
rewrite (already planned independently, see the python-services repo's
`CLAUDE.md`) **against the new schema** — reading `userservices` instead
of `usermodules`, reporting back into the new `pipeline_runs` shape
— rather than rewriting it once now against the old schema and again later.

## Phase 8 — Stripe (no urgency)
Drops into fields already in the schema (`services.stripePriceId`,
`billing.stripeSubscriptionId`/`stripeInvoiceId`). No schema rework needed
when the LLC/business permit lands. The webhook handler should call the same
service method Phase 4's manual-renew flow calls (see Phase 4 above) —
don't build a second parallel implementation.

---

# Backlog — agreed with the user, NOT started (recorded 2026-11-12)

The user asked for these to be kept on record and to be **reminded** of them
if they don't come back to them. Raise them when the related phase starts
(or if asked "what's pending").

## A. File storage: move from Vercel Blob to S3-compatible storage + Cloudflare
**For now nothing changes** — demo videos (`services.demoVideoUrl`, e.g.
the chatbot template videos) and customer documents (`documents` module)
stay on Vercel Blob and display exactly as today.

Planned shape (user's description):
- One backend `FileUploadService` that owns the S3 client/connection; an
  upload API (user called it `/upload-document`, final route TBD) calls it.
- The service chooses the bucket / key prefix from what the file belongs to
  (chatbot assets, service brochures/videos, customer documents, contracts…).
- Cloudflare in front for delivery.
- Today's only call sites to swap: `DocumentsService.uploadDocument()`
  (`put()`) and `deleteDocument()` (`del()`) — put them behind the new
  service rather than calling an SDK from feature code. Existing Blob URLs in
  the DB need a one-time copy + URL rewrite (confirm the field list first —
  rules.md #13). `BLOB_READ_WRITE_TOKEN` can go once nothing uses Blob.
- **Open question for the user:** plain AWS S3 bills storage and especially
  egress (downloads). "No extra usage cost" matches **Cloudflare R2**
  (S3-compatible API, zero egress fees) or S3 behind Cloudflare's CDN cache.
  User said they'll paste their full explanation — decide then.

## B. Onboarding contract after the first payment
User's idea: as soon as the first payment is confirmed (Phase 4's
renew → billing → invoice → email flow), generate a contract ("<customer>
is using <services> via LogicMate", price, start date, terms), email it with
the invoice receipt; the customer signs and uploads it under Documents;
it's stored as the record of the agreement between both parties. Digital
signature explicitly skipped for now.

Suggestions given (user to decide):
- Generate the PDF from a template server-side in the same reusable method
  as invoice creation, and store it in `documents` (documentType `contract`,
  with a status: sent / signed / uploaded) so admin can see who hasn't signed.
- Consider click-to-accept in the dashboard (record who, when, IP, contract
  version) as an alternative to print-sign-upload — generally recognised for
  electronic transactions in the UAE (Federal Decree-Law 46/2021) and Kenya;
  confirm with a lawyer. Keep upload as a fallback.
- Automatic reminder if unsigned after N days; decide whether the service
  keeps running while unsigned.
- Reuse the `ProfileCompletionBanner` nudge (same decision as the ID-document
  upload nudge, see architecture.md `documents`).
- Depends on Phase 4 (`billing` + `invoices`) existing.

## C. Rollout order after the architecture is in place
Once `userservices` (+ billing/invoices) lands, implement every service in
the admin panel quickly, in this order:
1. **All chatbot templates**, one vertical at a time, until each can be
   onboarded end to end from the admin panel the way the restaurant chatbot
   can today (gym, real estate, salon & spa, clinic, hotel, e-commerce,
   education, auto dealership…).
2. **Agents.**
3. **Automations.**

**Lead sourcing runs in parallel, per service:** as each service becomes
onboardable, run lead sourcing for that vertical (the scheduled lead-sourcing
tasks, no longer limited to restaurants and gyms). Speed of implementation
is the stated priority.
