# End-to-end tests (real backend + real frontend + real MongoDB)

What each suite checks, with inputs and expected outputs, is written up in
[`docs/test-cases/`](../../docs/test-cases/) — one file per service. This
folder is the machinery that runs them.

## What is real and what is faked

| Real | Faked (by `fake-net.cjs`, test-only) |
|---|---|
| NestJS backend from `dist/`, `NODE_ENV=production` (same CORS/security as Railway) | OpenAI / Anthropic calls — a tiny stand-in "model" that answers from the knowledge snippets in the prompt |
| Next.js production build of the frontend, driven by Playwright | Resend (emails are recorded, not sent) |
| MongoDB 7 (Docker, throwaway `lm_e2e` database) | Meta Graph API (WhatsApp/Instagram sends are recorded) |
| Encryption, BYOK key lookup, knowledge search, lead capture, hand-off, billing gates, webhook signatures | |

The stand-in model proves the plumbing (right prompt, right key, right
reply routed to the right place). It says nothing about the quality of a
real model's answers — check that by hand on a real bot.

Every faked call is appended to `calls.jsonl`, which the suites assert on
(e.g. "the WhatsApp reply was sent with the bot's own token").

## Run it

```bash
# backend repo
npm run build
# frontend repo (separate terminal)
npm run build && npx next start -p 3410
# backend repo
bash test/e2e/run.sh restaurant   # or: bash test/e2e/run.sh gym
```

`run.sh` starts MongoDB in Docker if needed, wipes `lm_e2e`, starts the
backend with `e2e.env` (dummy secrets only — never put real ones here) and
runs the suite. Screenshots land in `test/e2e/shots/`.

**Never point this at Atlas.** It creates users, chatbots and payments and
drops its database at the start of every run.

## Migration check (one-off)

`seed-old-shape.js` inserts users/services in the pre-2026-11-16 flat shape;
start the backend once, then run `check-migration.js` with `mongosh` to
confirm the grouping migrations.

## Adding a service

Copy `restaurant-e2e.cjs` to `<service>-e2e.cjs`, change the knowledge base
and questions, and add `docs/test-cases/<service>.md` with the same table
layout as the restaurant one.
