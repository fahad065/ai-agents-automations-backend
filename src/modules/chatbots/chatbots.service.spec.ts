import { ForbiddenException } from '@nestjs/common';
import { ChatbotsService } from './chatbots.service';

// Exercises the real Basic-vs-Pro gating logic on a restaurant-template
// chatbot end to end, using dummy WhatsApp/Instagram credentials (this
// sandbox has no network path to a real Meta app or a live database — see
// backend CLAUDE.md's sandbox-limitation notes — so this drives the actual
// service methods directly against mocked Mongoose models instead of a
// running server, which is the strongest verification available here).
const BOT_ID = '507f1f77bcf86cd799439011';

function makeChatbot(overrides: any = {}) {
  const bot: any = {
    _id: BOT_ID,
    userId: { toString: () => 'owner1' },
    name: 'Sunset Cafe Bot',
    template: 'restaurant',
    status: 'active',
    channels: {
      website: { enabled: true, customColor: '#7c3aed' },
      whatsapp: { enabled: false, phoneNumberId: '', accessToken: '' },
      instagram: { enabled: false, accountId: '', accessToken: '' },
    },
    billing: { tier: 'basic', status: 'trial', trialEndsAt: new Date(Date.now() + 10 * 86400000) },
    ...overrides,
  };
  bot.save = jest.fn().mockResolvedValue(bot);
  return bot;
}

function makeService(chatbot: any, userIsVerified = true) {
  const chatbotModel: any = { findById: jest.fn().mockResolvedValue(chatbot) };
  const knowledgeBaseModel: any = {};
  const conversationModel: any = {};
  const userModel: any = {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ isEmailVerified: userIsVerified }) }),
    }),
  };
  const apiKeysService: any = {};
  const billingService: any = {};
  const emailService: any = {};
  const modulesService: any = {};

  return new ChatbotsService(
    chatbotModel,
    knowledgeBaseModel,
    conversationModel,
    userModel,
    apiKeysService,
    billingService,
    emailService,
    modulesService,
  );
}

const DUMMY_WHATSAPP = { phoneNumberId: '109876543210987', accessToken: 'DUMMY_WA_ACCESS_TOKEN_123' };
const DUMMY_INSTAGRAM = { accountId: '17841400000000000', accessToken: 'DUMMY_IG_ACCESS_TOKEN_456' };

describe('ChatbotsService — Basic vs Pro tier gating (restaurant bot)', () => {
  describe('Basic tier', () => {
    it('blocks enabling WhatsApp with a clear upgrade error, even with valid-looking dummy credentials', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'trial' } });
      const service = makeService(chatbot);

      await expect(
        service.update('bot1', 'owner1', {
          channels: { whatsapp: { enabled: true, ...DUMMY_WHATSAPP } },
        }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update('bot1', 'owner1', {
          channels: { whatsapp: { enabled: true, ...DUMMY_WHATSAPP } },
        }),
      ).rejects.toThrow(/Pro plan/);
    });

    it('blocks enabling Instagram the same way', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'trial' } });
      const service = makeService(chatbot);

      await expect(
        service.update('bot1', 'owner1', {
          channels: { instagram: { enabled: true, ...DUMMY_INSTAGRAM } },
        }),
      ).rejects.toThrow(/Pro plan/);
    });

    it('still allows editing the website channel and other basic fields', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'trial' } });
      const service = makeService(chatbot);

      const result = await service.update('bot1', 'owner1', {
        persona: 'Warm, upbeat, knows the full menu',
        channels: { website: { enabled: true, customColor: '#ff6b35' } },
      });

      expect(result.persona).toBe('Warm, upbeat, knows the full menu');
      expect(result.channels.website.customColor).toBe('#ff6b35');
      expect(chatbot.save).toHaveBeenCalled();
    });

    it('blocks the Analytics endpoint with a clear upgrade error', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'basic', status: 'trial' } });
      const service = makeService(chatbot);

      await expect(service.getAnalytics(BOT_ID, 'owner1')).rejects.toThrow(/Pro plan/);
    });

    it('blocks going live if the owner has not verified their email', async () => {
      const chatbot = makeChatbot({ status: 'draft', billing: { tier: 'basic', status: 'trial' } });
      const service = makeService(chatbot, /* userIsVerified */ false);

      await expect(
        service.update('bot1', 'owner1', { status: 'active' }),
      ).rejects.toThrow(/verify your email/i);
    });
  });

  describe('Pro tier', () => {
    it('allows enabling WhatsApp with dummy credentials and persists them', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'pro', status: 'active' } });
      const service = makeService(chatbot);

      const result = await service.update('bot1', 'owner1', {
        channels: { whatsapp: { enabled: true, ...DUMMY_WHATSAPP } },
      });

      expect(result.channels.whatsapp.enabled).toBe(true);
      expect(result.channels.whatsapp.phoneNumberId).toBe(DUMMY_WHATSAPP.phoneNumberId);
      expect(result.channels.whatsapp.accessToken).toBe(DUMMY_WHATSAPP.accessToken);
    });

    it('allows enabling Instagram with dummy credentials and persists them', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'pro', status: 'active' } });
      const service = makeService(chatbot);

      const result = await service.update('bot1', 'owner1', {
        channels: { instagram: { enabled: true, ...DUMMY_INSTAGRAM } },
      });

      expect(result.channels.instagram.enabled).toBe(true);
      expect(result.channels.instagram.accountId).toBe(DUMMY_INSTAGRAM.accountId);
    });

    it('returns real analytics instead of throwing', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'pro', status: 'active' } });
      const conversationModel: any = {
        find: jest.fn().mockResolvedValue([
          { messages: [{}, {}], status: 'closed', channel: 'website' },
          { messages: [{}, {}, {}], status: 'handoff', channel: 'whatsapp' },
        ]),
      };
      const service = makeService(chatbot);
      // Swap in a conversationModel with real find() data for this one test.
      (service as any).conversationModel = conversationModel;

      const analytics = await service.getAnalytics(BOT_ID, 'owner1');
      expect(analytics.totalConversations).toBe(2);
      expect(analytics.totalMessages).toBe(5);
      expect(analytics.handoffs).toBe(1);
      expect(analytics.byChannel).toEqual({ website: 1, whatsapp: 1, instagram: 0 });
    });
  });

  describe('Custom tier', () => {
    it('is treated the same as Pro for channel gating (only Basic is restricted)', async () => {
      const chatbot = makeChatbot({ billing: { tier: 'custom', status: 'active' } });
      const service = makeService(chatbot);

      const result = await service.update('bot1', 'owner1', {
        channels: { whatsapp: { enabled: true, ...DUMMY_WHATSAPP } },
      });
      expect(result.channels.whatsapp.enabled).toBe(true);
    });
  });
});
