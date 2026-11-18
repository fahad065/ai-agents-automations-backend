# Clinic chatbot — test cases

Service: `clinic-chatbot` · Tiers: **Basic** / **Pro** (Custom = contact us, not self-serve)
Automated by: `test/e2e/clinic-e2e.cjs` (see `test/e2e/README.md`)
Last full run: **2026-11-18 — 97 / 97 passed** (fresh database, backend in production mode)

How to read this: **Input** is what the owner, patient, admin or Meta does.
**Expected** is what must happen. **Via** says how the test drives it:
UI = clicked in the real website, API = direct API call, Webhook = a
Meta-style request, DB = checked in MongoDB.

Test data: owner `Nadia Owner`; knowledge base of 16 entries where the
important ones (GP price, blood-test fasting, paediatrician, emergency
number, parking) are entries 11–15; branches "Noor Al Barsha" (UAE;
insurance Daman, AXA, NAS), "Noor Jumeirah" (UAE, added through the form;
insurance Daman, Bupa Global, Cigna) and "Noor Nairobi" (Kenya; no
insurance list); appointment link `https://book.example.com/noor-clinic`.
Prices as the admin sets them in the Service Catalog: Basic $99 (annual
$79/mo), Pro $149 (annual $119/mo). Same branches/doctors as the demo
site `fahad065/logicmate-clinic-website`.

---

## 1. Signup & account

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 1.1 | Sign up | First/last name, email, password on `/auth/signup` | Lands on `/dashboard`, logged in | UI |
| 1.2 | User stored in grouped shape | — | `auth.isEmailVerified=false`, `plan.planType=trial` | DB |
| 1.3 | Verification email | — | "Verify your LogicMate email address" sent | Email log |
| 1.4 | Verify email | Open `/verify-email?token=…` | `auth.isEmailVerified=true` | UI + DB |
| 1.5 | No secrets in API | `GET /auth/me` | No password / tokens in the response | API |

## 2. Basic — buying & setup

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 2.1 | Admin prices | Service Catalog prices set to 99/79 and 149/119 | Stored on `pricing.tiers` | DB |
| 2.2 | Plan choice | Browse Services → Clinic → **Start free trial** | Dialog shows Basic **$99** and Pro **$149** | UI |
| 2.3 | Buy Basic | Choose Basic | Chatbot created, `plan.tier=basic`, fee = **99** | UI + DB |
| 2.4 | 30-day trial | — | `trialEndDate` = 30 days from now | DB |
| 2.5 | Welcome emails | — | Trial + setup-guide emails to the owner | Email log |
| 2.6 | AI key prompt | Open the new bot with no key | Same form as the API Keys page, OpenAI preselected | UI |
| 2.7 | Key stored safely | Paste key → **Save key** | One `openai` key; plain text never stored | UI + DB |

## 3. Basic — what's locked

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 3.1 | No Analytics tab | Open bot settings | "Analytics" not in the tab list | UI |
| 3.2 | WhatsApp/Instagram locked | Channels tab | Both cards show the Pro lock | UI |
| 3.3 | API blocks WhatsApp | `PUT` with `channels.whatsapp.enabled=true` | Refused (4xx) | API |
| 3.4 | API blocks analytics | `GET /chatbots/:id/analytics` | **403** | API |
| 3.5 | WhatsApp ignored | WhatsApp webhook message for a Basic bot | No AI call, no reply, no conversation | Webhook + DB |

## 4. Basic — knowledge base

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 4.1 | Add FAQ | "What are your opening hours?" / "…8am to 10pm." | Entry listed | UI |
| 4.2 | Bulk entries | 15 more | 16 entries stored | API + DB |
| 4.3 | BYOK embedding | — | Every embedding call uses the **owner's** key | Call log |
| 4.4 | Edit a price | GP consultation → "now costs AED 230" → Save Changes | Stored answer updated | UI + DB |
| 4.5 | Answer + map link | "Where is your Jumeirah clinic located?" + Google Maps link | Stored together, labelled "Google Maps location" | UI + DB |

## 5. Basic — branches & insurance

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 5.1 | Existing UAE branch | Locations tab | "Insurance accepted: Daman, AXA, NAS" shown on Al Barsha | UI |
| 5.2 | Clinic wording | Add Location | "Services / specialities" field, no delivery fields, placeholder "Enter clinic name" | UI |
| 5.3 | No country yet | — | No insurance field | UI |
| 5.4 | UAE branch | Country → United Arab Emirates | "Insurance accepted" field appears | UI |
| 5.5 | Other country | Country → Kenya | Insurance field hidden | UI |
| 5.6 | Save | Back to UAE, fill city/address/specialities → Add Location → **Save Locations** | 3 branches; Jumeirah insurance = Daman, Bupa Global, Cigna | UI + DB |
| 5.7 | Kenya branch | — | No insurance list stored | DB |
| 5.8 | Go live | Verified owner sets status = active | 200, `status=active` | API |

## 6. Basic — website widget (patient on the clinic's own site)

Widget embedded on a separate site (`localhost:3500`), backend in
production mode, so the cross-site browser check (CORS) is real.

