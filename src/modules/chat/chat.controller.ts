import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Res,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ChatService } from './chat.service';

@Controller()
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('chat/:embedKey')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  async chat(
    @Param('embedKey') embedKey: string,
    @Body() body: { sessionId: string; message: string; channel?: string },
  ) {
    const channel = (body.channel as any) || 'website';
    return this.chatService.chat(embedKey, body.sessionId, body.message, channel);
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
