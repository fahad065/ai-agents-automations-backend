# Traces — running log

Newest entry first. This is "what's actually true right now" — if you're a
fresh Claude Code session picking this up in a different environment than
where it was last worked on, read the top entry before doing anything, then
skim down only as far as you need context.

Append a new entry per session/major milestone. Don't rewrite or delete
old entries — if something here turns out to be wrong, add a new entry
correcting it, don't silently edit history.

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
