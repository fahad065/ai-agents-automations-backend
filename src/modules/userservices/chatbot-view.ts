import { ChatbotUserService } from './schemas/userservice.schema';

// Chatbots are stored as userservices rows (type 'chatbot') since
// 2026-11-17. The HTTP API keeps answering in the chatbot shape the
// dashboard, widget and admin pages already use, so no client had to change:
// `toChatbotView()` flattens a row into that shape, and `CHATBOT_FIELD_PATHS`
// says where each editable chatbot field now lives.

// Catalog slug ↔ the short template key the dashboard uses
// (src/lib/chatbot-templates.ts on the frontend).
export const TEMPLATE_TO_SERVICE_SLUG: Record<string, string> = {
  restaurant: 'restaurant-chatbot',
  real_estate: 'real-estate-chatbot',
  clinic: 'clinic-chatbot',
  gym: 'gym-chatbot',
  salon: 'salon-chatbot',
  hotel: 'hotel-chatbot',
  auto_dealership: 'auto-dealership-chatbot',
  home_services: 'home-services-chatbot',
};
export const SERVICE_SLUG_TO_TEMPLATE: Record<string, string> = Object.fromEntries(
  Object.entries(TEMPLATE_TO_SERVICE_SLUG).map(([template, slug]) => [slug, template]),
);

// Chatbot field (as the API knows it) → path on the userservices row.
export const CHATBOT_FIELD_PATHS: Record<string, string> = {
  name: 'name',
  status: 'config.botStatus',
  description: 'config.description',
  persona: 'config.persona',
  bookingUrl: 'config.bookingUrl',
  language: 'config.language',
  fallbackMessage: 'config.fallbackMessage',
  fallbackMessage_ar: 'config.fallbackMessage_ar',
  humanHandoff: 'config.humanHandoff',
  channels: 'config.channels',
  outlets: 'config.outlets',
  chatModelConfig: 'config.chatModelConfig',
};

// What the dashboard/chat engine read. `billing` keeps its old field names.
export interface ChatbotView {
  _id: any;
  userId: any;
  serviceId?: any;
  name: string;
  template?: string;
  status: 'draft' | 'active' | 'inactive';
  description?: string;
  persona?: string;
  bookingUrl?: string;
  language: 'en' | 'ar' | 'both';
  fallbackMessage: string;
  fallbackMessage_ar: string;
  humanHandoff: boolean;
  embedKey: string;
  channels: any;
  outlets: any[];
  chatModelConfig: any;
  billing: {
    tier: 'basic' | 'pro' | 'custom';
    monthlyFee: number;
    setupFee: number;
    currency: string;
    status: string;
    trialEndsAt?: Date;
    nextBillingDate?: Date;
    trialReminderSent: boolean;
    isFreeForever: boolean;
    notes?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const plain = (v: any) => (v && typeof v.toObject === 'function' ? v.toObject() : v);

// `isAdmin` controls whether admin-only deal notes are included.
// serviceId may be populated ({_id, slug}) or a bare id.
export function toChatbotView(row: ChatbotUserService | any, isAdmin = false): ChatbotView {
  const r = plain(row) || {};
  const c = r.config || {};
  const service = r.serviceId && typeof r.serviceId === 'object' && 'slug' in r.serviceId ? r.serviceId : null;
  const view: ChatbotView = {
    _id: r._id,
    userId: r.userId,
    serviceId: service ? service._id : r.serviceId,
    name: r.name,
    template: service ? SERVICE_SLUG_TO_TEMPLATE[service.slug] : r.template,
    status: c.botStatus || 'draft',
    description: c.description,
    persona: c.persona,
    bookingUrl: c.bookingUrl,
    language: c.language || 'both',
    fallbackMessage: c.fallbackMessage,
    fallbackMessage_ar: c.fallbackMessage_ar,
    humanHandoff: !!c.humanHandoff,
    embedKey: c.embedKey,
    channels: c.channels || {},
    outlets: c.outlets || [],
    chatModelConfig: c.chatModelConfig || {},
    billing: {
      tier: r.plan?.tier || 'basic',
      monthlyFee: r.plan?.monthlyFee || 0,
      setupFee: r.plan?.setupFee || 0,
      currency: r.plan?.currency || 'USD',
      status: r.status || 'trial',
      trialEndsAt: r.trialEndDate,
      nextBillingDate: r.nextRenewalDate,
      trialReminderSent: !!r.trialReminderSentAt,
      isFreeForever: !!r.isFreeForever,
      ...(isAdmin && r.adminNotes ? { notes: r.adminNotes } : {}),
    },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  return view;
}
