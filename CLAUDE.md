# LogicMate — Backend

## Platform overview
LogicMate is a B2B AI automation marketplace targeting UAE and Kenya markets. This NestJS API powers the frontend (Next.js on Vercel) and communicates with the Python pipeline service for AI job execution.

## CRITICAL: bring-your-own-key (BYOK) — never add a platform-wide fallback key
This is the core business model, not an implementation detail. Every customer must add their own API keys (OpenAI, Atlas Seedance, YouTube OAuth, etc.) via **Dashboard → API Keys** before any module — agents, automations, or chatbots — can run AI calls on their behalf. LogicMate itself holds no shared/platform API keys and pays for none of the customer's AI usage; that's the point of the product.

**Concretely:** `ApiKeysService.getDecryptedKey(userId, provider)` is the only way any service should obtain a provider key. If it throws (no key on file), the correct behavior is to degrade gracefully — return the chatbot's `fallbackMessage`, skip the pipeline step, whatever fits — never to fall back to a key from `process.env` or any other shared source, even for local testing convenience.

This was tried once during chatbot development: a `process.env.OPENAI_API_KEY` fallback was added to `chat.service.ts` / `chatbots.service.ts` (`resolveOpenAiKey()`) purely to unblock local testing, and was explicitly rejected and reverted by the platform owner — BYOK is the product, not a rough edge to smooth over. If a future task seems to call for a shared/platform key again (testing convenience, a "demo mode", etc.), that is a signal to stop and ask rather than add one.

## GitHub repos (all three services)
- **Frontend (Next.js):** https://github.com/fahad065/ai-agents-automations-frontend.git
- **This repo (backend):** https://github.com/fahad065/ai-agents-automations-backend.git
- **Python pipelines:** https://github.com/fahad065/logicmate-python-services.git

## Stack
- **Framework:** NestJS
- **Database:** MongoDB Atlas via Mongoose
- **Auth:** JWT (access + refresh tokens) + Google OAuth (Passport)
- **Deployment:** Railway — `Procfile: web: node dist/main.js`
- **Base API prefix:** `/api/v1`
- **Port:** 4000 (dev)

## Running locally
```bash
npm install
npm run start:dev   # watch mode on port 4000
npm run build       # compile to /dist
npm run start:prod  # run compiled output
```

## Environment variables (copy .env.example to .env)
```
PORT=4000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<64-char random string>
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<64-char random string>
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=<exactly 32 chars>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:4000/api/v1/auth/google/callback
FRONTEND_URL=http://localhost:3000
PYTHON_SERVICE_URL=http://localhost:8001
```

**NEVER commit .env — it is in .gitignore. .env.save and .env.prod are also gitignored.**

## Production DB
- MongoDB Atlas: `ai-agents-automations-prod` database
- Admin user: `fahad@test.com` / `Admin@123`

## Module structure
All modules live in `src/modules/`:

