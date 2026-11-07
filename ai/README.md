# `ai/` folder — start here

This folder exists so that any Claude Code session — whichever machine or app you're
running it from (browser, desktop app, another cloud session) — can pick up this
architecture migration exactly where it was left, without replaying the whole
conversation that produced it. If you are an AI agent reading this cold: read the
files below in this order, then check `traces.md`'s most recent entry for "what's
actually true right now" before doing anything else.

| File | Purpose |
|---|---|
| `overview.md` | What this repo is, in one page. Points to `CLAUDE.md` for the exhaustive feature-by-feature history. |
| `architecture.md` | **The finalized new database schema** — 13 collections, every field, and the reasoning behind each one. This is the source of truth for the migration. The other two repos' `ai/architecture.md` files point back here instead of duplicating it. |
| `rules.md` | Hard constraints for this migration. Read before writing or changing any schema/service code touched by this effort. A few of these exist because the same mistake was made and caught twice during design — they are not theoretical. |
| `implementation-guide.md` | The phase-by-phase build order, what depends on what, and which collection to start with. |
| `traces.md` | A running, dated log of what's been done and decided. Newest entry first. Append to it, don't rewrite history. |

This repo's own `CLAUDE.md` (root of the repo) still documents every feature that's
already shipped, in depth — this folder is additive, specifically for the
database/architecture redesign described in `architecture.md`, not a replacement
for it.

**Branch**: this work happens on `fahad-development`, not `main`. Do not push to
`main` unless explicitly told to.
