import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ChatService } from './chat.service';
import { ChatThrottlerGuard } from './chat-throttler.guard';

@Controller()
export class ChatController {
  constructor(private chatService: ChatService) {}

  // Rate-limited per chatbot (embedKey), not per caller IP — see
  // ChatThrottlerGuard. Generous enough for many real concurrent visitors
  // on one bot, but caps how much any single bot's traffic can consume of
  // the shared Mongo pool / event loop other tenants' bots also run on.
  @Post('chat/:embedKey')
  @Public()
  @UseGuards(ChatThrottlerGuard)
  @Throttle({ chat: { limit: 40, ttl: 10000 } })
  @HttpCode(200)
  async chat(
    @Param('embedKey') embedKey: string,
    @Body() body: { sessionId: string; message: string; channel?: string },
  ) {
    const channel = (body.channel as any) || 'website';
    return this.chatService.chat(embedKey, body.sessionId, body.message, channel);
  }

  // Public widget config — chatbot-widget.js fetches this on load so a
  // dashboard color/welcome-message/name change is live on every
  // already-embedded site immediately, with no re-paste needed. Same
  // per-embedKey throttle as the chat endpoint.
  @Get('chat/:embedKey/config')
  @Public()
  @UseGuards(ChatThrottlerGuard)
  @Throttle({ chat: { limit: 40, ttl: 10000 } })
  async getConfig(@Param('embedKey') embedKey: string) {
    return this.chatService.getPublicConfig(embedKey);
  }

  // WhatsApp webhook verification
  @Get('webhooks/whatsapp/:embedKey')
  @Public()
  verifyWhatsapp(
    @Param('embedKey') embedKey: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: any,
  ) {
    const result = this.chatService.verifyWhatsappWebhook(mode, token, challenge, embedKey);
    if (result !== null) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  // WhatsApp webhook handler
  @Post('webhooks/whatsapp/:embedKey')
  @Public()
  @HttpCode(200)
  async handleWhatsapp(@Param('embedKey') embedKey: string, @Body() body: any) {
    await this.chatService.handleWhatsappWebhook(embedKey, body);
    return { status: 'ok' };
  }

  // Instagram webhook verification
  @Get('webhooks/instagram/:embedKey')
  @Public()
  verifyInstagram(
    @Param('embedKey') embedKey: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: any,
  ) {
    const result = this.chatService.verifyInstagramWebhook(mode, token, challenge, embedKey);
    if (result !== null) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  // Instagram webhook handler
  @Post('webhooks/instagram/:embedKey')
  @Public()
  @HttpCode(200)
  async handleInstagram(@Param('embedKey') embedKey: string, @Body() body: any) {
    await this.chatService.handleInstagramWebhook(embedKey, body);
    return { status: 'ok' };
  }
}
