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
  Req,
  Headers,
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
    // Always 'website': WhatsApp/Instagram only arrive via their signed
    // webhooks, so a caller can't claim another channel to skip the Pro gate.
    return this.chatService.chat(embedKey, body.sessionId, body.message, 'website');
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

  // Meta webhook handshakes — succeed only with this bot's own verifyToken.
  @Get('webhooks/whatsapp/:embedKey')
  @Public()
  verifyWhatsapp(@Param('embedKey') embedKey: string, @Query() q: any, @Res() res: any) {
    return this.verifyMeta('whatsapp', embedKey, q, res);
  }

  @Get('webhooks/instagram/:embedKey')
  @Public()
  verifyInstagram(@Param('embedKey') embedKey: string, @Query() q: any, @Res() res: any) {
    return this.verifyMeta('instagram', embedKey, q, res);
  }

  private async verifyMeta(channel: 'whatsapp' | 'instagram', embedKey: string, q: any, res: any) {
    const result = await this.chatService.verifyMetaWebhook(
      channel, embedKey, q['hub.mode'], q['hub.verify_token'], q['hub.challenge'],
    );
    if (result !== null) res.status(200).type('text/plain').send(result);
    else res.status(403).send('Forbidden');
  }

  // Incoming WhatsApp messages. 403 unless signed by the client's Meta app.
  @Post('webhooks/whatsapp/:embedKey')
  @Public()
  async handleWhatsapp(
    @Param('embedKey') embedKey: string,
    @Body() body: any,
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string,
    @Res() res: any,
  ) {
    const ok = await this.chatService.handleWhatsappWebhook(embedKey, body, req.rawBody, signature);
    res.status(ok ? 200 : 403).json(ok ? { status: 'ok' } : { status: 'forbidden' });
  }

  // Incoming Instagram DMs. 403 unless signed by the client's Meta app.
  @Post('webhooks/instagram/:embedKey')
  @Public()
  async handleInstagram(
    @Param('embedKey') embedKey: string,
    @Body() body: any,
    @Req() req: any,
    @Headers('x-hub-signature-256') signature: string,
    @Res() res: any,
  ) {
    const ok = await this.chatService.handleInstagramWebhook(embedKey, body, req.rawBody, signature);
    res.status(ok ? 200 : 403).json(ok ? { status: 'ok' } : { status: 'forbidden' });
  }
}
