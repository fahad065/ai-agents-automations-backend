// End-to-end: gym chatbot, Basic then Pro, against the REAL backend
// (production mode) + REAL frontend build + REAL MongoDB. Only OpenAI /
// Resend / Meta are answered locally by fake-net.cjs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FE = 'http://localhost:3410';
const API = 'http://localhost:4000/api/v1';
const SITE = 'http://localhost:3500';
const E = __dirname;
const SHOTS = path.join(E, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const OWNER = { first: 'Omar', last: 'Owner', email: `owner.${Date.now()}@gym.test`, password: 'Owner@12345' };
const ADMIN = { email: `admin.${Date.now()}@logicmate.test`, password: 'Admin@12345' };

const results = [];
let section = '';
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} [${section}] ${name}${extra ? ' — ' + extra : ''}`); return cond; };
const mongo = (js) => execFileSync('docker', ['exec', 'lm-mongo', 'mongosh', '--quiet', '--eval', 'db=db.getSiblingDB("lm_e2e");' + js]).toString().trim();
const calls = () => (fs.existsSync(path.join(E, 'calls.jsonl')) ? fs.readFileSync(path.join(E, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crypto = require('crypto');
// What Meta sends: raw JSON + X-Hub-Signature-256 HMAC with the app secret.
let embedKeyRef = null;
async function metaPost(channel, secret, body) {
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return fetch(`${API}/webhooks/${channel}/${embedKeyRef}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: raw });
}

