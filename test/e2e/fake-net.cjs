// TEST-ONLY preload (node -r fake-net.cjs dist/main.js). Never committed.
// Answers the backend's outbound calls to OpenAI, Resend and Meta locally so
// the real backend code runs end to end without real accounts. Every call
// is appended to calls.jsonl for the Playwright test to assert on.
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, 'calls.jsonl');
const realFetch = global.fetch;

const log = (entry) => fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...entry }) + '\n');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const STOP = new Set(['the','you','your','can','are','and','for','have','has','with','our','any','what','how','does','did','was','this','that','there','please','tell','about','near','from','my','fix','is','do','a','an','i']);
const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w));

// Deterministic bag-of-words "embedding" so semantic search ranks sensibly.
function embed(text) {
  const v = new Array(64).fill(0);
  for (const w of words(text)) {
    let h = 0; for (const c of w.replace(/s$/, '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % 64] += 1;
  }
  return v;
}

// A stand-in "model": answers from the knowledge snippets in the system
// prompt (the best word overlap with the guest's message), otherwise replies
// with the fallback message the prompt tells it to use. Good enough to prove
// the plumbing; says nothing about real model quality.
function fakeChat(body) {
  const msgs = body.messages || [];
  const system = msgs.find((m) => m.role === 'system')?.content || '';
  const user = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';

  if (body.response_format?.type === 'json_object') {
    // Only what the guest wrote — never the bot's own replies.
    const convo = msgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const phone = convo.match(/\+?\d[\d\s-]{7,}\d/)?.[0]?.replace(/[\s-]/g, '') || null;
    const email = convo.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || null;
    const name = convo.match(/(?:my name is|i am|i'm)\s+([A-Za-z]+)/i)?.[1] || null;
    return JSON.stringify({ name, phone, email });
  }

  // Translation of a fixed reply (fallback / contact request): echo it back.
  if (/^You translate a short customer-service message/.test(system)) return user.split('Message to send:\n')[1] || user;
  const fallback = system.match(/reply with exactly (\[\[NO_ANSWER\]\])/)?.[1] || system.match(/say: "([^"]*)"/)?.[1] || 'Sorry, I cannot help with that.';
  const q = new Set(words(user));
  const snippets = [...system.matchAll(/Q: (.*)\nA: (.*)/g)].map((m) => ({ text: m[1] + ' ' + m[2], answer: m[2] }));
  let best = null; let bestScore = 0;
  for (const s of snippets) {
    const score = words(s.text).filter((w) => q.has(w)).length;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  if (/book|reserv|table/i.test(user)) {
    const link = system.match(/https?:\/\/\S*book\S*/i)?.[0];
    if (link) return `You can book a table here: ${link.replace(/[.,)]+$/, '')}`;
  }
  if (/branch|deliver|location/i.test(user) && /multiple locations/i.test(system)) {
    const area = [...q].find((w) => system.toLowerCase().includes(w) && w.length > 4 && !['branch', 'deliver', 'location'].includes(w));
    if (area) return `Yes — we have a location that covers ${area}.`;
  }
  // Like a real model: keep an entry's [[MEDIA:…]] tag, drop the note around it.
  if (best) return best.answer.replace(/\s—\s\([^()]*?:\s(\[\[MEDIA:[a-f0-9]+\]\])\)/, ' $1');
  return fallback;
}

global.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  let body = init.body;
  try { body = body ? JSON.parse(body) : undefined; } catch {}
  const auth = init.headers?.Authorization || init.headers?.authorization || init.headers?.['x-api-key'];

  // Model lists for the Overview → AI model picker (a realistic mix, so the
  // backend's chat-model filter is exercised too).
  if (url.startsWith('https://api.openai.com/v1/models')) {
    log({ kind: 'openai.models', auth });
    return json({ data: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'text-embedding-3-small', 'whisper-1', 'dall-e-3', 'gpt-4o-realtime-preview', 'tts-1'].map((id) => ({ id })) });
  }
  if (url.startsWith('https://api.anthropic.com/v1/models')) {
    log({ kind: 'anthropic.models', auth });
    return json({ data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }, { id: 'claude-3-5-haiku-latest', display_name: 'Claude Haiku 3.5' }] });
  }
  if (url.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) {
    log({ kind: 'gemini.models' });
    return json({ models: [
      { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', displayName: 'Text Embedding 004', supportedGenerationMethods: ['embedContent'] },
    ] });
  }
  if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
    const content = fakeChat(body);
    log({ kind: 'openai.chat', auth, model: body.model, json: !!body.response_format, system: body.messages?.[0]?.content, reply: content });
    return json({ choices: [{ message: { role: 'assistant', content } }] });
  }
  if (url.startsWith('https://api.openai.com/v1/embeddings')) {
    log({ kind: 'openai.embed', auth });
    return json({ data: [{ embedding: embed(body.input) }] });
  }
  if (url.startsWith('https://api.anthropic.com/')) {
    const content = fakeChat({ messages: [{ role: 'system', content: body.system || '' }, ...(body.messages || [])] });
    log({ kind: 'anthropic.chat', auth, reply: content });
    return json({ content: [{ type: 'text', text: content }] });
  }
  if (url.startsWith('https://api.resend.com/emails')) {
    log({ kind: 'email', to: body.to, subject: body.subject, reply_to: body.reply_to, attachments: (body.attachments || []).map((a) => ({ filename: a.filename, bytes: Buffer.from(a.content || '', 'base64').length })) });
    return json({ id: 'fake-email-id' });
  }
  if (/^https:\/\/graph\.(facebook|instagram)\.com\//.test(url)) {
    log({ kind: 'meta', url, method: init.method, auth, body });
    return json({ messages: [{ id: 'wamid.fake' }], message_id: 'm.fake' });
  }
  return realFetch(input, init);
};
console.log('[fake-net] outbound OpenAI/Anthropic/Resend/Meta calls are faked; log:', LOG);