| # | Case | Patient types | Expected reply / effect |
|---|---|---|---|
| 6.1 | Embed code | — | Script points at the frontend's `chatbot-widget.js` and the backend API |
| 6.2 | Preparation (entry #12) | "Do I need to fast before a blood test?" | "Yes — fast for 10 to 12 hours…" |
| 6.3 | Edits are live | "How much does a GP consultation cost?" | "…now costs AED 230." |
| 6.4 | Doctor | "Which doctor treats children?" | Names Dr. Omar Farouk |
| 6.5 | Appointment | "Can I book an appointment with a dermatologist this week?" | Contains the booking link; never confirms a slot itself (the bot can't see the calendar) |
| 6.6 | Map link | "Where is your Jumeirah clinic located?" | Address + the Google Maps link |
| 6.7 | Branches | "Do you have a branch near Barsha?" | Mentions Barsha |
| 6.8 | Branch data sent to AI | — | All 3 branches + booking link in the AI instructions |
| 6.9 | Insurance per branch | — | Al Barsha line: "Insurance accepted: Daman, AXA, NAS" |
| 6.10 | Lists kept apart | — | Jumeirah line has its own list, no AXA |
| 6.11 | Unlisted insurer | — | Instructions say: not listed → say so and offer to check with the team |
| 6.12 | Non-UAE branch | — | Nairobi line has no insurance |
| 6.13 | Emergency | "What is your emergency number?" | Mentions 998 |
| 6.14 | Medical question | "I have chest pain, what medicine should I take?" | Exactly the fallback message — no advice |
| 6.15 | Handed to staff | (same) | Reply tagged "Connecting you with our team" |
| 6.16 | Patient contact | "I'd like an appointment for my son. My name is Aisha and my number is +971501234567" | Conversation gets name **Aisha**, phone **+971501234567** |
| 6.17 | Hand-off recorded | — | Conversation `status=handoff` |
| 6.18 | Contact email | — | Owner gets "🎯 New lead from …" |
| 6.19 | Hand-off email | — | Owner gets "🙋 A customer needs you …" |

## 7. Basic — owner dashboard

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 7.1 | Conversation history | `?tab=conversations` | Listed with Lead badge + phone | UI |
| 7.2 | Notifications | `GET /notifications` | Lead and hand-off notifications | API |

## 8. Upgrade Basic → Pro + invoice

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 8.1 | Owner requests Pro | Billing tab → Request upgrade → transaction ref | Pending payment record | UI + DB |
| 8.2 | Admin alerted | — | Email to `hello@logicmate.io` | Email log |
| 8.3 | Admin confirms | **Confirm Pro Upgrade** | `plan.tier=pro`, fee = **149** | UI + DB |
| 8.4 | Payment PAID | — | Pending upgrade record now `paid` | DB |
| 8.5 | Invoice number | — | `LM-<year>-0001` | DB |
| 8.6 | Invoice line | — | Names the clinic service and "Pro plan" | DB |
| 8.7 | Invoice emailed | — | Owner email with `LogicMate-Invoice-LM-….pdf` attached | Email log |
| 8.8 | Owner download | `GET /billing/:id/invoice` | 200 `application/pdf` | API |
| 8.9 | Stranger blocked | Another customer, same URL | **403** | API |
| 8.10 | Billing tab button | **Invoice** | Downloads the PDF | UI |
| 8.11 | Admin form | Service Catalog → edit clinic | No Pipeline tab; Niche on Basic tab | UI |
| 8.12 | Customer Services | Admin list | Bot listed (Pro); Manage → Extend +30 days; Configure opens the bot; back link | UI + DB |

## 9. Pro — unlocked features

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 9.1 | Analytics tab | Open settings | Visible | UI |
| 9.2 | Channels | Channels tab | No Pro lock; WhatsApp + Instagram (with App Secrets) saved | UI + DB |
| 9.3 | Website kept | (same save) | Widget colour/enabled unchanged | DB |
| 9.4 | Verify tokens | — | Random 32-char token per channel, different | DB |
| 9.5 | Meta setup info | Channels tab | Callback URL + Verify Token shown | UI |

## 10. Pro — Meta webhooks, WhatsApp, Instagram, analytics

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 10.1 | Handshake | Bot's own verify token | 200 + challenge; wrong token / other channel's token → **403** | Webhook |
| 10.2 | Forged messages | Unsigned or wrongly signed POST | **403**, never reach the AI | Webhook + call log |
| 10.3 | WhatsApp answered | Signed message "Do I need to fast before a blood test?" | Fasting answer sent to the patient's number with the bot's own token | Webhook + call log |
| 10.4 | WhatsApp contact | — | `visitorPhone` captured automatically | DB |
| 10.5 | Instagram answered | Signed DM "Is there parking?" | Parking answer sent via Instagram API | Webhook + call log |
| 10.6 | Analytics | `GET …/analytics` + Analytics tab | Website/WhatsApp/Instagram counts + hand-offs render | API + UI |

## 11. Trial end

| # | Case | Input | Expected | Via |
|---|---|---|---|---|
| 11.1 | Lapsed trial stops | Trial end = yesterday, unpaid; "Do I need to fast…?" | No knowledge-base answer | DB + API |
| 11.2 | No browser errors | Whole run | Zero JavaScript errors | UI |

---

## Not covered by the automated run (check by hand)

- **Real AI answer quality** — especially that a real model refuses medical
  advice and answers "do you take my insurance?" correctly per branch. The
  run uses a stand-in model and checks the instructions it receives.
- **Real email / WhatsApp / Instagram delivery** — recorded, not sent.
- **AI model picker / Claude / Gemini** — same code for every chatbot,
  covered by the gym suite (section 11 of `gym-chatbot.md`).
- **Arabic conversation** — not in this run yet.
