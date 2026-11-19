# Restaurant chatbot — test cases

Service: `restaurant-chatbot` · Tiers: **Basic** / **Pro** (Custom = contact us, not self-serve)
Automated by: `test/e2e/restaurant-e2e.cjs` (see `test/e2e/README.md`)
Last full run: **2026-11-16 — 63 / 63 passed** (fresh database, backend in production mode)

How to read this: **Input** is what the owner, guest, admin or Meta does.
**Expected** is what must happen. **Via** says how the test drives it:
UI = clicked in the real website, API = direct API call, Webhook = a
Meta-style request, DB = checked in MongoDB.

Test data: owner `Rana Owner`; knowledge base of 15 FAQs where the
important ones (vegan, halal, biryani price, parking) are entries 11–15;
branches "Marina Kitchen" (areas JBR, Marina) and "Delivery Hub" (Barsha,
delivery only); booking link `https://book.example.com/rana`.

---

## 1. Signup & account

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 1.1 | Sign up | First/last name, email, password on `/auth/signup` | Lands on `/dashboard`, logged in | UI |
| 1.2 | User stored in grouped shape | — | `auth.isEmailVerified=false`, `plan.planType=trial`, no flat fields | DB |
| 1.3 | Verification email | — | Email "Verify your LogicMate email address" sent to the owner | Email log |
| 1.4 | Verify email | Open `/verify-email?token=…` | `auth.isEmailVerified=true`, back on dashboard | UI + DB |
| 1.5 | No secrets in API | `GET /auth/me` | No password, refresh token or verification/reset token in the response | API |

## 2. Basic — buying & setup

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 2.1 | Buy Basic | `/chatbots/restaurant-chatbot` → Basic → **Get started** | Chatbot created, `billing.tier=basic`, fee = the template's Basic price | UI + DB |
| 2.2 | 30-day trial | — | `billing.trialEndsAt` = 30 days from now | DB |
| 2.3 | Welcome emails | — | "Trial started" + "here's what's next" (setup guide) emails to owner | Email log |
| 2.4 | AI key prompt | Open the new bot with no key on file | "Add a … API key" dialog appears | UI |
| 2.5 | Key stored safely | Paste key → **Save Key** | One `openai` key saved; plain key text never stored | UI + DB |

## 3. Basic — what's locked

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 3.1 | No Analytics tab | Open bot settings | "Analytics" not in the tab list | UI |
| 3.2 | WhatsApp/Instagram locked | Channels tab | Both cards show the Pro lock instead of fields | UI |
| 3.3 | API blocks WhatsApp | `PUT /chatbots/:id` with `channels.whatsapp.enabled=true` | **403** | API |
| 3.4 | API blocks analytics | `GET /chatbots/:id/analytics` | **403** | API |
| 3.5 | WhatsApp ignored | WhatsApp webhook message for a Basic bot | 200, **no** AI call, **no** reply, **no** conversation | Webhook + DB |

## 4. Basic — knowledge base, branches, booking

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 4.1 | Add FAQ | Knowledge Base → Add Knowledge → "What are your opening hours?" / "…12pm to midnight." | Entry listed | UI |
| 4.2 | Bulk entries | 14 more FAQs | 15 entries stored | API + DB |
| 4.3 | BYOK embedding | — | Every embedding call uses the **owner's** key | Call log |
| 4.4 | Edit FAQ | Edit biryani answer → "now $12" → Save Changes | Stored answer updated | UI + DB |
| 4.5 | Branches | Save 2 outlets | Both shown in Locations tab | API + UI |
| 4.6 | Go live | Verified owner sets status = active | 200, `status=active` | API |

## 5. Basic — website widget (guest on the restaurant's own site)

The widget is embedded on a separate site (`localhost:3500`) with the
backend in production mode, so the cross-site browser check (CORS) is
real.

| # | Case | Guest types | Expected reply / effect |
|---|---|---|---|
| 5.1 | Embed code | — | Script points at the frontend's `chatbot-widget.js` and the backend API |
| 5.2 | Answer past entry 8 | "Do you have vegan food?" | "Yes — 6 vegan dishes, including our vegan mushroom burger." |
| 5.3 | Edits are live | "How much is the chicken biryani?" | "The chicken biryani is now $12." |
| 5.4 | Booking link | "Can I book a table for 4 tonight?" | Reply contains `https://book.example.com/rana` |
| 5.5 | Branches | "Do you have a branch near Marina?" | Mentions Marina |
| 5.6 | Branch data sent to AI | — | AI instructions include both branches + booking link |
| 5.7 | Unknown question | "Can you fix my car engine?" | The bot's fallback message — nothing made up (with hand-off on and no phone/email yet, followed by a request for the visitor's name and phone) |
| 5.8 | Hand-off shown | (same) | Reply tagged "Connecting you with our team" |
| 5.9 | Lead capture | "I'd like a table. My name is Sara and my number is +971501234567" | Conversation gets name **Sara**, phone **+971501234567** |
| 5.10 | Hand-off recorded | — | Conversation `status=handoff` |
| 5.11 | Lead email | — | Owner gets "🎯 New lead from …" |
| 5.12 | Hand-off email | — | Owner gets "🙋 A customer needs you …" |

