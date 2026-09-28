import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatbotDocument = Chatbot & Document;

@Schema({ _id: false })
export class WebsiteChannel {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  customColor?: string;

  @Prop()
  welcomeMessage?: string;

  @Prop()
  welcomeMessage_ar?: string;
}

@Schema({ _id: false })
export class WhatsappChannel {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  phoneNumberId?: string;

  @Prop()
  accessToken?: string;

  @Prop()
  verifyToken?: string;

  @Prop({ default: false })
  webhookVerified: boolean;
}

@Schema({ _id: false })
export class InstagramChannel {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  accountId?: string;

  @Prop()
  accessToken?: string;

  @Prop({ default: false })
  webhookVerified: boolean;
}

@Schema({ _id: false })
export class ChatbotChannels {
  @Prop({ type: WebsiteChannel, default: () => ({}) })
  website: WebsiteChannel;

  @Prop({ type: WhatsappChannel, default: () => ({}) })
  whatsapp: WhatsappChannel;

  @Prop({ type: InstagramChannel, default: () => ({}) })
  instagram: InstagramChannel;
}

// A single physical/delivery-coverage location for a multi-branch business
// (e.g. a restaurant chain with outlets across several cities, or even
// countries). Generic on purpose — not tied to any one template or
// customer — so any chatbot with more than one location can use it, not
// just restaurants. `areaTags` exists specifically for delivery-only or
// wide-coverage locations (e.g. a single kitchen that delivers to several
// neighborhoods via Talabat/Noon/etc): a customer asking "do you deliver
// to X" or "which branch is near X" can be answered correctly even when
// X isn't the outlet's own address. See ChatService.buildSystemPrompt(),
// which includes the full outlet list in every reply (not subject to the
// knowledge-base's top-4 similarity ranking) so the model can reason over
// all locations at once rather than possibly missing the relevant one.
@Schema({ _id: true })
export class Outlet {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  country: string;

  @Prop()
  address?: string;

  // Extra area/neighborhood names this outlet serves or is known by —
  // beyond its own city/address — so "near Business Bay" can match a
  // delivery-only kitchen based in Al Quoz, for example.
  @Prop({ type: [String], default: [] })
  areaTags: string[];

  @Prop()
  phone?: string;

  // Free text on purpose — real-world hours ("11am-1am daily", "Fri-Sat
  // until 2am, rest of week until midnight") don't fit a simple schema
  // cleanly, and every other free-text field in this schema (persona,
  // fallbackMessage) already takes the same approach.
  @Prop()
  hours?: string;

  @Prop({ type: [String], default: [] })
  deliveryPlatforms: string[];

  @Prop()
  mapUrl?: string;

  @Prop({ default: false })
  isOnlineOnly: boolean;

  @Prop()
  notes?: string;
}
const OutletSchema = SchemaFactory.createForClass(Outlet);

@Schema({ _id: false })
export class ChatbotBilling {
  // Set by admin only — never writable by the chatbot's owner.
  @Prop({ default: 0 })
  setupFee: number;

  @Prop({ default: 0 })
  monthlyFee: number;

  @Prop({ default: 'USD' })
  currency: string;

  // Which of the module's pricingTiers this chatbot is on — drives feature
  // gating (Analytics tab, WhatsApp/Instagram channels) in
  // ChatbotsService/chatbots.controller and the frontend config page. See
  // backend CLAUDE.md's "Tiered chatbot pricing" section. Admin-only —
  // never in CUSTOMER_EDITABLE_FIELDS, same as monthlyFee/setupFee; a
  // customer upgrades by asking, admin flips this via PUT /:id/pricing,
  // matching the existing hand-set-price billing model.
  @Prop({ enum: ['basic', 'pro', 'custom'], default: 'basic' })
  tier: 'basic' | 'pro' | 'custom';

  @Prop({
    enum: ['trial', 'awaiting_setup_payment', 'active', 'past_due', 'suspended'],
    default: 'trial',
  })
  status: 'trial' | 'awaiting_setup_payment' | 'active' | 'past_due' | 'suspended';

  @Prop()
  trialEndsAt?: Date;

  @Prop()
  setupPaidAt?: Date;

  @Prop()
  lastBillingDate?: Date;

  @Prop()
  nextBillingDate?: Date;

  // Admin-only internal notes about the deal (not shown to the customer).
  @Prop()
  notes?: string;

  // Set once by ChatbotsCron so the "5 days left" reminder email fires only once.
  @Prop({ default: false })
  trialReminderSent: boolean;
}

@Schema({ timestamps: true })
export class Chatbot {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  persona?: string;

  // Any booking link the owner already uses — Calendly, OpenTable, Resy,
  // a Google Form, whatever. Purely a link to share in chat when a customer
  // wants to book, not a real booking integration (see backend CLAUDE.md's
  // "Booking link" section for why: restaurant reservations aren't really
  // calendar-slot-shaped the way Calendly assumes, so lead capture stays
  // the fallback whenever this is empty or the customer just gives their
  // details in-chat instead of clicking through).
  @Prop()
  bookingUrl?: string;

  @Prop({ enum: ['en', 'ar', 'both'], default: 'both' })
  language: 'en' | 'ar' | 'both';

  @Prop({
    enum: ['restaurant', 'real_estate', 'clinic', 'ecommerce', 'gym', 'education', 'salon', 'hotel', 'auto_dealership', 'custom'],
  })
  template?: string;

  @Prop({ enum: ['draft', 'active', 'inactive'], default: 'draft' })
  status: 'draft' | 'active' | 'inactive';

  @Prop({ default: "I'm not sure about that. Let me connect you with a human." })
  fallbackMessage: string;

  @Prop({ default: 'لست متأكداً من ذلك. دعني أوصلك بأحد المختصين.' })
  fallbackMessage_ar: string;

  @Prop({ default: false })
  humanHandoff: boolean;

  @Prop({ required: true, unique: true })
  embedKey: string;

  @Prop({ type: ChatbotChannels, default: () => ({}) })
  channels: ChatbotChannels;

  // Optional — most chatbots are single-location and this stays empty,
  // which is a complete no-op for buildSystemPrompt() (see Outlet above).
  // Only worth filling in for a business with more than one branch.
  @Prop({ type: [OutletSchema], default: [] })
  outlets: Outlet[];

  @Prop({ type: ChatbotBilling, default: () => ({}) })
  billing: ChatbotBilling;
}

export const ChatbotSchema = SchemaFactory.createForClass(Chatbot);
ChatbotSchema.index({ userId: 1 });
ChatbotSchema.index({ embedKey: 1 }, { unique: true });