| Module | Purpose |
|---|---|
| `auth` | JWT + Google OAuth, login, register, refresh, guards |
| `users` | User schema, profile update, user management |
| `admin` | Admin-only endpoints, promote users |
| `modules` | The AI module catalog (what's for sale) |
| `usermodules` | User's subscribed/active modules, trial management |
| `cms` | CMS pages + blog posts, bilingual content |
| `niches` | Industry niche catalog (12 niches) |
| `industries` | Industry data (same concept as niches, used in marketing) |
| `subscriptions` | Subscription records |
| `billing` | Billing/payment records |
| `pipeline-runs` | Pipeline execution logs |
| `api-keys` | Encrypted API key storage |
| `notifications` | User notification system |
| `industry-subscriptions` | Users subscribing to industries |
| `content-ideas` | AI-generated content idea records |
| `trends` | Trend data records |
| `email` | Email sending service (Nodemailer) |
| `feedback` | User feedback collection |

## Key schemas

### User (`users/schemas/user.schema.ts`)
```
_id, email, password (hashed), name, role ("user" | "admin"),
googleId, avatar, isEmailVerified, country ("UAE" | "Kenya"),
youtubeChannelId, instagramAccountId, instagramAccessToken,
createdAt, updatedAt
```

### Module / CMS template (`modules/schemas/module.schema.ts`)
```
_id, name, name_ar, slug, type ("agent" | "automation" | "chatbot"),
pipelineCategory ("standalone" | "niche_pipeline"),
nicheSlug, tagline, tagline_ar, description, description_ar,
capabilities[], capabilities_ar[], availableIn["UAE","Kenya"],
price, trialDays, isActive, createdAt
```
**nicheSlug values (12):** `content_social`, `real_estate`, `healthcare`, `hr_recruitment`, `ecommerce_retail`, `marketing`, `hospitality`, `education`, `logistics`, `agriculture`, `finance`, `internal_copilot`

### UserModule (`modules/schemas/user-module.schema.ts`)
```
_id, userId, moduleId, status ("trial" | "active" | "expired" | "cancelled"),
trialStartDate, trialEndDate, activatedAt, expiresAt,
youtubeChannelId, instagramAccountId, instagramAccessToken,
pipelineConfig{}, lastRunAt, runCount, createdAt
```

### CMS Page (`cms/schemas/page.schema.ts`)
```
slug (unique), title, title_ar, subtitle, subtitle_ar,
content (HTML), content_ar (HTML),
faqItems[{question,answer,order}], faqItems_ar[{question,answer,order}],
contactInfo{email,phone,address,address_ar,hours,social{}},
updatedAt
```

### BlogPost (`cms/schemas/blog-post.schema.ts`)
```
slug (unique), title, title_ar, excerpt, excerpt_ar,
content (HTML), content_ar (HTML), author, category,
tags[], coverImage, published, createdAt, updatedAt
```

## CMS API routes
```
GET  /api/v1/cms/pages/:slug           — public, returns full doc with _ar fields
PUT  /api/v1/cms/admin/pages/:slug     — admin only, upserts all fields
GET  /api/v1/cms/blog                  — public list (published only)
GET  /api/v1/cms/blog/:slug            — public single post
POST /api/v1/cms/admin/blog            — admin create post
GET  /api/v1/cms/admin/blog            — admin list (all posts)
GET  /api/v1/cms/admin/blog/:id        — admin get post by ID (for edit modal)
PUT  /api/v1/cms/admin/blog/:id        — admin update post
DELETE /api/v1/cms/admin/blog/:id      — admin delete post
```

## Auth routes
```
POST /api/v1/auth/register
POST /api/v1/auth/login          → { accessToken, refreshToken, user }
POST /api/v1/auth/refresh
GET  /api/v1/auth/google         → redirect to Google
GET  /api/v1/auth/google/callback → redirect to frontend /auth/callback?token=...
```

## Guards
- `JwtAuthGuard` — default on all routes, use `@Public()` decorator to bypass
- `AdminGuard` — checks `user.role === "admin"`, add after JwtAuthGuard
- `PipelineSecretGuard` — verifies `NESTJS_SERVICE_TOKEN` header from Python service
- Several controllers (admin.controller.ts, chatbots.controller.ts) instead do an inline `if (req.user.role !== 'admin') throw new ForbiddenException()` per-route rather than a route-level guard — same effect, just check which pattern a given controller uses before adding a new admin route to it.

## Admin routes (`admin.controller.ts` / `admin.service.ts`)
```
GET  /api/v1/admin/overview        — platform stats (users, agents, videos, pipeline runs, cost)
GET  /api/v1/admin/revenue         — cost-by-module + top users by spend
GET  /api/v1/admin/users           — {_id, name, email} for every user — used to populate the Email Sender "To" dropdown
POST /api/v1/admin/email/send      — {to: string[], subject, html} → sends via EmailService.sendEmail() to each recipient, returns {sent, failed, total}
```
All four check `req.user.role === 'admin'` inline. `admin/email/send` backs the frontend's Settings → Email Sender tab (multi-select recipients, rich text editor) — see the frontend CLAUDE.md.

## Modules API routes
```
GET  /api/v1/modules              — public catalog (filter with ?moduleType=agent|automation|chatbot)
GET  /api/v1/modules/:slug        — public single module
POST /api/v1/admin/cms-modules    — admin create
PUT  /api/v1/admin/cms-modules/:id — admin update
```

**`moduleType: 'chatbot'`** — added so the 6 chatbot marketing/detail pages (`/chatbots/[slug]`) can reuse the exact same catalog + admin CMS editor (`/dashboard/cms-modules`) as agents/automations, rather than a parallel content model. `SEED_MODULES` in `modules.service.ts` seeds 6 chatbot template docs on boot (`restaurant-chatbot`, `real-estate-chatbot`, `clinic-chatbot`, `ecommerce-chatbot`, `gym-chatbot`, `education-chatbot`) with real heroStats/features/faq content **and** real per-vertical `pricing` (monthly/annual/features/hasCustomPlan) — same upsert-by-slug seeding as everything else in that array, so admin edits afterward are never overwritten. Pricing is admin-editable from this same form's Pricing tab, exactly like an agent or automation module — see "Chatbot self-serve pricing" below for why this replaced an earlier separate pricing system.

## UserModules (subscriptions)
```
POST /api/v1/usermodules/activate   — start trial or activate module
GET  /api/v1/usermodules/my         — user's active modules
PUT  /api/v1/usermodules/:id/config — save pipeline config (YouTube channel, etc.)
```

## Pipeline runs
```
POST /api/v1/pipeline-runs/trigger  — NestJS calls Python service, creates run record
GET  /api/v1/pipeline-runs/my       — user's run history
```
Python service is called at `PYTHON_SERVICE_URL/pipeline/run` with bearer `NESTJS_SERVICE_TOKEN`.

## Bilingual architecture
All Arabic content stored in `_ar` suffix fields. The backend returns the full document — the frontend decides which field to display based on `localStorage("lm_lang")`. Backend never filters by language — always return both.

## Cron jobs
- `usermodules/usermodules.cron.ts` — daily check, expires trials past `trialEndDate`
- `usermodules/trial-expiry.cron.ts` — related expiry handling
- `chatbots/chatbot-billing.cron.ts` — daily (10 AM UTC, staggered from the 9 AM usermodules cron), warns at 5 days left then flips `billing.status` once a chatbot trial actually expires — see Chatbot pricing & billing below

## Chatbot module (implemented)

Two NestJS modules power chatbots:

### `src/modules/chatbots/` — admin/owner CRUD (all routes behind JwtAuthGuard)
Schemas in `src/modules/chatbots/schemas/`:
- `chatbot.schema.ts` — `Chatbot` doc: name, description, persona, language ('en'|'ar'|'both'), template, status ('draft'|'active'|'inactive'), fallbackMessage (+`_ar`), humanHandoff, unique `embedKey` (32-char hex), nested `channels.website/whatsapp/instagram` config
- `knowledge-base.schema.ts` — `KnowledgeBase` doc: chatbotId, type ('text'|'faq'|'url'), question/answer/content/sourceUrl, `embedding` vector (`select: false`)
- `conversation.schema.ts` — `Conversation` doc: chatbotId, sessionId, channel, embedded `messages[]` ({role, content, timestamp}), status

Routes (`chatbots.controller.ts`):
```
POST   /api/v1/chatbots                          — create
GET    /api/v1/chatbots                          — list user's bots
GET    /api/v1/chatbots/:id                      — get one
PUT    /api/v1/chatbots/:id                      — update (status, channels, fallback msgs, etc.)
DELETE /api/v1/chatbots/:id                      — delete (cascades knowledge + conversations)
POST   /api/v1/chatbots/:id/knowledge            — add knowledge entry (embeds via OpenAI if user has a key)
GET    /api/v1/chatbots/:id/knowledge            — list entries
DELETE /api/v1/chatbots/:id/knowledge/:kId       — delete entry
GET    /api/v1/chatbots/:id/conversations        — recent conversations
GET    /api/v1/chatbots/:id/analytics            — {totalConversations, totalMessages, avgMessagesPerConversation, handoffs, byChannel}
GET    /api/v1/chatbots/:id/embed-code           — returns ready-to-paste <script> snippet
```

`ChatbotsService.addKnowledge()` looks up the bot owner's OpenAI key via `ApiKeysService.getDecryptedKey(userId, 'openai')` — BYOK, no fallback (see the CRITICAL note near the top of this file) — embeds the text with `text-embedding-3-small`. If no key is present, the entry is stored with an empty embedding — the bot still works via keyword fallback, just without semantic ranking, and every reply is the `fallbackMessage` until the owner adds a key.

### `src/modules/chat/` — the public AI engine (NO auth — these are customer-facing)
`chat.service.ts` is the actual chatbot brain:
1. Look up chatbot by `embedKey`, require `status === 'active'`
2. Find/create `Conversation` by `sessionId`
3. Embed the incoming message (if OpenAI key available) and rank knowledge entries by cosine similarity — top 4 go into the system prompt
4. Call `gpt-4o-mini` with a system prompt that hard-constrains the model to only answer from the knowledge base, falling back to `chatbot.fallbackMessage` otherwise
5. Persist both messages, return `{reply, sessionId}`

Routes (`chat.controller.ts`) — all `@Public()`:
```
POST /api/v1/chat/:embedKey                      — @SkipThrottle() — the widget calls this
GET  /api/v1/webhooks/whatsapp/:embedKey          — Meta webhook verification handshake
POST /api/v1/webhooks/whatsapp/:embedKey          — incoming WhatsApp messages → chat()
GET  /api/v1/webhooks/instagram/:embedKey         — Meta webhook verification handshake
POST /api/v1/webhooks/instagram/:embedKey         — incoming Instagram DMs → chat()
```

### Embed code generation
`ChatbotsService.getEmbedCode()` builds the `<script>` snippet the user pastes on their site. It reads `BACKEND_URL` (or `PUBLIC_API_URL` if set, which takes priority) — must be this backend's real public URL, no path/trailing slash, e.g. `https://web-production-07643.up.railway.app` — and appends `/api/v1` itself. **Confirmed set correctly on Railway** (`BACKEND_URL=https://web-production-07643.up.railway.app`, `FRONTEND_URL=https://www.logicmate.io`) as of the chatbot module going live. Falls back to `'https://www.logicmate.io'` if unset, which would be wrong — if the widget ever silently fails to reach the API in prod, check these two vars first.

The widget file itself (`chatbot-widget.js`) lives in the **frontend** repo's `public/` folder and is served from `FRONTEND_URL`.

### WhatsApp / Instagram — code is ready, needs manual Meta setup
The webhook handlers exist and will work once the bot owner:
1. Creates a Meta Business App, adds WhatsApp product, gets a Phone Number ID + permanent access token
2. Pastes those into the bot's Channels tab in the dashboard (`PUT /chatbots/:id` → `channels.whatsapp.phoneNumberId/accessToken`)
3. In Meta's webhook config, points to `PUBLIC_API_URL/webhooks/whatsapp/:embedKey`
4. Same flow for Instagram, except Instagram DM permissions (`instagram_manage_messages`) require Meta App Review — can take days

### Chatbot pricing & billing (implemented)
No fixed public tiers — every chatbot's price is set by hand from the dashboard, per deal, since early customers don't fit a single tier yet. Reuses the existing `Billing` ledger collection (`src/modules/billing/`) and the same manual bank-transfer "notify us, we confirm" pattern already used for agents/automations (`payment-instructions-page.tsx` on the frontend), rather than building a parallel payment system.

`Chatbot.billing` sub-document (added to `chatbot.schema.ts`):
```
setupFee, monthlyFee, currency ("USD"),
status ("trial" | "awaiting_setup_payment" | "active" | "past_due" | "suspended"),
trialEndsAt?, setupPaidAt?, lastBillingDate?, nextBillingDate?, notes?
```
`notes` is admin-only deal context (e.g. "multi-location discount agreed via call"), never shown to the customer.

Routes added to `chatbots.controller.ts`:
```
GET  /api/v1/chatbots/admin/all          — admin only: every customer's chatbots, userId populated with {name,email}. Must be declared before the ':id' routes so Nest doesn't match "admin" as an :id param.
PUT  /api/v1/chatbots/:id/pricing        — admin only: set setupFee/monthlyFee/currency/trialEndsAt/notes. First time a real price is set, billing.status auto-flips 'trial' → 'awaiting_setup_payment'.
POST /api/v1/chatbots/:id/notify-payment — owner: {kind:'setup'|'monthly', transactionRef, notes} → creates a PENDING Billing record (chatbotId-linked) + emails the admin alert
POST /api/v1/chatbots/:id/confirm-payment — admin only: {kind, billingRecordId?} → flips billing.status to 'active', computes nextBillingDate (+30 days), marks the Billing record PAID
GET  /api/v1/chatbots/:id/billing        — {billing, history} — either the owner or an admin can read it
```

**Security fix that shipped alongside this:** `ChatbotsService.update()` used to do a raw `Object.assign(chatbot, dto)` — once `billing` existed on the schema, a customer could have overwritten their own `setupFee`/`monthlyFee`/`status` through the ordinary `PUT /chatbots/:id` they already had access to. Fixed with a `CUSTOMER_EDITABLE_FIELDS` whitelist (name, description, persona, language, template, status, fallbackMessage(+_ar), humanHandoff, channels) — `billing` and `embedKey` are deliberately excluded and only reachable through the admin-gated routes above. If you ever add a new field to the `Chatbot` schema that a customer should be able to edit, add it to that whitelist explicitly — don't revert to `Object.assign(chatbot, dto)`.

`Billing` schema (`src/modules/billing/schemas/billing.schema.ts`) gained a `chatbotId?: Types.ObjectId` (links a ledger entry back to the bot that generated it) and a `SETUP` `BillingType` (alongside the existing `SUBSCRIPTION`/`USAGE`/`REFUND`) for the one-time fee specifically.

### Chatbot self-serve pricing + automatic 30-day trial (implemented)
**Superseded design, kept here so a future session doesn't reinvent it:** this used to be a separate `src/modules/chatbot-plans/` module — a standalone `ChatbotPlan` collection with its own admin-only CRUD API (`/admin/chatbot-plans`) and Basic/Pro/Enterprise tiers gating which channels a customer could enable. It was removed. The problem wasn't the per-template market pricing (that part was right and is kept) — it was that this pricing had **no admin UI at all**, while agents/automations already have a perfectly good one (the Pricing tab on `/dashboard/cms-modules`, described in the Modules API section above). Maintaining two parallel pricing systems — one dashboard-editable, one API-only — was real debt for no benefit. Chatbots now use the exact same mechanism agents/automations do.

**How it works now:** each chatbot template is a `ModuleTemplate` doc (`moduleType: 'chatbot'`, see `SEED_MODULES` in `modules.service.ts`) with its own `pricing.monthly`/`pricing.annual`/`pricing.features[]`/`pricing.hasCustomPlan`/`pricing.customLabel` — admin-edited from `/dashboard/cms-modules` exactly like a `youtube-agent` module. Pricing still varies by vertical (a qualified real-estate lead is worth far more than a restaurant reservation) — e.g. `real-estate-chatbot` is $79/mo vs `restaurant-chatbot` at $39/mo — but that's now just a starting number in the seed data, freely admin-editable per template rather than hardcoded in a separate collection. `hasCustomPlan` is **not** currently exposed in the admin form (only `pricingMonthly`/`pricingAnnual`/`pricingFeatures` are — see `admin-modules.tsx`'s Pricing tab on the frontend); it's set directly in `SEED_MODULES` for now, same as `youtube-agent`'s custom-plan card. Because these 6 chatbot docs may already exist in the database from before this pricing was added, `ModulesService.onModuleInit()` runs a one-time `backfillChatbotPricing()` after the normal seed — it `$set`s `pricing` on any chatbot doc still sitting at the schema default (`pricing.monthly === 0`), so it self-heals in production without a manual migration step, and never overwrites a price an admin already edited.

