// Runs inside mongosh. Inserts chatbots in the PRE-2026-11-17 `chatbots`
// shape (plus knowledge/conversations/billing linked by chatbotId) so the
// backend's userservices migration can be checked against them.
// See check-userservices-migration.js.
db = db.getSiblingDB('lm_e2e');
const owner = ObjectId('6600000000000000000000a1');
db.users.updateOne({ _id: owner }, { $set: { name: 'Legacy Owner', email: 'legacy@x.io', role: 'user', status: 'active', isDeleted: false, auth: { provider: 'local', isEmailVerified: true }, plan: { planType: 'trial' } } }, { upsert: true });
const pro = ObjectId('6600000000000000000000b1');
const awaiting = ObjectId('6600000000000000000000b2');
const custom = ObjectId('6600000000000000000000b3');
const reminded = ObjectId('6600000000000000000000b4');
db.chatbots.drop();
db.chatbots.insertMany([
  {
    _id: pro, userId: owner, name: 'Legacy Pro Cafe', description: 'desc', persona: 'warm', bookingUrl: 'https://book.example.com/legacy',
    language: 'en', template: 'restaurant', status: 'active', fallbackMessage: 'Legacy fallback', fallbackMessage_ar: 'رد',
    humanHandoff: true, embedKey: 'legacy-key-pro',
    channels: { website: { enabled: true, customColor: '#123456', welcomeMessage: 'Hi' }, whatsapp: { enabled: true, phoneNumberId: 'PN9', accessToken: 'tok', appSecret: 'sec', verifyToken: 'vt', webhookVerified: true }, instagram: { enabled: false } },
    outlets: [{ name: 'Marina', city: 'Dubai', country: 'UAE', areaTags: ['JBR'], deliveryPlatforms: ['Talabat'], isOnlineOnly: false }],
    billing: { setupFee: 50, monthlyFee: 120, currency: 'USD', tier: 'pro', status: 'active', trialEndsAt: new Date('2026-10-01'), setupPaidAt: new Date('2026-10-02'), lastBillingDate: new Date('2026-11-01'), nextBillingDate: new Date('2026-12-01'), notes: 'multi-location discount', trialReminderSent: true },
    chatModelConfig: { provider: 'openai', model: 'auto' }, embeddingModelConfig: { provider: 'openai', model: 'auto' },
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-11-01'),
  },
  {
    _id: awaiting, userId: owner, name: 'Legacy Clinic', template: 'clinic', status: 'draft', embedKey: 'legacy-key-clinic',
    channels: {}, outlets: [], billing: { setupFee: 100, monthlyFee: 59, tier: 'basic', status: 'awaiting_setup_payment', trialEndsAt: new Date('2026-12-30') },
    createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-05'),
  },
  {
    _id: custom, userId: owner, name: 'Legacy Custom', template: 'custom', status: 'inactive', embedKey: 'legacy-key-custom',
    createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
  },
  {
    _id: reminded, userId: owner, name: 'Legacy Gym', template: 'gym', status: 'active', embedKey: 'legacy-key-gym',
    billing: { tier: 'basic', status: 'trial', trialEndsAt: new Date(Date.now() + 3 * 864e5), trialReminderSent: true, monthlyFee: 79 },
    createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-14'),
  },
]);
db.knowledgebases.insertMany([
  { chatbotId: pro, type: 'faq', question: 'Do you have parking?', answer: 'Free valet parking.', embedding: [] },
  { chatbotId: pro, type: 'faq', question: 'Is it halal?', answer: 'All halal.', embedding: [] },
]);
db.conversations.insertOne({ chatbotId: pro, sessionId: 'old-session', channel: 'website', messages: [{ role: 'user', content: 'hi', timestamp: new Date() }], status: 'active' });
db.billings.insertOne({ userId: owner, chatbotId: pro, moduleType: 'chatbot', moduleName: 'Legacy Pro Cafe', amount: 120, status: 'paid', type: 'subscription', isDeleted: false, billingDate: new Date() });
db.knowledgebases.createIndex({ chatbotId: 1 });
db.conversations.createIndex({ chatbotId: 1, sessionId: 1 });
print('seeded');
