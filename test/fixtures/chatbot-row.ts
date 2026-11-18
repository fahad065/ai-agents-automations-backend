import { TEMPLATE_TO_SERVICE_SLUG } from '../../src/modules/userservices/chatbot-view';

// Test fixture: builds a `userservices` chatbot row from the flat chatbot
// shape the unit tests are written in (name, template, billing{...},
// persona, channels, …). Originally the one-time chatbots → userservices
// migration (removed 2026-11-18 once production was migrated); the field
// mapping is unchanged, so fixtures match real rows.
const STATUS_MAP: Record<string, string> = {
  trial: 'trial',
  active: 'active',
  past_due: 'past_due',
  suspended: 'suspended',
  awaiting_setup_payment: 'past_due',
};

function compact<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function toUserServiceRow(b: any, serviceIdBySlug: Map<string, any>) {
  const billing = b.billing || {};
  const slug = b.template ? TEMPLATE_TO_SERVICE_SLUG[b.template] : undefined;
  return compact({
    _id: b._id,
    userId: b.userId,
    type: 'chatbot',
    serviceId: slug ? serviceIdBySlug.get(slug) : undefined,
    name: b.name,
    status: STATUS_MAP[billing.status] || 'trial',
    isFreeForever: false,
    isDeleted: false,
    subscriptionStartDate: b.createdAt || new Date(),
    trialEndDate: billing.trialEndsAt,
    nextRenewalDate: billing.nextBillingDate,
    plan: {
      tier: billing.tier || 'basic',
      monthlyFee: billing.monthlyFee || 0,
      setupFee: billing.setupFee || 0,
      currency: billing.currency || 'USD',
    },
    adminNotes: billing.notes,
    trialReminderSentAt: billing.trialReminderSent ? b.updatedAt || new Date() : undefined,
    config: compact({
      botStatus: b.status || 'draft',
      description: b.description,
      persona: b.persona,
      bookingUrl: b.bookingUrl,
      language: b.language || 'both',
      fallbackMessage: b.fallbackMessage,
      fallbackMessage_ar: b.fallbackMessage_ar,
      humanHandoff: !!b.humanHandoff,
      embedKey: b.embedKey,
      channels: b.channels || {},
      outlets: b.outlets || [],
      chatModelConfig: b.chatModelConfig,
    }),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  });
}