There is no more per-tier channel gating — one plan, everything included (website + WhatsApp + Instagram), same as agents/automations never having per-tier feature gating either. `ChatbotsService.update()` no longer blocks enabling any channel.

**`ChatbotsService.create()`** accepts an optional `dto.moduleSlug` (the marketing detail page's pricing section passes it) — when set, looks up that `ModuleTemplate` via `ModulesService.findOne()` and copies `pricing.monthly` onto `billing.monthlyFee` (`setupFee` stays 0, `currency` is `'USD'`). `billing.trialEndsAt` is always set to `now + 30 days` regardless — every chatbot gets a real trial window, not just ones an admin manually dated. Omitting `moduleSlug` (the dashboard's own "+ New Chatbot" modal) keeps the hand-negotiated-deal flow: admin sets `setupFee`/`monthlyFee` later via `PUT /:id/pricing`.

**`Chatbot.billing.trialReminderSent`** (bool) still exists — set once the 5-day-left reminder email goes out so it never double-sends.

**Billing-status gate is unaffected by this change** — `ChatService.chat()` (the live public engine) checks `isChatbotBillingActive(chatbot)` (`src/modules/chatbots/billing-status.util.ts`) right after the `status === 'active'` check, independent of where the price came from; a lapsed trial or `past_due`/`suspended` chatbot still can't answer for free. This check is real-time (re-derives from `trialEndsAt` directly) so it doesn't depend on `chatbot-billing.cron.ts` having already run today — the cron's job is just the reminder emails and moving `billing.status` forward, not the actual gate.