## 6. Basic — owner dashboard

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 6.1 | Conversation history | `/dashboard/chatbots/:id?tab=conversations` | Conversation listed with Lead badge + phone | UI |
| 6.2 | Notifications | `GET /notifications` | Lead and hand-off notifications present | API |

## 7. Upgrade Basic → Pro

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 7.1 | Owner requests Pro | Billing tab → Request upgrade → transaction ref → submit | Pending payment record created | UI + DB |
| 7.2 | Admin alerted | — | Email to `hello@logicmate.io` about the upgrade payment | Email log |
| 7.3 | Admin confirms | Admin → bot's Billing tab → **Confirm Pro Upgrade** | `billing.tier=pro`, fee = template's Pro price | UI + DB |
| 7.4 | Admin form | Admin → Services → edit restaurant chatbot | No Pipeline tab; Niche on Basic tab | UI |

## 8. Pro — unlocked features

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 8.1 | Analytics tab | Open bot settings | "Analytics" tab visible | UI |
| 8.2 | Channels unlocked | Channels tab | No Pro lock on WhatsApp/Instagram | UI |
| 8.3 | Set up channels | Type Phone Number ID, token, **App Secret** (WhatsApp) and Account ID, token, **App Secret** (Instagram); switch both on; Save Channels | All saved | UI + DB |
| 8.4 | Website kept | (same save) | Website widget colour/enabled unchanged | DB |
| 8.5 | Verify tokens | — | Random 32-char token per channel, different from each other | DB |
| 8.6 | Meta setup info | Channels tab | Callback URL + Verify Token shown with copy buttons | UI |

## 9. Pro — Meta webhook security

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 9.1 | Handshake OK | `GET …/webhooks/whatsapp/:key?hub.verify_token=<bot's token>&hub.challenge=CH123` | 200, body `CH123` | Webhook |
| 9.2 | Wrong token | Same with a guessed token | **403** | Webhook |
| 9.3 | Token per channel | WhatsApp handshake using the Instagram token | **403** | Webhook |
| 9.4 | Instagram handshake | Instagram token on the Instagram URL | 200 | Webhook |
| 9.5 | Marked verified | — | `channels.whatsapp.webhookVerified=true` | DB |
| 9.6 | Forged messages | POST with no signature, and with a signature made from a wrong secret | **403** both | Webhook |
| 9.7 | Forged never reach AI | (same) | No AI call, no conversation | Call log + DB |

## 10. Pro — WhatsApp, Instagram, analytics

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 10.1 | WhatsApp answered | Signed WhatsApp message from 971500000001: "Is the food halal?" | Reply "All our meat is certified halal." sent to 971500000001 through Meta | Webhook + call log |
| 10.2 | Bot's own token | — | Sent with the bot's WhatsApp access token | Call log |
| 10.3 | WhatsApp lead | — | Conversation `visitorPhone=971500000001` automatically | DB |
| 10.4 | Instagram answered | Signed DM from ig-guest-9: "Do you have parking?" | "Free valet parking at the main entrance." sent back via Instagram API | Webhook + call log |
| 10.5 | Analytics API | `GET /chatbots/:id/analytics` | 200 | API |
| 10.6 | Counts by channel | — | 3 conversations: website 1, WhatsApp 1, Instagram 1 | API |
| 10.7 | Counts hand-offs | — | `handoffs ≥ 1` | API |
| 10.8 | Analytics tab | Open tab | Numbers + channel breakdown render | UI |

## 11. Trial end

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 11.1 | Lapsed trial stops | Trial end date set to yesterday, unpaid; guest asks "Is the food halal?" | No knowledge-base answer (fallback only) | DB + API |
| 11.2 | No browser errors | Whole run | Zero JavaScript errors on any page | UI |

---

## Not covered by the automated run (check by hand)

- **Real AI answer quality** — the run uses a stand-in model.
- **Real email delivery** (Resend) and **real WhatsApp/Instagram** delivery
  through Meta — the run records the requests instead of sending them.
- **Claude- or Gemini-only bots** — covered by unit tests
  (`keyword-rank.spec.ts`), not this run.
- **Arabic widget conversation** — not in this run yet.
