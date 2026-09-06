import { ChatService } from './chat.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

// Exercises the lead-capture behaviour (name/phone/email capture + owner
// notification) added on top of the live chat engine, on a restaurant-bot
// scenario, for both Basic and Pro tiers — this sandbox has no network path
// to OpenAI or a real database (see backend CLAUDE.md), so the AI reply
// itself can't be generated live here; what IS verified directly against
// the real code is everything that doesn't require reaching OpenAI:
// the billing gate, the WhatsApp-phone auto-capture, the notify-once guard,
// and extractLeadInfo()'s early return once nothing is missing.
function makeChatbot(overrides: any = {}) {
  return {
    _id: 'bot1',
    userId: 'owner1',
    name: 'Sunset Cafe Bot',
    status: 'active',
    fallbackMessage: "Sorry, let me get someone to help you.",
    language: 'en',
    persona: 'Warm and upbeat',
    billing: { tier: 'basic', status: 'trial', trialEndsAt: new Date(Date.now() + 10 * 86400000) },
    ...overrides,
  };
}

function makeConversation(overrides: any = {}) {
  const convo: any = {
    _id: 'convo1',
    chatbotId: 'bot1',
    sessionId: overrides.sessionId || 'session-1',
    channel: overrides.channel || 'website',
    messages: [],
    visitorName: undefined,
    visitorEmail: undefined,
    visitorPhone: undefined,
    leadNotifiedAt: undefined,
    ...overrides,
  };
  convo.save = jest.fn().mockResolvedValue(convo);
  return convo;
}

function makeService(opts: {
  chatbot: any;
  existingConversation?: any;
  hasOpenAiKey?: boolean;
}) {
  const { chatbot, existingConversation = null, hasOpenAiKey = false } = opts;

  const createdConversations: any[] = [];
  const chatbotModel: any = { findOne: jest.fn().mockResolvedValue(chatbot) };
  const knowledgeBaseModel: any = {
    find: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue([]) }),
  };
  const conversationModel: any = {
    findOne: jest.fn().mockResolvedValue(existingConversation),
    create: jest.fn().mockImplementation(async (doc: any) => {
      const convo = makeConversation(doc);
      createdConversations.push(convo);
      return convo;
    }),
  };
  const userModel: any = {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Fahad', email: 'fahad@test.com' }) }),
    }),
  };
  const apiKeysService: any = {
    getDecryptedKey: hasOpenAiKey
      ? jest.fn().mockResolvedValue('sk-dummy-not-a-real-key')
      : jest.fn().mockRejectedValue(new Error('no key on file')),
  };
  const notificationsService: any = { create: jest.fn().mockResolvedValue(undefined) };
  const emailService: any = { sendChatbotLeadEmail: jest.fn().mockResolvedValue(undefined) };

  const service = new ChatService(
    chatbotModel,
    knowledgeBaseModel,
    conversationModel,
    userModel,
    apiKeysService,
    notificationsService,
    emailService,
  );

  return { service, chatbotModel, conversationModel, notificationsService, emailService, createdConversations };
}

describe('ChatService — restaurant bot lead capture (Basic + Pro, no Meta needed)', () => {
  it('billing gate: an expired trial never reaches OpenAI or creates a conversation', async () => {
    const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'trial', trialEndsAt: new Date(Date.now() - 86400000) } });
    const { service, conversationModel } = makeService({ chatbot });

    const result = await service.chat('embed1', 'session-1', 'Hi, table for two tonight?', 'website');

    expect(result.reply).toBe(chatbot.fallbackMessage);
    expect(conversationModel.findOne).not.toHaveBeenCalled();
  });

  it('website channel, no OpenAI key: degrades to fallbackMessage, no lead notification fires', async () => {
    const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'active' } });
    const { service, notificationsService, emailService, createdConversations } = makeService({ chatbot, hasOpenAiKey: false });

    const result = await service.chat('embed1', 'session-1', 'What time do you open?', 'website');

    expect(result.reply).toBe(chatbot.fallbackMessage);
    expect(createdConversations[0].visitorPhone).toBeUndefined();
    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(emailService.sendChatbotLeadEmail).not.toHaveBeenCalled();
  });

  it('WhatsApp channel: the phone number is captured immediately (no OpenAI key needed) and the owner is notified once', async () => {
    const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'active' } }); // Basic — deliberately not tier-gated
    const { service, notificationsService, emailService, createdConversations } = makeService({ chatbot, hasOpenAiKey: false });

    const result = await service.chat('embed1', '971501234567', 'I want to book a table for 4', 'whatsapp');

    expect(result.reply).toBe(chatbot.fallbackMessage); // no key -> no AI, but capture still works
    const convo = createdConversations[0];
    expect(convo.visitorPhone).toBe('971501234567');
    expect(convo.leadNotifiedAt).toBeInstanceOf(Date);

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner1',
        type: NotificationType.CHATBOT_LEAD,
        actionUrl: '/dashboard/chatbots/bot1?tab=conversations',
      }),
    );
    expect(emailService.sendChatbotLeadEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendChatbotLeadEmail).toHaveBeenCalledWith(
      { name: 'Fahad', email: 'fahad@test.com' },
      expect.objectContaining({ visitorPhone: '971501234567', chatbotName: 'Sunset Cafe Bot' }),
    );
  });

  it('a second WhatsApp message in the same conversation does not notify again', async () => {
    const chatbot = makeChatbot({ billing: { tier: 'pro', status: 'active' } }); // also verified on Pro
    const existing = makeConversation({
      sessionId: '971501234567',
      channel: 'whatsapp',
      visitorPhone: '971501234567',
      leadNotifiedAt: new Date(Date.now() - 60000),
      messages: [{ role: 'user', content: 'first message', timestamp: new Date() }],
    });
    const { service, notificationsService, emailService } = makeService({ chatbot, existingConversation: existing, hasOpenAiKey: false });

    await service.chat('embed1', '971501234567', 'Actually make it 6 people', 'whatsapp');

    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(emailService.sendChatbotLeadEmail).not.toHaveBeenCalled();
  });

  it('extractLeadInfo() short-circuits (no OpenAI call) once name/email/phone are all already known', async () => {
    const chatbot = makeChatbot();
    const { service } = makeService({ chatbot, hasOpenAiKey: true });
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await (service as any).extractLeadInfo(
      'sk-dummy',
      [{ role: 'user', content: 'anything' }],
      { name: 'Ahmed', email: 'ahmed@example.com', phone: '+971500000000' },
    );

    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
