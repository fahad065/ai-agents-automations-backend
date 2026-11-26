# LogicMate — Backend

## Platform overview
LogicMate is a B2B AI automation marketplace (UAE, Kenya and international). Businesses subscribe to ready-made **chatbots**, **AI agents** and **automations**. This NestJS API powers the Next.js frontend (Vercel) and calls the Python pipeline service for agent/automation runs.

Where to read more:
- `ai/architecture.md` — authoritative collection/field reference
- `ai/rules.md` — working rules (e.g. #13: confirm field lists before any data-writing migration)
- `ai/traces.md` — dated log of every change and why
- `ai/feature-history.md` — older long-form feature write-ups (historical field names)
- `docs/test-cases/*.md` + `test/e2e/` — per-service test cases and the end-to-end harness

## CRITICAL: bring-your-own-key (BYOK) — never add a platform-wide fallback key
This is the core business model, not an implementation detail. Every customer adds their own API keys (OpenAI, Anthropic, Gemini, Atlas Seedance, YouTube OAuth, …) under **Dashboard → API Keys** before any service can make AI calls for them. LogicMate holds no shared AI keys and pays for none of a customer's AI usage.

**Concretely:** `ApiKeysService.getDecryptedKey(userId, provider)` is the only way to obtain a provider key, always for the **owner** of the bot/service (never the caller — an admin acting for a client still bills the client's key). If there's no key, degrade gracefully (fallback message, skip the step) — never fall back to `process.env` or any shared key, not even for local testing. A `process.env.OPENAI_API_KEY` fallback was tried once and explicitly rejected by the platform owner. If a task seems to need a shared key ("demo mode", testing), stop and ask.

## Repos
- Frontend (Next.js): https://github.com/fahad065/ai-agents-automations-frontend.git
- Backend (this repo): https://github.com/fahad065/ai-agents-automations-backend.git
- Python pipelines: https://github.com/fahad065/logicmate-python-services.git

Branches: backend works on `fahad-development` and is pushed to both `fahad-development` and `main`; Railway deploys `main`.

## Stack
NestJS · MongoDB Atlas (Mongoose) · JWT access + refresh tokens + Google OAuth (Passport) · Resend (email) · Sentry (`@sentry/nestjs`) · pdfkit (invoices) · Railway (`Procfile: web: node dist/main.js`, `railway.json` health check on `/health`). API prefix `/api/v1`, port 4000 in dev.

## Running locally
```bash
npm install
npm run start:dev   # watch mode on port 4000
npm run build       # compile to dist/
npm test            # unit tests (jest, *.spec.ts under src/)
```
End-to-end: see `test/e2e/README.md` (local Docker Mongo + faked outbound network; **never point it at Atlas**).

## Environment variables
Read by the code (see `.env.example`): `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `ENCRYPTION_KEY` (exactly 32 chars, encrypts API keys), `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`, `FRONTEND_URL`, `BACKEND_URL` / `PUBLIC_API_URL` (this API's public origin, used in embed code + webhook URLs), `PYTHON_SERVICE_URL`, `PIPELINE_SECRET` (shared with the Python service, sent as `x-pipeline-secret`), `CRON_SECRET`, `RESEND_API_KEY`, `SMTP_FROM`, `REPLY_TO_EMAIL`, `ADMIN_NOTIFY_EMAIL` (defaults to hello@logicmate.io), `SENTRY_DSN`, `ATLAS_API_KEY`, and file storage on Cloudflare R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_URL` (`R2_ENDPOINT` only for the e2e fake). Setup guide: `docs/cloudflare-r2-setup.md` — dev buckets for local/staging, prod buckets for production.

**`PIPELINE_SECRET` and `CRON_SECRET` must be set in production** — the code has hard-coded fallbacks for both, which are public in this repo.

**Never commit `.env`** (`.env.save` and `.env.prod` are gitignored too).

## Production
- MongoDB Atlas database `ai-agents-automations-prod`.
- Admin login: not stored in the repo — ask the platform owner.

## What runs on startup
Only one thing: `ServicesService.onModuleInit()` seeds the service catalog (`seed-services.ts`) **if the `services` collection is empty** (a fresh local/test database). A populated database is never touched — the catalog is edited by hand in the admin Service Catalog, and a deleted service never comes back. All one-time migrations (users/services regrouping, api-key status, chatbots → userservices, About-page backfill) ran in production and were removed on 2026-11-18. Don't add new boot-time data writes; if data needs changing, agree the field list with the owner first (`ai/rules.md` #13).

## Modules (`src/modules/`)
| Module | Purpose |
|---|---|
| `auth` | Register/login/refresh/logout, Google OAuth (with `redirect` round-trip via OAuth `state`), email verification, forgot/reset password, YouTube + Instagram account connect |
| `users` | Profile, change password, deactivate; admin user management (grant free, extend trial) |
| `admin` | Platform overview, revenue, user list, per-tenant usage, admin email sender |
| `services` | The catalog of everything for sale (chatbots, agents, automations) |
| `userservices` | Every customer subscription — one collection, three Mongoose models (see below); agent/automation routes + crons |
| `chatbots` | Chatbot CRUD, knowledge base, conversations, analytics, model list, embed code, chatbot billing + trial cron |
| `chat` | The public chatbot engine + WhatsApp/Instagram webhooks (no auth) |
| `billing` | Payment ledger, invoices (numbered PDFs) |
| `api-keys` | Encrypted customer API keys + the provider adapter (`ai-provider.util.ts`) |
| `pipeline-runs` | Agent/automation run records (Python reports progress here) |
| `cms` | Pages + blog posts, bilingual (`cms` collection) |
| `notifications` | In-dashboard notifications |
| `activity-logs` | Append-only audit trail |
| `account-deletion` | Data export, 7-day deletion request/cancel + cron |
| `documents` | A user's private files (ID, licence…): uploaded via `POST /uploads` purpose `user-document` to the private R2 bucket, opened through 5-min signed links. |
| `storage` | Cloudflare R2 client (`StorageService`, global): signed upload/download URLs, stat, list, delete, server-side `putObject`/`getObject` |
| `uploads` | **The one upload endpoint** `POST /uploads` — every upload names a *purpose* (`chatbot-knowledge`, `service-media`, `service-brochure`, `user-document`); the purpose decides bucket, folder, types, size and who may upload. New upload features add a purpose in `uploads.service.ts` |
| `feedback` | Testimonials/feedback |
| `email` | All email templates (Resend) |

## Collections
`users`, `services`, `userservices`, `knowledgebases`, `conversations`, `billings`, `invoicecounters`, `apikeys`, `pipelineruns`, `notifications`, `activitylogs`, `cms`, `documents`, `feedbacks`. Field lists: `ai/architecture.md`.

- **users** — name/email/password/role/status at the top; the rest grouped into `profile`, `auth` (e.g. `auth.isEmailVerified`), `plan`, `welcomeEmails`, `deletion`. Always return users through `sanitizeUser()` / `USER_PUBLIC_PROJECTION`.
- **services** — grouped into `content`, `seo`, `display`, `pipeline`, `pricing` (`pricing.tiers` = chatbot Basic/Pro). `status` (active/coming_soon/inactive) drives the "Live"/"Coming Soon" pill. Create/update use Mongoose `strict: 'throw'` → an unknown field is a 400, never silently dropped. The frontend reads services through `src/lib/service-view.ts`.
- **userservices** — shared top-level fields: `userId`, `type` (chatbot|agent|automation), `serviceId`, `name`, `status` (trial|active|past_due|suspended|cancelled), `isFreeForever`, `isDeleted`, `trialEndDate`, `nextRenewalDate`, `cancelledAt`, `plan {tier, monthlyFee, setupFee, currency}`, `adminNotes`, `trialReminderSentAt`, and a type-specific `config`:
  - `ChatbotUserService` (`CHATBOT_FILTER`): `config.botStatus` (draft/active/inactive — is the bot live), description, persona, language, fallbackMessage(_ar), humanHandoff, bookingUrl, `embedKey` (unique), `channels.{website,whatsapp,instagram}`, `outlets[]` (branches: address, hours, facilities, area tags, delivery apps, `insurance[]`), `chatModelConfig {provider, model}`.
  - `PipelineUserService` (`PIPELINE_FILTER`): pipelineType, niche, schedule, paused, customPrompt, videoModel, lastRunAt/totalRuns/totalCost.
  - `UserService`: untyped `config` — used for the admin subscription actions that work on any type.
- **knowledgebases / conversations / billings** link to a chatbot via `userserviceId`.
- **billings** — ledger rows; chatbot payments carry `kind` (setup|monthly|upgrade), `transactionRef`, and once confirmed `invoiceNumber` (`LM-<year>-0001`), `invoiceIssuedAt`, `invoiceLine`, `periodStart/End`, `invoiceKey` (the issued PDF saved in the private bucket).

## API routes (all under `/api/v1`, JWT unless noted)
```
auth            POST register | login | refresh | logout | forgot-password | reset-password | resend-verification
                GET  me | verify-email/:token | google | google/callback (public)
                GET/DELETE youtube/* , instagram/* (account connect)
users           GET/PATCH profile · PATCH change-password · DELETE deactivate · admin: GET / , GET/PATCH/DELETE :id, PATCH :id/grant-free | :id/extend-trial | :id/pause-modules
admin           GET overview | revenue | users | usage · POST email/send            (inline role check)
services        GET / (public catalog) · GET :idOrSlug · admin: GET admin/all, POST, PATCH :idOrSlug, DELETE :idOrSlug
userservices    POST subscribe · GET my | billing-summary | / (admin: everyone) | atlas-models | :id | :id/run-status
                PATCH :id | :id/toggle | :id/schedule | :id/prompt · DELETE :id · POST :id/run
                admin: PATCH :id/extend-trial | :id/free-forever | :id/cancel  (work on ANY type, chatbots included)
                PATCH :id/record-run (Python, x-pipeline-secret) · POST cron/trigger (CRON_SECRET)
chatbots        POST / · GET / · GET admin/all (admin; needs-setup flags + usage) · GET/PUT/DELETE :id
                POST/GET :id/knowledge · PUT/DELETE :id/knowledge/:kId
                GET :id/conversations | :id/analytics (Pro+) | :id/models?provider= | :id/embed-code | :id/billing
                PUT :id/pricing (admin) · POST :id/notify-payment (owner) · POST :id/confirm-payment (admin)
chat (public)   POST chat/:embedKey (per-bot throttle) · GET chat/:embedKey/config
                GET/POST webhooks/whatsapp/:embedKey · GET/POST webhooks/instagram/:embedKey
billing         GET / | summary | api-costs | profit-loss · POST / · GET :id/invoice (PDF; owner or admin)
api-keys        POST / (admin may pass userId) · GET / (admin may pass ?userId) · PATCH/DELETE :id · POST :provider/test
pipeline-runs   GET active | recent | stats | / | my | :runId · PATCH :runId/status | :runId/log · POST :runId/notify-complete | notify-failed · DELETE :runId
cms             GET content | content/:type/:slug (public) · admin: GET admin | admin/:id, POST admin, PUT/DELETE admin/:id, POST admin/seed
notifications   GET / | unread-count · PATCH :id/read | read-all · DELETE :id | clear-all
activity-logs   GET my | admin
account         GET export | deletion/status · POST deletion/request | deletion/cancel
uploads         POST / {purpose, contentType, size, name, …details} → signed PUT URL + key · DELETE /?purpose&key (unsaved upload) · GET file?purpose&key (5-min link to a private file)
                GET chatbots/:id/knowledge/media-usage (photo/PDF counts + plan limits)
documents       POST / {documentType, key, name, userId?(admin)} after an upload · GET / · GET :id/file (5-min link) · DELETE :id
feedback        GET public · POST / · GET / · PATCH :id/approve · DELETE :id
```

## Guards & conventions
- **Every file lives in Cloudflare R2, uploaded from the browser (owner rule, 2026-11-23).** Brochures, demo videos, user documents, invoices, quotations and any future file go through `POST /uploads` with a purpose (add one in `uploads.service.ts` for a new kind of file); server-made files (invoices) use `StorageService.putObject()`. Never Vercel Blob, never a pasted file URL. Admin/customer upload fields are **upload-only**: first time an Upload button; afterwards a preview (`ui/media-preview.tsx`) with Replace (saves at once, old file deleted from R2) and Remove (confirm, clears the field, deletes the file).
- `JwtAuthGuard` everywhere; `@Public()` opts out. Admin checks are inline (`req.user.role === 'admin'` / `assertAdmin()`) in most controllers — follow whichever pattern the controller already uses.
- `PipelineSecretGuard` checks the `x-pipeline-secret` header against `PIPELINE_SECRET`.
- Customer-editable chatbot fields go through the `CUSTOMER_EDITABLE_FIELDS` whitelist in `chatbots.service.ts` (`plan`/billing and `embedKey` are never customer-writable). Add a new editable field there explicitly.
- Bilingual: Arabic in `_ar` fields (UAE Gulf dialect); the API always returns both languages.
- Crons claim work atomically (`findOneAndUpdate` with the dedupe condition in the filter) before acting, so a second replica never double-sends.
- Swallowed errors in the chat engine and pipeline paths are reported to Sentry with tenant tags.

## Chatbots
- **Every chatbot is a subscription to a catalog service** (no blank bots). `POST /chatbots` takes `moduleSlug` (marketing page / Browse Services) or `template` (admin "build for a client", optional `userId`). Each new bot starts a 30-day trial; `tier` basic|pro sets `plan` from `pricing.tiers`. A setup-guide email (PDF attached) and a trial email go to the owner.
- **Tiers:** Basic = website widget, knowledge base, lead capture, hand-off, history. Pro adds WhatsApp, Instagram, analytics — enforced server-side (`update()` rejects enabling WhatsApp/Instagram on Basic, `getAnalytics()` rejects Basic). Custom = contact us.
- **Engine (`chat.service.ts`):** find bot by `config.embedKey`, require `botStatus === 'active'` and `isChatbotBillingActive()` (trial not lapsed / active / free forever). Rank every knowledge entry (embeddings/cosine where vectors exist, else keywords) and send as many as fit a size budget (`fitKnowledge`: ~10k chars, max 30 entries — a small knowledge base is read in full), build a prompt that only allows answers from the knowledge base + all branches, call the bot's provider with the owner's key. When nothing covers the question the model returns `[[NO_ANSWER]]`; the server sends the fallback (and on hand-off the contact request) in the customer's language — owner's EN/AR text, else translated with the owner's key. Knowledge entries can carry up to 5 photos + 1 PDF (`attachments`, uploaded via `POST /uploads` purpose `chatbot-knowledge`; photos (JPG, PNG, WebP, AVIF, GIF, BMP — HEIC/TIFF are converted to JPG in the browser first) ≤10 MB, PDFs ≤100 MB; per bot Basic 100 photos/20 PDFs, Pro 500/100): the AI copies the entry's `[[MEDIA:<id>]]` tag, the server strips it and returns `media` with the reply, the website widget shows a photo strip + brochure link (other channels get the text); files are deleted when removed from an entry, the entry or the bot is deleted. Lead capture (name/phone/email → owner email + notification, every tier), human hand-off (opt-in `humanHandoff`, on fallback or "talk to a person"; if no phone/email is known yet the reply asks for name + phone/email once per conversation — and the hand-off email says no details were shared yet), booking link.
- **AI provider:** one per bot (`config.chatModelConfig.provider` = openai|anthropic|gemini, `model` = `auto` or an id from `GET :id/models`, listed live with the owner's key). Embeddings use the same provider's default embedding model (`embeddingProviderFor()`); Claude has no embeddings API, so a Claude bot ranks by keywords. Switching provider re-embeds the knowledge base in the background.
- **Channels:** website widget (`chatbot-widget.js`, served by the frontend; CORS-open `/chat`). WhatsApp/Instagram need the client's Meta app: phone number id / account id, access token, **App Secret** (every webhook POST must carry a valid `X-Hub-Signature-256`) and the per-bot Verify Token shown in the Channels tab.
- **Embed code** uses `PUBLIC_API_URL` or `BACKEND_URL` (+`/api/v1`); if the widget can't reach the API in prod, check `BACKEND_URL`/`FRONTEND_URL` on Railway first.

## Billing & invoices (manual bank transfer, no card payments yet)
1. Admin sets/edits prices (`PUT /chatbots/:id/pricing`); Basic→Pro can be requested by the customer.
2. The customer transfers money and submits the reference (`POST :id/notify-payment` → PENDING `billings` row with `kind` + `transactionRef`, admin alert email).
3. The admin clicks Confirm (`POST :id/confirm-payment`): the subscription becomes active (+30 days renewal, Pro for upgrades), the matching PENDING row is marked PAID — or a PAID row is created if the customer never submitted one — and an invoice is issued: next `LM-<year>-NNNN` number (atomic counter in `invoicecounters`), PDF rendered with pdfkit (`billing/invoice-pdf.ts`), emailed to the owner as an attachment, saved to the private R2 bucket as `invoices/<year>/<number>.pdf` (`invoiceKey`), and downloadable from the Billing tab (`GET /billing/:id/invoice` serves the saved copy; older invoices, or a server without R2, are rendered from the row).
- Issuer details (name, address, TRN, VAT rate) live in `billing/invoice-issuer.ts` — currently "LogicMate, Dubai", no VAT. Update it when the LLC / VAT registration is in place.
- `chatbot-billing.cron.ts` (10:00 UTC daily) emails the 5-days-left warning and moves a lapsed trial to `past_due`; the chat engine's real-time gate doesn't wait for the cron.

## Agents & automations
`userservices` rows of type agent/automation (`pipeline-services.*`). Subscribe is catalog-driven (refuses chatbots, duplicates, coming-soon). `POST :id/run` calls `PYTHON_SERVICE_URL/pipeline/run`; the Python service reports progress to `pipeline-runs` and costs to `PATCH /userservices/:id/record-run`. Pause = `config.paused`; an unpaid trial becomes `past_due`. Crons in `pipeline-services.cron.ts`: every minute (scheduled runs), 09:00 UTC (trial reminders/expiry), 10:00 UTC (welcome emails). Agents/automations have no payment flow yet.

## Cron jobs
| Cron | When (UTC) | What |
|---|---|---|
| `pipeline-services.cron.ts` | every minute | run due scheduled agents/automations |
| `pipeline-services.cron.ts` | 09:00 | agent/automation trial reminders + expiry |
| `pipeline-services.cron.ts` | 10:00 | welcome email sequence (day 1/3/7) |
| `chatbot-billing.cron.ts` | 10:00 | chatbot trial 5-day warning + expiry |
| `account-deletion.cron.ts` | 03:00 | day-7 reminder, day-8 deletion |
| `uploads/storage-cleanup.service.ts` | 04:00 | delete stray uploads (>24h old, not on any saved knowledge entry / service / document) from `chatbots/`, `services/`, `users/`; never invoices; skips a folder if >25% would go (bug guard) |

## Testing
- Unit: `npm test`.
- End-to-end (`test/e2e/run.sh restaurant|gym|clinic|agent`): real backend + frontend + local Mongo, outbound OpenAI/Anthropic/Gemini/Resend/Meta calls faked by `fake-net.cjs`. Each new service gets `docs/test-cases/<service>.md` + `test/e2e/<service>-e2e.cjs`.

## What is next to build
1. Real Estate chatbot — standard chatbot feature set; pricing confirmed 2026-11-19: Basic $129/mo ($99 annual), Pro $199/mo ($159 annual); owner pastes the catalog content by hand. Owner decision: lead qualification (buy/rent, budget, area, bedrooms, timeline, cash/mortgage), hot/warm/cold scoring, routing leads to the right agent per office/area, CSV export and a daily lead summary go into a future **Real Estate AI agent**, not the chatbot. (Clinic done: content, brochure, pricing, demo site `fahad065/logicmate-clinic-website`, test cases + e2e 121/121; owner records the demo), Spa & Salon done 2026-11-24 ($99/$149, demo site `fahad065/logicmate-salon-and-spa-website`). Hotel: pricing confirmed 2026-11-24 — Basic $129/mo ($99 annual), Pro $199/mo ($159 annual); CMS content + brochure delivered (`docs/brochures/hotel-chatbot.html`); Custom-only hotel extras: live availability/rates from the PMS or booking engine, booking + payment in the chat, pre-arrival/in-stay messaging, housekeeping/room-service requests into hotel systems, several properties on one account. Auto Dealership: pricing confirmed 2026-11-25 — Basic $129/mo ($99 annual), Pro $199/mo ($159 annual); CMS content, knowledge base for the demo dealership (Meridian Motors) and brochure delivered (`docs/brochures/auto-dealership-chatbot.html`); Custom-only dealership extras: live inventory sync from the DMS/website feed, finance calculator + pre-approval, instant trade-in valuation, CRM integration, test-drive/service booking into calendars, several showrooms or brands on one account. Demo site `fahad065/logicmate-aut-dealership-website` (2026-11-26) uses the same data as the knowledge base.
2. WhatsApp/Instagram go-live per client (code done; needs each client's Meta app).
3. Agents/automations payment flow (they have no billing yet). **Before starting any agent/automation work, remind the owner (deferred on 2026-11-19 to focus on chatbots):** (a) set `PIPELINE_SECRET` to the same random value (`openssl rand -hex 32`) on Railway backend and the Python service — until then the public fallback in `pipeline-secret.guard.ts` is in effect; (b) set `CRON_SECRET` on Railway (fallback in `pipeline-services.controller.ts`); (c) the backend never sends `Authorization: Bearer NESTJS_SERVICE_TOKEN` to Python `/pipeline/run`, so Python's auth check is either skipped (token unset) or would reject the backend — wire it up on both sides.
4. Card payments (Stripe/Paddle) once the LLC exists; VAT on invoices once registered.
5. Shared storage for Python pipeline output (S3/R2) before agents get real users or a second instance.
6. Real booking-platform integration and AI voice calling — only on real client demand.
