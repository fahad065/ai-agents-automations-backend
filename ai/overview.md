# What this repo does

LogicMate's NestJS backend — the one API the frontend and the Python pipeline
service both talk to. MongoDB via Mongoose, JWT + Google OAuth, base path
`/api/v1`, deployed on Railway.

Full stack/module details, every feature shipped to date, and every past
decision are in this repo's root `CLAUDE.md` — read that for "how does feature
X work today." This `ai/` folder is specifically about the database
architecture redesign currently in progress — read `architecture.md` for "what
is it becoming."

## Why the redesign

The platform grew one module at a time (agents, then automations, then
industries, then chatbots), and each addition got its own parallel
ownership/billing model instead of extending a shared one. An audit (see
`architecture.md`'s "what this replaces" section) found: two fully dead
collections with zero real callers (`niches`, `subscriptions`), one collection
that's live in the UI but never actually reaches the pipeline cron
(`industry-subscriptions` — it can take a payment and never schedule anything),
a billing ledger whose `subscriptionId` field points at that dead collection,
and four collections carrying a foreign key to a `UserAgent` model that no
longer exists anywhere in the schema.

The fix is not "patch each of those individually" — it's one unified ownership
model (`userservices`) and one unified catalog (`services`) that every product
type (agent, automation, chatbot, and bundles of any of them) goes through the
same way, so the pipeline cron, the billing admin screen, and the dashboard
never need to special-case which type of thing they're looking at.

## Current priority

**Chatbots first, then agents/automations.** The new schema supports both from
day one, but the build order, verification, and cutover go chatbot-type rows
first end-to-end, then agent/automation rows — not both halfway in parallel.
See `implementation-guide.md`.

There are no real paying customers on the platform yet. This matters: the
migration can be direct (build new, migrate the small amount of existing data
once, cut over, delete old) rather than a cautious dual-write production
migration. Don't over-engineer the migration path for a customer base that
doesn't exist yet.