### 9 chatbot templates, fully bilingual (implemented, 2026-09)
Extended `SEED_MODULES`' chatbot section from 6 templates to 9: added `salon-chatbot` ($39/mo), `hotel-chatbot` ($79/mo), and `auto-dealership-chatbot` ($79/mo) — same shape as the existing 6 (heroStats/features/faq/pricing, `sortOrder` 7-9). `Chatbot.template` enum on `chatbot.schema.ts` extended with `'salon' | 'hotel' | 'auto_dealership'` to match. No demo videos for these 3 yet — recording one requires the real puppeteer/TTS/ffmpeg pipeline described below (a bot needs to actually exist and answer real questions first); `demoVideoUrl` is optional everywhere it's rendered, so the template pages degrade gracefully without one.

Also found and fixed a real content gap while touching this: the schema has supported bilingual content on every chatbot template field since it was built (`name_ar`, `tagline_ar`, `description_ar`, `capabilities_ar`, `heroStats[].label_ar`, `features[].title_ar`/`description_ar`, `faq[].question_ar`/`answer_ar`, `pricing.features_ar`/`customLabel_ar`) — but the seed data for all 6 original chatbot templates never actually populated any of it, so the chatbot detail pages were silently English-only for a platform whose bilingual support is a stated requirement. All 9 templates now carry real UAE Gulf Arabic content for every one of those fields.

