import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits the public /chat/:embedKey endpoint per chatbot (embedKey)
 * instead of per client IP — the default tracker. Per-IP tracking is the
 * wrong unit here: many real visitors to one bot can share an IP (office
 * wifi, mobile carrier NAT) while a single bot getting hammered would
 * otherwise consume the same shared capacity every other tenant's chatbot
 * runs on, with no isolation between them.
 */
@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.params?.embedKey || req.ip;
  }
}
