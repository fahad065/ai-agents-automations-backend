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
is stable. `cms` (merging `pages` + `blogposts`) has zero dependency on any
of this and could move earlier (even into Phase 0) if a quick isolated win
is wanted.

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
