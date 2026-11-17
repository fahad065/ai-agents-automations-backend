// End-to-end: an AI agent (YouTube Agent) as a `userservices` row, against
// the REAL backend + frontend + MongoDB. The Python pipeline service is not
// running here — starting a run only checks what NestJS records and sends.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FE = 'http://localhost:3410';
const API = 'http://localhost:4000/api/v1';
const E = __dirname;
const SHOTS = path.join(E, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PIPELINE_SECRET = 'e2e-pipeline-secret';
const OWNER = { name: 'Aisha Creator', email: `creator.${Date.now()}@agent.test`, password: 'Owner@12345' };
const ADMIN = { name: 'Admin Tester', email: `admin.${Date.now()}@logicmate.test`, password: 'Admin@12345' };

const results = [];
let section = '';
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} [${section}] ${name}${extra ? ' — ' + extra : ''}`); return cond; };
const mongo = (js) => execFileSync('docker', ['exec', 'lm-mongo', 'mongosh', '--quiet', '--eval', 'db=db.getSiblingDB("lm_e2e");' + js]).toString().trim();
const row = (id) => JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({_id:ObjectId("${id}")}))`));
async function api(token, method, p, body, headers = {}) {
  const res = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers }, body: body && JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function step(name, fn, page) {
  try { await fn(); } catch (e) {
    ok(name + ' (step crashed)', false, e.message.split('\n')[0]);
    if (page) await page.screenshot({ path: path.join(SHOTS, `agent-crash-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {});
  }
}
async function login(page, who) {
  await page.goto(`${FE}/auth/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill(who.email);
  await page.locator('input[type=password]').fill(who.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  return page.evaluate(() => JSON.parse(localStorage.getItem('kt-auth')).state.accessToken);
}

(async () => {
  for (const u of [OWNER, ADMIN]) await api(null, 'POST', '/auth/register', u);
  mongo(`db.users.updateMany({email:{$in:["${OWNER.email}","${ADMIN.email}"]}},{$set:{"auth.isEmailVerified":true}})`);
  mongo(`db.users.updateOne({email:"${ADMIN.email}"},{$set:{role:"admin"}})`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('lm_cookie_consent', JSON.stringify({ analytics: false, version: 1, decidedAt: 'x' })));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  let token; let id;

  section = 'Subscribe';
  await step('subscribe from Browse Services', async () => {
    token = await login(page, OWNER);
    await page.getByRole('link', { name: 'Browse Services' }).first().click();
    await page.waitForURL(/\/dashboard\/services/);
    await page.waitForTimeout(800);
    const card = page.locator('[data-testid="service-card"]', { hasText: 'Youtube Agent' });
    ok('YouTube Agent listed in Browse Services', (await card.count()) === 1);
    await card.getByRole('button', { name: 'Start free trial' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: /Set Up Service/ }).click();
    await dlg.locator('input').nth(1).fill('Healthy home cooking');
    await page.screenshot({ path: path.join(SHOTS, 'agent-subscribe.png') });
    await dlg.getByRole('button', { name: /Start Free Trial/ }).click();
    await page.waitForURL(/\/dashboard\/modules/, { timeout: 15000 });
    const r = JSON.parse(mongo(`JSON.stringify(db.userservices.findOne({type:"agent"}))`));
    id = String(r._id);
    const svc = mongo('db.services.findOne({slug:"youtube-agent"})._id.toString()');
    ok('stored in userservices as an agent linked to the YouTube Agent service', r.type === 'agent' && String(r.serviceId) === svc, `${r.type} ${r.serviceId}`);
    ok('30-day trial, basic plan priced from the catalog', r.status === 'trial' && Math.round((new Date(r.trialEndDate) - Date.now()) / 864e5) === 30 && r.plan.tier === 'basic' && r.plan.monthlyFee > 0, `fee=${r.plan.monthlyFee}`);
    ok('pipeline settings in config', r.config.pipelineType === 'youtube' && r.config.niche === 'Healthy home cooking' && r.config.paused === false && r.config.schedule.frequency, JSON.stringify(r.config).slice(0, 160));
    ok('no usermodules collection written', mongo('db.getCollectionNames().includes("usermodules") ? db.usermodules.countDocuments() : 0') === '0');
    ok('trial-started email sent', fs.readFileSync(path.join(E, 'calls.jsonl'), 'utf8').includes('trial'));
  }, page);

  await step('duplicate subscribe refused', async () => {
    const svc = mongo('db.services.findOne({slug:"youtube-agent"})._id.toString()');
    const r = await api(token, 'POST', '/userservices/subscribe', { moduleId: svc, niche: 'x' });
    ok('subscribing twice to the same agent is refused', r.status === 400, `${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
    const bot = mongo('db.services.findOne({slug:"gym-chatbot"})._id.toString()');
    const r2 = await api(token, 'POST', '/userservices/subscribe', { moduleId: bot });
    ok('a chatbot cannot be subscribed through the agent route', r2.status === 400);
  });

  section = 'My Services';
  await step('card + pause/resume', async () => {
    await api(token, 'POST', '/chatbots', { moduleSlug: 'gym-chatbot', name: 'My Gym Bot' });
    await page.goto(`${FE}/dashboard/modules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const text = await page.locator('main').last().innerText();
    ok('My Services lists the agent and the chatbot together', text.includes('Youtube Agent') && text.includes('My Gym Bot'));
    const my = await api(token, 'GET', '/userservices/my');
    ok('/userservices/my returns agents/automations only (chatbots have their own routes)', my.data.total === 1 && my.data.data[0].moduleType === 'agent' && my.data.data[0].moduleId.name === 'Youtube Agent');
    await page.getByTitle('Pause').first().click();
    await page.waitForTimeout(1000);
    ok('pause sets config.paused, status stays trial', row(id).config.paused === true && row(id).status === 'trial');
    ok('card shows paused', (await page.locator('main').last().innerText()).includes('paused'));
    await page.screenshot({ path: path.join(SHOTS, 'agent-my-services.png') });
    await page.getByTitle('Resume').first().click();
    await page.waitForTimeout(1000);
    ok('resume clears it', row(id).config.paused === false);
  }, page);

  section = 'Settings';
  await step('schedule + prompt', async () => {
    const s = await api(token, 'PATCH', `/userservices/${id}/schedule`, { scheduleFrequency: 'daily', scheduleTime: '10:30' });
    ok('schedule saved under config.schedule', s.status === 200 && row(id).config.schedule.frequency === 'daily' && row(id).config.schedule.time === '10:30');
    const bad = await api(token, 'PATCH', `/userservices/${id}/schedule`, { scheduleFrequency: 'hourly', scheduleTime: '10:30' });
    ok('an unknown schedule is rejected', bad.status === 400);
    await api(token, 'PATCH', `/userservices/${id}/prompt`, { customPrompt: 'Short recipes', useCustomPrompt: true });
    ok('custom prompt saved', row(id).config.customPrompt === 'Short recipes' && row(id).config.useCustomPrompt === true);
    const other = await api(null, 'POST', '/auth/login', { email: ADMIN.email, password: ADMIN.password });
    const adminToken = other.data.accessToken;
    const foreign = await api(adminToken, 'PATCH', `/userservices/${id}`, { name: 'hijack' });
    ok('another account cannot edit it', foreign.status === 404 && row(id).name !== 'hijack');
  });

  section = 'Runs';
  await step('run + record-run', async () => {
    const r = await api(token, 'POST', `/userservices/${id}/run`);
    ok('run accepted while on trial', r.status === 201 && /^youtube_/.test(r.data.runId), JSON.stringify(r.data).slice(0, 80));
    ok('pipeline run record linked to this service', mongo(`db.pipelineruns.countDocuments({agentId:ObjectId("${id}")})`) === '1');
    ok('run counted', row(id).config.totalRuns === 1 && !!row(id).config.lastRunAt);
    const st = await api(token, 'GET', `/userservices/${id}/run-status`);
    ok('run status is this service\'s own latest run', st.status === 200 && st.data.runId === r.data.runId);
    const noSecret = await api(null, 'PATCH', `/userservices/${id}/record-run`, { cost: 1.5 });
    ok('record-run needs the pipeline secret', noSecret.status === 401 || noSecret.status === 403, `${noSecret.status}`);
    await api(null, 'PATCH', `/userservices/${id}/record-run`, { cost: 1.5 }, { 'x-pipeline-secret': PIPELINE_SECRET });
    await api(null, 'PATCH', `/usermodules/${id}/record-run`, { cost: 0.5 }, { 'x-pipeline-secret': PIPELINE_SECRET });
    ok('Python cost reports land (new route + old alias)', row(id).config.totalCost === 2, `cost=${row(id).config.totalCost}`);
    mongo(`db.userservices.updateOne({_id:ObjectId("${id}")},{$set:{status:"past_due"}})`);
    const blocked = await api(token, 'POST', `/userservices/${id}/run`);
    ok('an unpaid (past_due) service cannot run', blocked.status === 400 && /trial has ended/i.test(blocked.data.message), blocked.data.message);
    const mine = await api(token, 'GET', `/userservices/${id}`);
    ok('shown as expired on the dashboard', mine.data.status === 'expired');
  });

  section = 'Admin';
  await step('admin tools', async () => {
    const adminToken = (await api(null, 'POST', '/auth/login', { email: ADMIN.email, password: ADMIN.password })).data.accessToken;
    const all = await api(adminToken, 'GET', '/userservices');
    ok('admin sees every customer\'s agents', all.data.total >= 1 && all.data.data.some((d) => String(d._id) === id));
    const ext = await api(adminToken, 'PATCH', `/userservices/${id}/extend-trial`, { days: 7 });
    ok('admin extends the trial → back on trial', ext.status === 200 && row(id).status === 'trial');
    const cust = await api(token, 'PATCH', `/userservices/${id}/extend-trial`, { days: 7 });
    ok('a customer cannot extend their own trial', cust.status === 403);
    const usage = await api(adminToken, 'GET', '/admin/usage');
    ok('admin usage counts the agent', usage.status === 200 && JSON.stringify(usage.data).includes('trial'));
  });

  section = 'Remove';
  await step('remove from My Services', async () => {
    await page.goto(`${FE}/dashboard/modules`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const card = page.locator('div.rounded-xl', { hasText: 'Youtube Agent' }).filter({ has: page.getByTitle('Remove') }).last();
    await card.getByTitle('Remove').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await page.waitForTimeout(1200);
    const r = row(id);
    ok('removed = cancelled + soft-deleted, kept for history', r.isDeleted === true && r.status === 'cancelled' && !!r.cancelledAt);
    ok('gone from My Services', !(await page.locator('main').last().innerText()).includes('Youtube Agent'));
  }, page);

  ok('no browser errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(E, 'results-agent.txt'), results.join('\n'));
  console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  await browser.close();
})();