Because `seedModules()`'s `$setOnInsert` only reaches brand-new documents, the 6 pre-existing chatbot docs already in the DB needed a backfill to actually pick up their new `_ar` content — same self-healing pattern as `backfillChatbotPricing()` (see above): `backfillChatbotArabicContent()` runs after it in `onModuleInit()`, `$set`s the AR content on any chatbot doc where `name_ar` is still empty, and never touches a doc where an admin has already filled in `name_ar` by hand from `/dashboard/cms-modules`.

### Admin can build/manage a chatbot on a client's behalf (implemented, 2026-09)
Real gap until now: `POST /chatbots` always created under the caller's own `req.user._id`, and `ChatbotsService.findOne()` threw `ForbiddenException` for anyone but the bot's owner — every other route (`update`, knowledge base, channels via `update`, conversations, analytics, embed code, delete) calls `findOne()` internally, so an admin had **zero** way to configure a client's bot. The only admin access at all was the read-only `GET /chatbots/admin/all` list.

Given the platform's actual sales motion (cold outreach → you close the deal → the client is often not technical enough to build their own knowledge base) rather than pure self-serve signup, the right onboarding shape is hybrid: admin does the initial setup, client gets a login afterward to handle day-to-day content changes themselves. That needs admin to be able to fully drive a client's bot, not just view it.