async function api(token, method, p, body) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function step(name, fn, page) {
  try { await fn(); } catch (e) {
    ok(name + ' (step crashed)', false, e.message.split('\n')[0]);
    if (page) await page.screenshot({ path: path.join(SHOTS, `crash-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {});
  }
}
async function openTab(page, label) {
  await page.locator('nav button', { hasText: label }).first().click();
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('lm_cookie_consent', JSON.stringify({ analytics: false, version: 1, decidedAt: 'x' })));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  let token = null; let botId = null; let embedKey = null;

  // ───────────────────────── BASIC ─────────────────────────
  section = 'Signup';
  await step('signup + verify email', async () => {
    await page.goto(`${FE}/auth/signup`, { waitUntil: 'networkidle' });
    const inputs = page.locator('form input');
    await inputs.nth(0).fill(OWNER.first); await inputs.nth(1).fill(OWNER.last);
    await page.locator('input[type=email]').fill(OWNER.email);
    const pw = page.locator('input[type=password]');
    await pw.nth(0).fill(OWNER.password); await pw.nth(1).fill(OWNER.password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    ok('signed up and landed on dashboard', true);
    const stored = mongo(`JSON.stringify(db.users.findOne({email:"${OWNER.email}"},{auth:1,plan:1,profile:1,phoneNumber:1}))`);
    const u = JSON.parse(stored);
    ok('new user stored in grouped shape', !!u.auth && !!u.plan && u.auth.isEmailVerified === false && u.plan.planType === 'trial' && !('phoneNumber' in u));
    const verifyTok = u.auth.emailVerificationToken;
    ok('verification email sent', calls().some((c) => c.kind === 'email' && JSON.stringify(c.to).includes(OWNER.email) && /verify/i.test(c.subject)));
    await page.goto(`${FE}/verify-email?token=${verifyTok}`, { waitUntil: 'networkidle' });
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    ok('email verified', JSON.parse(mongo(`JSON.stringify(db.users.findOne({email:"${OWNER.email}"}).auth)`)).isEmailVerified === true);
    token = await page.evaluate(() => JSON.parse(localStorage.getItem('kt-auth')).state.accessToken);
    const me = await api(token, 'GET', '/auth/me');
    ok('API never returns auth tokens', !JSON.stringify(me.data).includes('emailVerificationToken') && !JSON.stringify(me.data).includes('refreshToken') && !JSON.stringify(me.data).includes('"password"'));
  }, page);

  section = 'Basic: buy';
  await step('pick Basic in Browse Services', async () => {
    const side = await page.locator('[data-sidebar="sidebar"]').first().innerText();
    ok('sidebar: My Services + Browse Services, no separate Chatbots page', /My Services/.test(side) && /Browse Services/.test(side) && !/^Chatbots$/m.test(side), side.replace(/\n/g, ' | ').slice(0, 160));
    await page.getByRole('link', { name: 'Browse Services' }).first().click();
    await page.waitForURL(/\/dashboard\/services/, { timeout: 15000 });
    await page.waitForTimeout(800);
    const card = page.locator('[data-testid="service-card"]', { hasText: 'Gym Membership Bot' });
    ok('gym chatbot listed in Browse Services', (await card.count()) === 1);
    await card.getByRole('button', { name: 'Start free trial' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({ timeout: 8000 });
    const dt = await dlg.innerText();
    ok('plan choice shows Basic $79 and Pro $120', /Basic/i.test(dt) && /\$79/.test(dt) && /Pro/i.test(dt) && /\$120/.test(dt), dt.slice(0, 160).replace(/\n/g, ' '));
    await page.screenshot({ path: path.join(SHOTS, 'marketplace-plan-choice.png') });
    await dlg.getByRole('button', { name: /Start free trial/ }).click();
    await page.waitForURL(/\/dashboard\/chatbots\/[a-f0-9]{24}/, { timeout: 20000 });
    botId = page.url().match(/chatbots\/([a-f0-9]{24})/)[1];
    const bot = JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}))`));
    embedKey = bot.config.embedKey; embedKeyRef = embedKey;
    ok('stored in userservices as a chatbot linked to its catalog service', bot.type === 'chatbot' && !!bot.serviceId && bot.status === 'trial' && mongo('db.getCollectionNames().includes("chatbots") ? db.chatbots.countDocuments() : 0') === '0');
    ok('chatbot created on Basic with Basic price', bot.plan.tier === 'basic' && bot.plan.monthlyFee === 79, `tier=${bot.plan.tier} fee=${bot.plan.monthlyFee}`);
    ok('30-day trial started', Math.round((new Date(bot.trialEndDate) - Date.now()) / 864e5) === 30);
    ok('setup-guide + trial emails sent', calls().filter((c) => c.kind === 'email' && JSON.stringify(c.to).includes(OWNER.email)).length >= 2);
  }, page);

  await step('AI key prompt', async () => {
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({ timeout: 8000 });
    ok('"add your AI key" prompt shown for a bot with no key', /key/i.test(await dlg.innerText()));
    const dtext = await dlg.innerText();
    ok('same form as the API Keys page, OpenAI preselected', /Create API key/.test(dtext) && /Service \/ Provider/.test(dtext) && /OpenAI/.test(dtext) && /API key value/.test(dtext), dtext.slice(0, 120).replace(/\n/g, ' '));
    await dlg.locator('#key-value').fill('sk-owner-test-key-1234567890');
    await dlg.getByRole('button', { name: /Save key/ }).click();
    await page.waitForTimeout(1200);
    ok('key saved (encrypted, not plain text)', mongo(`db.apikeys.countDocuments({provider:"openai"})`) === '1' && !mongo(`JSON.stringify(db.apikeys.findOne())`).includes('sk-owner-test-key'));
  }, page);

  section = 'Basic: tier gating';
  await step('Basic locks', async () => {
    const navText = await page.locator('nav').first().innerText();
    ok('Analytics tab hidden on Basic', !/Analytics/.test(navText));
    await openTab(page, 'Channels');
    const t = await page.locator('main').last().innerText();
    ok('WhatsApp + Instagram show the Pro lock', (t.match(/Pro feature|Upgrade to Pro|🔒 Pro/gi) || []).length >= 2);
    await page.screenshot({ path: path.join(SHOTS, 'basic-channels-locked.png') });
    const wa = await api(token, 'PUT', `/chatbots/${botId}`, { channels: { whatsapp: { enabled: true, phoneNumberId: 'PN1', accessToken: 'x' } } });
    ok('API refuses enabling WhatsApp on Basic', wa.status >= 400, `status ${wa.status}`);
    const an = await api(token, 'GET', `/chatbots/${botId}/analytics`);
    ok('API refuses analytics on Basic', an.status === 403, `status ${an.status}`);
  }, page);

  section = 'Basic: knowledge base';
  await step('knowledge base via UI + bulk', async () => {
    await openTab(page, 'Knowledge Base');
    await page.getByRole('button', { name: /Add Knowledge/ }).click();
    await page.getByPlaceholder('Type the question a customer would ask').fill('What are your opening hours?');
    await page.getByPlaceholder('Type the answer the bot should give').fill('We are open every day from 5am to 11pm.');
    await page.getByRole('button', { name: /^Add Entry$/ }).click();
    await page.waitForTimeout(1200);
    ok('FAQ added through the UI', (await page.locator('main').last().innerText()).includes('5am to 11pm'));
    // 14 more entries so the important ones sit well past the old first-8 cut-off.
    const faqs = [
      ...Array.from({ length: 10 }, (_, i) => [`Gym rule number ${i}`, `Rule ${i} applies to group classes only.`]),
      ['Do you have a swimming pool?', 'Yes — a 25m indoor pool, open 6am to 10pm.'],
      ['Do you have women-only hours?', 'Yes, women-only hours are 10am to 1pm every day.'],
      ['How much is the monthly membership?', 'The monthly membership is $60.'],
      ['Do you have parking?', 'Free basement parking for members.'],
    ];
    for (const [q, a] of faqs) await api(token, 'POST', `/chatbots/${botId}/knowledge`, { type: 'faq', question: q, answer: a });
    ok('15 knowledge entries stored', mongo(`db.knowledgebases.countDocuments({userserviceId:ObjectId("${botId}")})`) === '15');
    ok('entries embedded with the OWNER\'s key', calls().filter((c) => c.kind === 'openai.embed').every((c) => c.auth === 'Bearer sk-owner-test-key-1234567890'));
    // Edit the membership price through the UI.
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('dialog').waitFor({ timeout: 2000 }).then(() => page.keyboard.press('Escape')).catch(() => {});
    await openTab(page, 'Knowledge Base');
    const row = page.locator('div', { hasText: 'How much is the monthly membership?' }).last();
    await row.locator('xpath=ancestor::div[.//button][1]').locator('button').first().click();
    await page.waitForTimeout(500);
    const answerBox = page.locator('textarea').first();
    await answerBox.fill('The monthly membership is now $55.');
    await page.getByRole('button', { name: /^Save Changes$/ }).first().click();
    await page.waitForTimeout(1200);
    ok('FAQ edited through the UI', mongo(`db.knowledgebases.findOne({question:"How much is the monthly membership?"}).answer`) === 'The monthly membership is now $55.');
    // Question + written answer + Google Maps link, added through the UI.
    await page.getByRole('button', { name: /Add Knowledge/ }).click();
    await page.getByPlaceholder('Type the question a customer would ask').fill('Where is your Marina club located?');
    await page.getByRole('button', { name: 'Text + link' }).click();
    await page.getByPlaceholder('Type the answer the bot should give').fill('Marina Walk, next to the tram stop.');
    await page.getByPlaceholder('Paste the link (https://...)').fill('https://maps.app.goo.gl/ironfit-marina');
    await page.getByRole('button', { name: /^Add Entry$/ }).click();
    await page.waitForTimeout(1200);
    const linked = JSON.parse(mongo(`JSON.stringify(db.knowledgebases.findOne({question:"Where is your Marina club located?"}))`));
    ok('answer + Google Maps link stored together', linked.answer === 'Marina Walk, next to the tram stop.' && linked.sourceUrl === 'https://maps.app.goo.gl/ironfit-marina' && linked.linkLabel === 'Google Maps location', JSON.stringify(linked).slice(0, 160));
    ok('link shown on the entry in the list', (await page.locator('main').last().innerText()).includes('Google Maps location:'));
    const bad = await api(token, 'POST', `/chatbots/${botId}/knowledge`, { type: 'faq', question: 'Bad link?', sourceUrl: 'javascript:alert(1)' });
    ok('unsafe link rejected', bad.status === 400, `status ${bad.status}`);
  }, page);

  section = 'Basic: locations + booking';
  await step('branches, booking link, go live', async () => {
    await api(token, 'PUT', `/chatbots/${botId}`, {
      outlets: [
        { name: 'Marina Club', city: 'Dubai', country: 'UAE', address: 'Marina Walk', areaTags: ['JBR', 'Marina'], hours: '5am-11pm', isOnlineOnly: false, notes: 'Pool, sauna, women-only hours' },
        { name: 'Barsha Studio', city: 'Dubai', country: 'UAE', address: 'Al Barsha 1', areaTags: ['Barsha'], hours: '6am-10pm', isOnlineOnly: false, notes: 'Classes only, no pool' },
      ],
      bookingUrl: 'https://book.example.com/ironfit',
      humanHandoff: true,
      channels: { website: { enabled: true, customColor: '#e11d48', welcomeMessage: 'Welcome to IronFit!' } },
    });
    await page.reload({ waitUntil: 'networkidle' }); await page.keyboard.press('Escape').catch(() => {});
    await openTab(page, 'Locations');
    await page.getByRole('button', { name: /^Add Location$/ }).first().click();
    await page.waitForTimeout(400);
    let lf = await page.locator('main').last().innerText();
    ok('gym location form: no delivery fields, has Facilities', !/delivery apps|Delivery-only/i.test(lf) && /Facilities/.test(lf), lf.slice(0, 120).replace(/\n/g, ' '));
    ok('neutral placeholders ("Enter gym name", country dropdown)', (await page.getByPlaceholder('Enter gym name').count()) === 1 && (await page.getByText('Select country').count()) >= 1);
    await page.getByRole('button', { name: /^Cancel$/ }).first().click();
    ok('2 branches shown in Locations tab', /Marina Club[\s\S]*Barsha Studio/.test(await page.locator('main').last().innerText()));
    const live = await api(token, 'PUT', `/chatbots/${botId}`, { status: 'active' });
    ok('verified owner can take the bot live', live.status === 200 && live.data.status === 'active', `status ${live.status}`);
  }, page);

  section = 'Basic: website widget';
  const guest = await ctx.newPage();
  guest.on('pageerror', (e) => pageErrors.push('guest: ' + e.message));
  async function ask(text) {
    const before = await guest.locator('.lm-cb-msg').count();
    await guest.locator('#lm-cb-input').fill(text);
    await guest.keyboard.press('Enter');
    await guest.waitForFunction((n) => document.querySelectorAll('.lm-cb-msg').length >= n + 2, before, { timeout: 15000 });
    await guest.waitForTimeout(300);
    return (await guest.locator('.lm-cb-msg').last().innerText()).trim();
  }
  await step('widget on the gym website', async () => {
    const embed = await api(token, 'GET', `/chatbots/${botId}/embed-code`);
    const snippet = embed.data.embedCode || embed.data.code || embed.data.snippet || embed.data;
    ok('embed code points at real frontend + backend', typeof snippet === 'string' && snippet.includes(`${FE}/chatbot-widget.js`) && snippet.includes('localhost:4000/api/v1'));
    fs.writeFileSync(path.join(E, 'site', 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>IronFit Gym</title></head><body><h1>IronFit Gym — train with us</h1>${snippet}</body></html>`);
    await guest.goto(`${SITE}/index.html`, { waitUntil: 'networkidle' });
    await guest.locator('.lm-cb-bubble').first().click();
    await guest.waitForTimeout(800);
    await guest.screenshot({ path: path.join(SHOTS, 'widget-open.png') });

    let a = await ask('Do you have a swimming pool?');
    ok('answers from KB entry #11 (past the old first-8 limit)', /25m indoor pool/i.test(a), a);
    a = await ask('How much is the monthly membership?');
    ok('edited answer is live immediately', /\$55/.test(a), a);
    a = await ask('Can I book a free trial for tomorrow?');
    ok('shares the trial booking link', a.includes('https://book.example.com/ironfit'), a);
    a = await ask('Can I book the 7pm spin class?');
    ok('class slot: points to the booking link, never confirms a spot itself', a.includes('https://book.example.com/ironfit') && !/you are booked|confirmed/i.test(a), a);
    a = await ask('Where is your Marina club located?');
    ok('answer comes with its Google Maps link', a.includes('Marina Walk') && a.includes('https://maps.app.goo.gl/ironfit-marina'), a);
    const link = guest.locator('.lm-cb-msg a[href="https://maps.app.goo.gl/ironfit-marina"]').last();
    ok('the link in the widget is clickable and opens in a new tab', (await link.count()) === 1 && (await link.getAttribute('target')) === '_blank' && /noopener/.test(await link.getAttribute('rel') || ''));
    a = await ask('Do you have a branch near Marina?');
    ok('answers about branches', /marina/i.test(a), a);
    const sys = calls().filter((c) => c.kind === 'openai.chat' && !c.json).pop()?.system || '';
    ok('every branch + booking link in the AI instructions', sys.includes('Marina Club') && sys.includes('Barsha Studio') && sys.includes('book.example.com'));
    a = await ask('Can you fix my car engine?');
    const fallbackMsg = mongo(`db.userservices.findOne({_id:ObjectId("${botId}")}).config.fallbackMessage`);
    ok('unknown question → the bot\'s own fallback message, nothing made up', a.includes(fallbackMsg), a);
    ok('hand-off shown to the guest', (await guest.locator('.lm-cb-msg.handoff').count()) >= 1);
    a = await ask("I'd like to join. My name is Sara and my number is +971501234567");
    await sleep(1500);
    await guest.screenshot({ path: path.join(SHOTS, 'widget-conversation.png') });
    const convo = JSON.parse(mongo(`JSON.stringify(db.conversations.findOne({userserviceId:ObjectId("${botId}"),channel:"website"}))`));
    ok('lead captured on Basic (name + phone)', convo.visitorPhone === '+971501234567' && convo.visitorName === 'Sara', `${convo.visitorName} ${convo.visitorPhone}`);
    ok('conversation marked hand-off', convo.status === 'handoff');
    const em = calls().filter((c) => c.kind === 'email' && JSON.stringify(c.to).includes(OWNER.email));
    ok('owner emailed about the lead', em.some((c) => /lead/i.test(c.subject)), em.map((c) => c.subject).join(' | '));
    ok('owner emailed about the hand-off', em.some((c) => /needs you|hand-?off|human/i.test(c.subject)), em.map((c) => c.subject).join(' | '));
  }, guest);

  section = 'Basic: dashboard';
  await step('conversation history + lead badge', async () => {
    await page.goto(`${FE}/dashboard/chatbots/${botId}?tab=conversations`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    let t = await page.locator('main').last().innerText();
    await page.goto(`${FE}/dashboard/modules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const myCard = page.locator('[data-testid="my-chatbot-card"]');
    ok('My Services lists the chatbot (Basic, on trial)', (await myCard.count()) === 1 && /Basic/.test(await myCard.innerText()) && /Trial left/.test(await myCard.innerText()));
    await page.goto(`${FE}/dashboard/chatbots`, { waitUntil: 'networkidle' });
    await page.waitForURL(/\/dashboard\/modules/, { timeout: 10000 }).catch(() => {});
    ok('old Chatbots page sends customers to My Services', /\/dashboard\/modules/.test(page.url()), page.url());
    await page.goto(`${FE}/dashboard/chatbots/${botId}?tab=conversations`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    t = await page.locator('main').last().innerText();
    ok('conversation listed with lead details', /Lead/.test(t) && t.includes('+971501234567'));
    await page.screenshot({ path: path.join(SHOTS, 'basic-conversations.png') });
    const n = await api(token, 'GET', '/notifications?limit=20');
    const notes = JSON.stringify(n.data);
    ok('dashboard notifications for lead + hand-off', /lead/i.test(notes) && /hand/i.test(notes));
  }, page);

  section = 'Basic: WhatsApp blocked';
  await step('WhatsApp webhook on Basic', async () => {
    const before = calls().length;
    await fetch(`${API}/webhooks/whatsapp/${embedKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ type: 'text', from: '971500000001', text: { body: 'Hi are you open?' } }] } }] }] }) });
    await sleep(800);
    const after = calls().slice(before);
    ok('Basic bot ignores WhatsApp (no AI call, no reply)', !after.some((c) => c.kind.startsWith('openai.chat') || c.kind === 'meta'));
    ok('no WhatsApp conversation created', mongo(`db.conversations.countDocuments({userserviceId:ObjectId("${botId}"),channel:"whatsapp"})`) === '0');
  });

  // ───────────────────────── UPGRADE ─────────────────────────
  section = 'Upgrade';
  await step('owner requests Pro', async () => {
    await page.goto(`${FE}/dashboard/chatbots/${botId}?tab=billing`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: /Request upgrade/ }).click();
    await page.getByPlaceholder('e.g. TXN123456789').last().fill('TXN-UPGRADE-001');
    await page.getByRole('button', { name: /(Send|Submit|paid|Request)/i }).last().click();
    await page.waitForTimeout(1500);
    ok('pending upgrade payment recorded', mongo(`db.billings.countDocuments({userserviceId:ObjectId("${botId}"),status:"pending"})`) >= '1');
    ok('admin alerted about the upgrade', calls().some((c) => c.kind === 'email' && JSON.stringify(c.to).includes('hello@logicmate.io') && /upgrade|payment/i.test(c.subject)));
  }, page);

  await step('admin confirms Pro', async () => {
    const reg = await api(null, 'POST', '/auth/register', { name: 'Admin Tester', email: ADMIN.email, password: ADMIN.password });
    mongo(`db.users.updateOne({email:"${ADMIN.email}"},{$set:{role:"admin","auth.isEmailVerified":true}})`);
    const adminCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await adminCtx.addInitScript(() => localStorage.setItem('lm_cookie_consent', JSON.stringify({ analytics: false, version: 1, decidedAt: 'x' })));
    const ap = await adminCtx.newPage();
    await ap.goto(`${FE}/auth/login`, { waitUntil: 'networkidle' });
    await ap.locator('input[type=email]').fill(ADMIN.email);
    await ap.locator('input[type=password]').fill(ADMIN.password);
    await ap.locator('form button[type=submit]').click();
    await ap.waitForURL(/\/dashboard/, { timeout: 20000 });
    await ap.goto(`${FE}/dashboard/chatbots/${botId}?tab=billing`, { waitUntil: 'networkidle' });
    await ap.keyboard.press('Escape').catch(() => {});
    await ap.getByRole('button', { name: /Confirm Pro Upgrade/ }).click();
    await ap.waitForTimeout(1500);
    const bot = JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).plan)`));
    ok('bot is now Pro at the Pro price', bot.tier === 'pro' && bot.monthlyFee === 120, `tier=${bot.tier} fee=${bot.monthlyFee}`);

    // Invoice: the customer's pending upgrade payment is now PAID, numbered,
    // emailed as a PDF and downloadable — by the owner only.
    const rec = JSON.parse(mongo(`JSON.stringify(db.billings.findOne({userserviceId:ObjectId("${botId}"),kind:"upgrade"}))`));
    ok('pending upgrade payment marked PAID', rec?.status === 'paid', rec?.status);
    ok('invoice numbered LM-<year>-0001', rec?.invoiceNumber === `LM-${new Date().getUTCFullYear()}-0001`, rec?.invoiceNumber);
    ok('invoice line names the service, bot and plan', /Gym .*Pro plan/.test(rec?.invoiceLine || ''), rec?.invoiceLine);
    const mail = calls().filter((c) => c.kind === 'email' && JSON.stringify(c.to).includes(OWNER.email) && /invoice/i.test(c.subject)).pop();
    ok('invoice emailed to the owner with the PDF attached', !!mail && mail.attachments?.[0]?.filename === `LogicMate-Invoice-${rec?.invoiceNumber}.pdf` && mail.attachments[0].bytes > 1000, JSON.stringify(mail?.attachments));
    const pdfRes = await fetch(`${API}/billing/${rec._id}/invoice`, { headers: { authorization: `Bearer ${token}` } });
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    ok('owner downloads the invoice PDF', pdfRes.status === 200 && pdfRes.headers.get('content-type') === 'application/pdf' && pdfBytes.subarray(0, 5).toString() === '%PDF-');
    const stranger = { name: 'Stranger', email: `stranger.${Date.now()}@gym.test`, password: 'Owner@12345' };
    await api(null, 'POST', '/auth/register', stranger);
    const sTok = (await api(null, 'POST', '/auth/login', { email: stranger.email, password: stranger.password })).data.accessToken;
    const sRes = await fetch(`${API}/billing/${rec._id}/invoice`, { headers: { authorization: `Bearer ${sTok}` } });
    ok('another customer cannot download it', sRes.status === 403, `${sRes.status}`);
    await ap.goto(`${FE}/dashboard/chatbots/${botId}?tab=billing`, { waitUntil: 'networkidle' });
    await ap.keyboard.press('Escape').catch(() => {});
    await ap.waitForTimeout(800);
    const [dl] = await Promise.all([ap.waitForEvent('download', { timeout: 10000 }), ap.getByRole('button', { name: /^Invoice$/ }).first().click()]);
    ok('Billing tab "Invoice" button downloads the PDF', dl.suggestedFilename() === `LogicMate-Invoice-${rec.invoiceNumber}.pdf`, dl.suggestedFilename());
    fs.writeFileSync(path.join(SHOTS, 'invoice.pdf'), pdfBytes);

    // Admin services form: chatbot shows no Pipeline tab, Niche on Basic tab.
    await ap.goto(`${FE}/dashboard/cms-modules`, { waitUntil: 'networkidle' });
    await ap.keyboard.press('Escape').catch(() => {});
    await ap.waitForTimeout(300);
    const search = ap.getByPlaceholder(/search/i).first();
    if (await search.count()) { await search.fill('Gym'); await ap.waitForTimeout(600); }
    await ap.locator('button', { hasText: 'Edit' }).first().click();
    await ap.waitForTimeout(700);
    const dtext = await ap.getByRole('dialog').innerText();
    ok('admin form: chatbot has no Pipeline tab', !/\bPipeline\b/.test(dtext.split('\n').slice(0, 12).join(' ')) && /Niche/.test(dtext), dtext.slice(0, 80).replace(/\n/g, ' '));
    await ap.screenshot({ path: path.join(SHOTS, 'admin-form-chatbot.png') });

    // Customer Services: the admin's one list of every client's services.
    await ap.goto(`${FE}/dashboard/chatbots`, { waitUntil: 'networkidle' });
    await ap.waitForURL(/customer-services/, { timeout: 10000 }).catch(() => {});
    ok('admin: old Chatbots URL opens Customer Services', /\/dashboard\/customer-services/.test(ap.url()), ap.url());
    await ap.waitForTimeout(1000);
    const botRow = ap.locator('[data-testid="customer-service-row"][data-kind="chatbot"]', { hasText: OWNER.email });
    ok('chatbot listed on Customer Services (Pro)', (await botRow.count()) === 1 && /Pro/.test(await botRow.innerText()), (await botRow.count()) ? (await botRow.innerText()).replace(/\n/g, ' ') : 'none');
    const before = new Date(JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).trialEndDate)`))).getTime();
    await botRow.getByRole('button', { name: 'Manage' }).click();
    await ap.getByRole('dialog').getByRole('button', { name: /Extend/ }).click();
    await ap.waitForTimeout(1200);
    const after = new Date(JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).trialEndDate)`))).getTime();
    ok('Manage → extend a chatbot trial by 30 days', Math.round((after - Math.max(before, Date.now())) / 86400000) >= 29, `${Math.round((after - before) / 86400000)}d`);
    ok('chatbot config untouched by the admin action', mongo(`db.userservices.findOne({_id:ObjectId("${botId}")}).config.embedKey`).length === 32);
    await botRow.getByRole('button', { name: 'Configure' }).click();
    await ap.waitForURL(new RegExp(`/dashboard/chatbots/${botId}`), { timeout: 10000 }).catch(() => {});
    ok('Configure opens the bot settings', ap.url().includes(`/dashboard/chatbots/${botId}`));
    const back = await ap.getByText('Back to Customer Services').first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    ok('settings page links back to Customer Services', back);
    await ap.goto(`${FE}/dashboard/customer-services`, { waitUntil: 'networkidle' });
    await ap.waitForTimeout(800);
    await ap.screenshot({ path: path.join(SHOTS, 'admin-customer-services.png') });
    await adminCtx.close();
  });

  // ───────────────────────── PRO ─────────────────────────
  section = 'Pro';
  await step('Pro unlocks', async () => {
    await page.goto(`${FE}/dashboard/chatbots/${botId}`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(700);
    ok('Analytics tab visible on Pro', /Analytics/.test(await page.locator('nav').first().innerText()));
    await openTab(page, 'Channels');
    const t = await page.locator('main').last().innerText();
    ok('WhatsApp/Instagram unlocked (no Pro lock)', !/Upgrade to Pro|🔒 Pro/.test(t));
    // Set up WhatsApp + Instagram through the Channels tab, like an owner/admin would.
    const secretInputs = page.locator('main').last().locator('input[type=password]');
    const vals = ['PN-TEST-1', 'wa-token-test', 'wa-app-secret', 'IG-TEST-1', 'ig-token-test', 'ig-app-secret'];
    for (let i = 0; i < vals.length; i++) await secretInputs.nth(i).fill(vals[i]);
    const switches = page.locator('main').last().getByRole('switch');
    for (const i of [1, 2]) if ((await switches.nth(i).getAttribute('aria-checked')) !== 'true') await switches.nth(i).click();
    await page.getByRole('button', { name: /Save Channels/ }).click();
    await page.waitForTimeout(1500);
    const ch = JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).config.channels)`));
    ok('WhatsApp + Instagram saved on Pro through the UI', ch.whatsapp.enabled && ch.whatsapp.phoneNumberId === 'PN-TEST-1' && ch.whatsapp.appSecret === 'wa-app-secret' && ch.instagram.enabled && ch.instagram.appSecret === 'ig-app-secret');
    ok('website widget settings kept when saving channels', ch.website.enabled === true && ch.website.customColor === '#e11d48');
    ok('a random verify token generated per channel', /^[a-f0-9]{32}$/.test(ch.whatsapp.verifyToken) && /^[a-f0-9]{32}$/.test(ch.instagram.verifyToken) && ch.whatsapp.verifyToken !== ch.instagram.verifyToken);
    global.__vt = ch;
    await page.reload({ waitUntil: 'networkidle' }); await page.keyboard.press('Escape').catch(() => {});
    await openTab(page, 'Channels');
    await page.screenshot({ path: path.join(SHOTS, 'pro-channels.png'), fullPage: true });
    const ct = await page.locator('main').last().innerText();
    const ctInputs = await page.locator('main').last().locator('input[readonly]').evaluateAll((els) => els.map((e) => e.value));
    ok('callback URL + verify token shown for Meta setup', ctInputs.some((v) => v.includes(`/webhooks/whatsapp/${embedKey}`)) && ctInputs.includes(ch.whatsapp.verifyToken), ctInputs.join(' | ').slice(0, 160));
  }, page);

  await step('Meta webhook security', async () => {
    const vt = global.__vt;
    const hs = (ch, tok) => fetch(`${API}/webhooks/${ch}/${embedKey}?hub.mode=subscribe&hub.verify_token=${tok}&hub.challenge=CH123`).then(async (r) => [r.status, await r.text()]);
    let [st, txt] = await hs('whatsapp', vt.whatsapp.verifyToken);
    ok('handshake with the bot\'s own token succeeds', st === 200 && txt === 'CH123', `${st} ${txt}`);
    [st] = await hs('whatsapp', 'guessed-token');
    ok('handshake with a wrong token is refused', st === 403, `${st}`);
    [st] = await hs('whatsapp', vt.instagram.verifyToken);
    ok('the Instagram token cannot verify WhatsApp', st === 403, `${st}`);
    [st] = await hs('instagram', vt.instagram.verifyToken);
    ok('Instagram handshake succeeds with its own token', st === 200);
    ok('channels marked verified', mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).config.channels.whatsapp.webhookVerified)`) === 'true');

    const before = calls().length;
    const forged = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ type: 'text', from: '971500000666', text: { body: 'fake order' } }] } }] }] });
    const r1 = await fetch(`${API}/webhooks/whatsapp/${embedKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: forged });
    const r2 = await fetch(`${API}/webhooks/whatsapp/${embedKey}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'attacker').update(forged).digest('hex') }, body: forged });
    await sleep(800);
    ok('unsigned + wrongly signed messages rejected with 403', r1.status === 403 && r2.status === 403, `${r1.status} ${r2.status}`);
    ok('…and never reach the AI or create a conversation', !calls().slice(before).some((c) => c.kind.startsWith('openai')) && mongo(`db.conversations.countDocuments({sessionId:"971500000666"})`) === '0');
  });

  await step('WhatsApp + Instagram conversations', async () => {
    const before = calls().length;
    await metaPost('whatsapp', 'wa-app-secret', { entry: [{ changes: [{ value: { messages: [{ type: 'text', from: '971500000001', text: { body: 'Do you have women-only hours?' } }] } }] }] });
    await sleep(1500);
    const meta = calls().slice(before).filter((c) => c.kind === 'meta');
    const waSend = meta.find((c) => c.url.includes('graph.facebook.com') && c.url.includes('PN-TEST-1/messages'));
    ok('WhatsApp reply sent back to the guest via Meta', !!waSend && waSend.body.to === '971500000001' && /women-only hours are/i.test(waSend.body.text.body), JSON.stringify(waSend?.body || {}));
    ok('WhatsApp reply uses the bot\'s own WhatsApp token', waSend?.auth === 'Bearer wa-token-test');
    const wc = JSON.parse(mongo(`JSON.stringify(db.conversations.findOne({userserviceId:ObjectId("${botId}"),channel:"whatsapp"}))`));
    ok('WhatsApp guest number captured as a lead automatically', wc.visitorPhone === '971500000001');

    const before2 = calls().length;
    await metaPost('instagram', 'ig-app-secret', { entry: [{ messaging: [{ sender: { id: 'ig-guest-9' }, message: { text: 'Do you have parking?' } }] }] });
    await sleep(1500);
    const igSend = calls().slice(before2).find((c) => c.kind === 'meta' && c.url.includes('graph.instagram.com/v21.0/IG-TEST-1/messages'));
    ok('Instagram DM answered back via Meta', !!igSend && igSend.body.recipient.id === 'ig-guest-9' && /basement parking/i.test(igSend.body.message.text), JSON.stringify(igSend?.body || {}));
  });

  await step('analytics on Pro', async () => {
    const an = await api(token, 'GET', `/chatbots/${botId}/analytics`);
    ok('analytics API works on Pro', an.status === 200, `status ${an.status}`);
    const d = an.data || {};
    ok('counts website + WhatsApp + Instagram', d.totalConversations >= 3 && (d.byChannel?.whatsapp || 0) >= 1 && (d.byChannel?.instagram || 0) >= 1, JSON.stringify(d));
    ok('counts hand-offs', d.handoffs >= 1, `handoffs=${d.handoffs}`);
    await page.goto(`${FE}/dashboard/chatbots/${botId}?tab=analytics`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, 'pro-analytics.png') });
    ok('Analytics tab renders numbers', /\d/.test(await page.locator('main').last().innerText()) && /WhatsApp|whatsapp/.test(await page.locator('main').last().innerText()));
  }, page);

  section = 'AI model';
  await step('one provider + model picker', async () => {
    await page.goto(`${FE}/dashboard/chatbots/${botId}?tab=overview`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    const main = () => page.locator('main').last();
    const text = await main().innerText();
    ok('one Provider field (no separate embedding provider)', /\bProvider\b/.test(text) && !/Embedding provider|Chat provider/i.test(text));
    const provLabel = page.getByText('Provider', { exact: true }).first();
    await provLabel.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    const y0 = await page.evaluate(() => window.scrollY);
    await provLabel.locator('xpath=..').locator('button').first().click();
    await page.waitForTimeout(600);
    const y1 = await page.evaluate(() => window.scrollY);
    ok('opening the provider dropdown keeps the page where it was', y0 > 300 && Math.abs(y1 - y0) < 5, `${y0} → ${y1}`);
    ok('…and its search box has focus', await page.evaluate(() => document.activeElement?.getAttribute('data-slot') === 'command-input'));
    await page.keyboard.press('Escape');

    // Model list comes from the owner's OpenAI key; chat models only.
    const modelLabel = page.getByText('Model', { exact: true }).first();
    await modelLabel.locator('xpath=..').getByText(/models available/).waitFor({ timeout: 10000 });
    await modelLabel.locator('xpath=..').locator('button').first().click();
    await page.waitForTimeout(500);
    const opts = await page.locator('[data-slot="command-item"]').allInnerTexts();
    ok('model list: Auto first, then the key\'s chat models', opts[0] === 'Auto (recommended)' && opts.includes('gpt-4o') && opts.includes('o3-mini'), opts.join(' | '));
    ok('model list leaves out embedding/audio/image models', !opts.some((o) => /embedding|whisper|dall-e|tts|realtime/.test(o)));
    const listCall = calls().filter((c) => c.kind === 'openai.models').pop();
    ok('model list fetched with the OWNER\'s key', listCall?.auth === 'Bearer sk-owner-test-key-1234567890');
    await page.locator('[data-slot="command-item"]', { hasText: /^gpt-4o$/ }).click();
    await page.getByRole('button', { name: /^Save Changes$/ }).first().click();
    await page.waitForTimeout(1200);
    ok('chosen model saved', mongo(`db.userservices.findOne({_id:ObjectId("${botId}")}).config.chatModelConfig.model`) === 'gpt-4o');
    const before = calls().length;
    await api(null, 'POST', `/chat/${embedKey}`, { message: 'Do you have a swimming pool?', sessionId: 'model-check-1' });
    const used = calls().slice(before).filter((c) => c.kind === 'openai.chat' && !c.json).pop();
    ok('replies use the chosen model', used?.model === 'gpt-4o', used?.model);

    // Switch to Claude in the UI: model goes back to Auto.
    await page.reload({ waitUntil: 'networkidle' }); await page.keyboard.press('Escape').catch(() => {});
    await page.getByText('Provider', { exact: true }).first().locator('xpath=..').locator('button').first().click();
    await page.locator('[data-slot="command-item"]', { hasText: 'Anthropic (Claude)' }).click();
    await page.waitForTimeout(800);
    const modelText = await page.getByText('Model', { exact: true }).first().locator('xpath=..').innerText();
    ok('new provider starts on Auto', /Auto \(recommended\)/.test(modelText) && /Add your Anthropic \(Claude\) API key/.test(modelText), modelText.replace(/\n/g, ' '));
    ok('Claude explains keyword matching', /matched by keywords/.test(await main().innerText()));
    await page.getByRole('button', { name: /^Save Changes$/ }).first().click();
    await page.waitForTimeout(1500);
    const cfg = JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).config.chatModelConfig)`));
    ok('saved as Anthropic / auto', cfg.provider === 'anthropic' && cfg.model === 'auto', JSON.stringify(cfg));
    await sleep(1500);
    ok('knowledge vectors cleared (Claude has no embeddings)', mongo(`db.knowledgebases.countDocuments({userserviceId:ObjectId("${botId}"),"embedding.0":{$exists:true}})`) === '0');
    await page.keyboard.press('Escape').catch(() => {});

    await api(token, 'POST', '/api-keys', { provider: 'anthropic', label: 'Claude', key: 'sk-ant-owner-test-1234567890' });
    const claudeModels = await api(token, 'GET', `/chatbots/${botId}/models?provider=anthropic`);
    ok('Claude models listed from the owner\'s key', claudeModels.data?.models?.some((m) => m.id === 'claude-sonnet-4-5'), JSON.stringify(claudeModels.data).slice(0, 120));
    const b2 = calls().length;
    const r = await api(null, 'POST', `/chat/${embedKey}`, { message: 'Do you have a swimming pool?', sessionId: 'model-check-2' });
    const after = calls().slice(b2);
    ok('Claude bot answers from the knowledge base (keyword match)', /25m indoor pool/.test(r.data?.reply || ''), r.data?.reply);
    ok('…via Anthropic with the owner key, no embedding call', after.some((c) => c.kind === 'anthropic.chat' && c.auth === 'sk-ant-owner-test-1234567890') && !after.some((c) => c.kind === 'openai.embed'));

    // Back to OpenAI: the knowledge base is re-embedded.
    await api(token, 'PUT', `/chatbots/${botId}`, { chatModelConfig: { provider: 'openai', model: 'auto' } });
    await sleep(2500);
    const total = mongo(`db.knowledgebases.countDocuments({userserviceId:ObjectId("${botId}")})`);
    ok('back on OpenAI: every entry re-embedded', mongo(`db.knowledgebases.countDocuments({userserviceId:ObjectId("${botId}"),"embedding.0":{$exists:true}})`) === total, `of ${total}`);
    const old = await api(token, 'PUT', `/chatbots/${botId}`, { embeddingModelConfig: { provider: 'gemini', model: 'auto' } });
    ok('separate embedding provider no longer accepted', mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${botId}")}).config.embeddingModelConfig || null)`) === 'null', `status ${old.status}`);
    await page.goto(`${FE}/dashboard/chatbots/${botId}?tab=overview`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByText('Provider', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, 'ai-model.png') });
  }, page);

  section = 'Trial end';
  await step('lapsed trial stops answering', async () => {
    mongo(`db.userservices.updateOne({_id:ObjectId("${botId}")},{$set:{status:"trial",trialEndDate:new Date(Date.now()-864e5)}})`);
    const r = await api(null, 'POST', `/chat/${embedKey}`, { sessionId: 's-after-trial', message: 'Do you have women-only hours?', channel: 'website' });
    ok('no AI answer after the trial ends unpaid', !/women-only hours are/i.test(JSON.stringify(r.data)), JSON.stringify(r.data).slice(0, 120));
  });

  ok('no browser errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(E, 'results-gym.txt'), results.join('\n'));
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  await browser.close();
})();
