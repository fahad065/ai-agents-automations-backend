db = db.getSiblingDB('lm_e2e');
const out = [];
const ok = (name, cond, extra) => out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const flatUser = ['phoneNumber','country','avatar','timezone','company','provider','googleId','isEmailVerified','refreshToken','passwordResetToken','planType','trialStartDate','trialEndDate','isFreeForever','totalBilled','welcomeDay1Sent','welcomeDay3Sent','welcomeDay7Sent','deletionRequestedAt','pendingDeletionAt','deletionReminderSent'];

const u = db.users.findOne({ email: 'old@x.io' });
ok('user: profile moved', u.profile.phoneNumber === '+15551234567' && u.profile.country === 'Kenya' && u.profile.timezone === 'Africa/Nairobi' && u.profile.company === 'Old Co' && u.profile.avatar === 'https://x/a.png');
ok('user: auth moved', u.auth.provider === 'google' && u.auth.googleId === 'g-123' && u.auth.isEmailVerified === true && u.auth.refreshToken === 'hashed-refresh' && u.auth.passwordResetToken === 'reset-tok');
ok('user: plan moved (incl. totalBilled 158)', u.plan.planType === 'paid' && u.plan.totalBilled === 158 && u.plan.trialEndDate instanceof Date && u.plan.isFreeForever === false);
ok('user: welcomeEmails moved', u.welcomeEmails.day1Sent === true && u.welcomeEmails.day3Sent === true && u.welcomeEmails.day7Sent === false);
ok('user: deletion moved', u.deletion.pendingAt instanceof Date && u.deletion.requestedAt instanceof Date && u.deletion.reminderSent === false);
ok('user: no old flat fields left', flatUser.every((f) => !(f in u)), flatUser.filter((f) => f in u).join(','));
ok('user: name/email/role/onboarding untouched', u.name === 'Old Flat User' && u.role === 'user' && u.onboarding.contentNiche === 'food');

const h = db.users.findOne({ email: 'half@x.io' });
ok('user: existing grouped value wins over stale flat', h.profile.phoneNumber === '+1999 new' && !('phoneNumber' in h));
ok('user: no nulls written for missing fields', !('avatar' in h.profile) && !('googleId' in (h.auth || {})));

const idx = db.users.getIndexes().map((i) => i.name);
ok('user: old indexes dropped, new ones present', !idx.includes('googleId_1') && !idx.includes('planType_1') && idx.includes('auth.googleId_1') && idx.includes('plan.planType_1'), idx.join(','));

const s = db.services.findOne({ slug: 'restaurant-chatbot' });
ok('service: content moved', s.content.tagline === 'Old tagline' && s.content.capabilities_ar[0] === 'أسئلة' && s.content.heroStats[0].label_ar === 'الرد' && s.content.demoVideoUrl === 'https://x/v.mp4');
ok('service: seo/display/pipeline moved', s.seo.metaTitle === 'Meta T' && s.display.icon === '🍽️' && s.display.sortOrder === 1 && s.pipeline.pipelineType === 'hospitality' && s.pipeline.requiredApiKeys[0] === 'openai');
ok('service: pricingTiers → pricing.tiers, pricing kept', s.pricing.tiers.length === 2 && s.pricing.tiers[1].monthly === 120 && s.pricing.monthly === 79 && s.pricing.hasCustomPlan === true);
const flatSvc = ['tagline','description','capabilities','heroStats','featureCards','faq','demoVideoUrl','metaTitle','icon','color','badge','sortOrder','platforms','pipelineType','pipelineCategory','components','requiredApiKeys','defaultConfig','pricingTiers'];
ok('service: no old flat fields / badge left', flatSvc.every((f) => !(f in s)), flatSvc.filter((f) => f in s).join(','));
ok('service: admin-edited name not overwritten by seed', s.name === 'Restaurant Menu Bot');
const t = db.services.findOne({ slug: 'tiktok-agent' });
ok('service: badge "Coming Soon" + active → status coming_soon', t.status === 'coming_soon');
const seeded = db.services.find({ slug: { $nin: ['restaurant-chatbot', 'tiktok-agent'] } }).toArray();
ok('service: freshly seeded docs are grouped too', seeded.length === 20 && seeded.every((d) => d.content && d.display && d.pipeline && !('badge' in d) && !('tagline' in d) && Array.isArray(d.pricing.tiers)));
const sidx = db.services.getIndexes().map((i) => i.name);
ok('service: old compound index dropped', !sidx.includes('type_1_status_1_isDeleted_1_sortOrder_1'), sidx.join(','));
print(out.join('\n'));
