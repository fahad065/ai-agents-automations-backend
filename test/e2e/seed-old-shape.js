// Runs inside mongosh. Inserts documents in the PRE-2026-11-16 flat shape so
// the real backend's onModuleInit migrations can be checked against them.
db = db.getSiblingDB('lm_e2e');
db.users.drop(); db.services.drop();
db.users.createIndex({ googleId: 1 }, { sparse: true });
db.users.createIndex({ planType: 1 });

db.users.insertMany([
  {
    name: 'Old Flat User', email: 'old@x.io', role: 'user', status: 'active', isDeleted: false,
    phoneNumber: '+15551234567', country: 'Kenya', avatar: 'https://x/a.png', timezone: 'Africa/Nairobi', company: 'Old Co',
    provider: 'google', googleId: 'g-123', isEmailVerified: true, refreshToken: 'hashed-refresh',
    passwordResetToken: 'reset-tok', passwordResetExpires: new Date(Date.now() + 3600e3),
    planType: 'paid', trialStartDate: new Date('2026-09-01'), trialEndDate: new Date('2026-10-01'),
    isFreeForever: false, totalBilled: 158,
    welcomeDay1Sent: true, welcomeDay3Sent: true, welcomeDay7Sent: false,
    deletionRequestedAt: new Date('2026-11-10'), pendingDeletionAt: new Date('2026-11-18'), deletionReminderSent: false,
    onboarding: { contentNiche: 'food' },
    notifyPreferences: { onComplete: true, onFail: true, trialExpiry: true, billing: true, emailUpdates: false },
  },
  {
    // Mid-deploy edge case: already has a grouped value AND a stale flat one.
    name: 'Half Migrated', email: 'half@x.io', role: 'user', status: 'active', isDeleted: false,
    phoneNumber: '+1000 stale', profile: { phoneNumber: '+1999 new' },
    planType: 'trial', onboarding: {}, notifyPreferences: {},
  },
]);

db.services.insertMany([
  {
    type: 'chatbot', name: 'Restaurant Menu Bot', slug: 'restaurant-chatbot', status: 'active', isDeleted: false,
    tagline: 'Old tagline', description: 'Old description', capabilities: ['Menu Q&A'], capabilities_ar: ['أسئلة'],
    heroStats: [{ label: 'Replies', value: 'Instant', label_ar: 'الرد' }],
    featureCards: [{ icon: '📋', title: 'Menu', description: 'd' }], howItWorks: [], faq: [{ question: 'Q', answer: 'A' }],
    demoVideoUrl: 'https://x/v.mp4', metaTitle: 'Meta T',
    icon: '🍽️', color: '#f59e0b', badge: 'Live', sortOrder: 1, platforms: ['website'],
    pipelineType: 'hospitality', pipelineCategory: 'standalone', components: [], requiredApiKeys: ['openai'], defaultConfig: {},
    nicheSlug: 'hospitality', include: [],
    pricing: { monthly: 79, annual: 63, features: ['Basic bullet'], hasCustomPlan: true },
    pricingTiers: [
      { key: 'basic', monthly: 79, annual: 63, features: ['Basic bullet'] },
      { key: 'pro', monthly: 120, annual: 96, features: ['Pro bullet'] },
    ],
  },
  {
    // badge said "Coming Soon" while status was active → should become coming_soon
    type: 'agent', name: 'Tiktok Agent', slug: 'tiktok-agent', status: 'active', isDeleted: false,
    tagline: 't', icon: '🎵', color: '#000', badge: 'Coming Soon', sortOrder: 5,
    pipelineType: 'tiktok', pipelineCategory: 'standalone', pricing: { monthly: 29, annual: 23, features: [] }, pricingTiers: [],
  },
]);
db.services.createIndex({ type: 1, status: 1, isDeleted: 1, sortOrder: 1 });
print('seeded old-shape docs');