- `ChatbotsService.findOne(id, userId, isAdmin = false)` gained the `isAdmin` bypass — mirrors the pattern `getBillingHistory()` already used (`isAdmin ? findOneAdmin() : findOne()`), just pushed down into `findOne()` itself so every method built on top of it (`update`, `delete`, `addKnowledge`, `listKnowledge`, `deleteKnowledge`, `getConversations`, `getAnalytics`, `getEmbedCode`) picks it up by adding one `isAdmin` parameter each, forwarded from `chatbots.controller.ts` as `req.user.role === 'admin'` on every route.
- `POST /chatbots`: an admin can now pass `{ userId: '<clientId>', ...rest }` in the body to create the bot under that client's account instead of their own; a non-admin's `userId` field is ignored (controller strips it before checking `req.user.role`).
- **Real correctness bug caught while wiring this up, not a hypothetical:** `addKnowledge()` used to resolve the OpenAI key via `resolveOpenAiKey(userId)` where `userId` was whoever called the route. Once admin can call this route for a client's bot, that would have looked up the *admin's* API key (or failed) instead of the bot owner's — silently breaking BYOK's per-customer billing. Fixed by resolving the key from `chatbot.userId` (the bot's actual owner) after `findOne()`, never from the caller.
- `notifyPayment()` intentionally did **not** get an `isAdmin` param — it's the customer-facing "I've paid" action; an admin doing this on a client's behalf isn't a real scenario the platform needs.

### OpenAI key gate on chatbot setup + admin-on-behalf-of-client API keys (implemented, 2026-09)
Every chatbot capability — knowledge-base embedding, the live `/chat/:embedKey` engine itself — needs the bot **owner's** own OpenAI key on file (BYOK, see the CRITICAL note at the top of this file). Previously that only surfaced as a silent failure at chat time (empty embeddings, every reply falling back to `fallbackMessage`) with no prompt anywhere to actually add one. The frontend now checks for it up front and blocks into a dialog before setup — see frontend CLAUDE.md.

To support that (and the admin-onboarding flow above, where the admin may be the one adding the client's key on their behalf during setup), `api-keys.controller.ts` gained the same admin-bypass shape as `chatbots.controller.ts`:
- `POST /api-keys`: admin can pass `{ userId: '<clientId>', ...rest }` to save the key under that client's account instead of their own. Ignored for non-admins.
- `GET /api-keys`: admin can pass `?userId=<clientId>` to read a specific client's keys (e.g. checking whether the chatbot's owner has an OpenAI key). Ignored for non-admins — meaningfully, this makes it safe for the frontend to *always* pass `?userId=<bot.userId>` regardless of who's viewing, since it's a no-op for a non-admin client checking their own bot (resolves to their own id either way).

`ApiKeysService.saveKey()`/`getKeys()` needed no changes — both already took `userId` as a plain parameter; only the controller was hardcoded to `req.user._id`.

## What is next to build
1. ~~Chatbot module backend~~ ✅ done
2. ~~Chatbot pricing/billing~~ ✅ done — admin-set per-deal, manual bank transfer
3. ~~Chatbot self-serve pricing + automatic trial~~ ✅ done — see above. Now unified with the agents/automations pricing mechanism (module.pricing, admin-editable); no more per-tier channel gating or `maxBots` concept to enforce.
4. ~~9 bilingual chatbot templates~~ ✅ done — see above
5. ~~Admin can build/manage a chatbot for a client~~ ✅ done — see above
6. **Channel integrations** — WhatsApp/Instagram code is done; needs live Meta Business App credentials + webhook verification tokens to actually go live
7. **Subscribe flow + payment integration for agents/automations** — chatbots now have billing; agents/automations still only have the generic hardcoded `PLANS` list in `payment-instructions-page.tsx` on the frontend, not per-module pricing
