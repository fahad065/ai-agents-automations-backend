# LogicMate — Backend

## Platform overview
LogicMate is a B2B AI automation marketplace targeting UAE and Kenya markets. This NestJS API powers the frontend (Next.js on Vercel) and communicates with the Python pipeline service for AI job execution.

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
_id, name, name_ar, slug, type ("agent" | "automation"),
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

## Modules API routes
```
GET  /api/v1/modules              — public catalog
GET  /api/v1/modules/:slug        — public single module
POST /api/v1/admin/cms-modules    — admin create
PUT  /api/v1/admin/cms-modules/:id — admin update
```

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

`ChatbotsService.addKnowledge()` looks up the bot owner's OpenAI key via `ApiKeysService.getDecryptedKey(userId, 'openai')`, embeds the text with `text-embedding-3-small`. If no key is present, the entry is stored with an empty embedding — the bot still works via keyword fallback, just without semantic ranking.

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
`ChatbotsService.getEmbedCode()` builds the `<script>` snippet the user pastes on their site. It reads `PUBLIC_API_URL` env var (must be set to this backend's real public URL, e.g. Railway domain + `/api/v1`) — **this must be set correctly in production or the widget will silently fail to reach the API**. Falls back to `${FRONTEND_URL}/api/v1` if unset, which is almost certainly wrong in prod — always verify `PUBLIC_API_URL` is set on Railway.

The widget file itself (`chatbot-widget.js`) lives in the **frontend** repo's `public/` folder and is served from `FRONTEND_URL`.

### WhatsApp / Instagram — code is ready, needs manual Meta setup
The webhook handlers exist and will work once the bot owner:
1. Creates a Meta Business App, adds WhatsApp product, gets a Phone Number ID + permanent access token
2. Pastes those into the bot's Channels tab in the dashboard (`PUT /chatbots/:id` → `channels.whatsapp.phoneNumberId/accessToken`)
3. In Meta's webhook config, points to `PUBLIC_API_URL/webhooks/whatsapp/:embedKey`
4. Same flow for Instagram, except Instagram DM permissions (`instagram_manage_messages`) require Meta App Review — can take days

## What is next to build
1. ~~Chatbot module backend~~ ✅ done
2. **Channel integrations** — WhatsApp/Instagram code is done; needs live Meta Business App credentials + webhook verification tokens to actually go live
3. **Subscribe flow** — payment intent creation, subscription activation
4. **Payment integration** — Stripe or regional gateway
