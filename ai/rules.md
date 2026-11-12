# Rules for this migration

Read `architecture.md` first for the full schema. These are the constraints
that are easy to violate by accident — several were designed wrong once
during the original design conversation and corrected. Don't reintroduce any
of these.

## Non-negotiable

1. **`userservices.service_id` is always a single reference, never an
   array. `userservices.type` is never `"bundle"`.** A bundle purchase is N
   rows (one per real included service) sharing one `bundle_id`. If you ever
   see or write code where `service_id` becomes an array "for bundles," stop
   — that reintroduces the exact shape-changing-field problem this redesign
   exists to remove, and forces the pipeline cron / billing screen /
   dashboard to special-case bundles everywhere again.

2. **BYOK — never add a platform-wide fallback API key.**
   `ApiKeysService.getDecryptedKey(userId, provider)` is the only way any
   service should obtain a provider key. If it throws, degrade gracefully
   (skip the step, return a fallback message) — never fall back to
   `process.env` or any shared key, even for local testing convenience. This
   was tried once in the pre-redesign codebase and explicitly reverted — see
   the root `CLAUDE.md`'s "CRITICAL" section. It is the core business model,
   not an implementation detail.

3. **`services.include[]` is catalog-side only.** It describes what a bundle
   *is*, defined once by an admin. It is read exactly once, at the moment a
   customer subscribes, to fan out into N `userservices` rows. It is never
   duplicated onto `userservices`, and never read again after that fan-out
   for an existing purchase.

4. **`slug` has no `_ar` twin, anywhere.** Every other bilingual field is
   alternate *content* on the same URL — the frontend already renders this
   way everywhere (`isAr ? field_ar : field`, same page, same route). A
   translated slug would mean a different URL per language, which nothing in
   the actual routing supports and would need new logic to ever matter. Don't
   add `slug_ar` to anything.

5. **Never reuse the field name `config` for unrelated things.**
   `userservices.config: {}` means a customer's own runtime settings
   (persona, channels, schedule). It does not mean "a catalog item's display
   properties" — those (`icon`/`color`/`badge`/`sortOrder`) stay flat on
   `services`, never nested under a key also called `config`.

6. **`pricing.features[]` and `services.featureCards[]` are deliberately
   different names.** The first is plan bullet points (strings). The second
   is marketing feature cards (`{title, description, icon}`). They collided
   under one name (`features`) in the real pre-redesign schema — don't let
   that happen again in the new one.

7. **Denormalized "snapshot" fields on historical/financial records are
   deliberate, not redundant data to "clean up."** `billing.serviceName`/
   `serviceType`, `pipeline_runs.pipelineType` — these capture what was true
   *at the time*, so a later catalog rename doesn't silently rewrite
   history. Don't replace them with a live join/populate "for consistency."

8. **LogicMate's own AI-API cost tracking never belongs on `billing`.**
   `billing` is money the customer paid. `pipeline_runs.totalCost`/
   `costBreakdown` (or a denormalized counter on `userservices`) is what it
   cost LogicMate to deliver the service. Keep these separate — mixing them
   muddies what "billing" means.

9. **An append-only ledger doesn't rewrite its own history.** A refund is its
   own new `billing` row (`type: "refund"`), never a mutation of the
   original charge's `status`. `billing.status` only ever moves through
   `pending → paid` or `pending → failed`.

10. **`activity_logs` is populated by explicit calls to one shared
    `ActivityLogsService.record()` method — not a generic auto-diffing
    interceptor.** Sensitive-field redaction (`encryptedKey`, `password`,
    `embedding`) needs human judgment per call site; a framework-level diff
    can't know what's safe to log without being told, which defeats the
    point of "automatic." The caller picks exactly which fields go in
    `before`/`after`.

11. **Stripe fields exist in the schema (`services.stripePriceId`,
    `billing.stripeSubscriptionId`/`stripeInvoiceId`) but are not wired up.**
    The only live payment flow is manual bank transfer + admin confirm, until
    the LLC/business permit is in place. Don't build Stripe integration
    speculatively. Also: the real pre-redesign `Billing` collection has
    half-wired **Paddle** fields, not Stripe — don't assume any existing
    payment-gateway code is reusable.

12. **No real customers yet.** This migration can be direct — build new,
    migrate the small amount of existing data once, cut over, delete the old
    collection. Don't build a cautious dual-write/zero-downtime production
    migration for a customer base that doesn't exist. If this file is being
    read after real customers exist, that assumption needs to be
    re-examined before touching anything below.

13. **Confirm the field list with the user before any migration or seed
    writes data.** (User direction, 2026-11-12, after the first `services`
    release carried four old `modules` fields that aren't in this file's
    schema.) Before shipping anything that writes documents — a boot-time
    migration, a seed, a backfill — list exactly which fields it will write,
    and call out any field not in `architecture.md` with what reads it.
    Ship only after the user confirms. A field being "still used by old
    code" is a reason to ask, not a reason to keep it silently.

## Naming conventions

- snake_case for Mongo field names shown in `architecture.md` matches the
  convention agreed during design; confirm against whatever the actual
  Mongoose schemas end up using (NestJS/Mongoose idiomatically often uses
  camelCase — check the existing codebase's convention in each module before
  introducing a new one; don't mix conventions within one collection).
- Every collection gets a `status` enum instead of multiple independent
  booleans (e.g. `active|inactive|coming_soon` instead of separate
  `isActive`/`isComingSoon` flags) — this was a deliberate simplification to
  remove invalid/contradictory states, applied consistently across `users`,
  `services`, `cms`, `apikeys`, `userservices`, `billing`.
- Every collection gets `isDeleted` for soft-delete **except**
  `knowledge_bases` and `conversations` — deliberate, not an oversight (see
  `architecture.md`).

## Dead vs. paused — don't conflate these

- **Dead (delete, no replacement needed conceptually):** `niches`,
  `subscriptions`, `industries`, `industry-subscriptions`. Confirmed zero
  real use, or (for industry-subscriptions) fundamentally broken — it never
  reached the pipeline cron. **Also now `trends`** — confirmed by the user:
  the old YouTube-specific trend-discovery mechanism isn't being carried
  forward, agent implementation gets redesigned from scratch when that
  phase is reached. `content_ideas` should almost certainly join this list
  too (it references `trends` by id — deleting one without the other
  leaves a dangling reference) but that part is a recommendation flagged
  to the user, not yet an explicit confirmation — check `traces.md`.
- **Paused (keep, needed later, don't delete):** `pipeline_runs` only, as
  of this writing. It has no chatbot use today but is generic run-tracking
  (status/steps/cost/output), not tied to the specific old script-ideation
  approach the way `trends`/`content_ideas` were — whatever "more feasible
  solution" the user builds for agents later will likely still need
  something shaped like this. Deleting it now would just mean rebuilding
  the same thing later for no reason.
- **Replaced (delete only after migration + verification):** `modules` →
  `services`, `usermodules` → `userservices`, `chatbots` (ownership fields)
  → `userservices`, old `Billing` → new `billing`.

## Priority order

Chatbot-type `userservices` rows, `knowledge_bases`, `conversations` — build,
migrate, verify, ship these completely before investing further build time
in agent/automation-specific execution work (`pipeline_runs` usage, the
Python pipeline rewrite). See `implementation-guide.md` for the full phase
order.
