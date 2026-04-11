import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AutomationTemplate,
  AutomationTemplateDocument,
  AutomationCategory,
} from './schemas/automation-template.schema';
import {
  UserAutomation,
  UserAutomationDocument,
  UserAutomationStatus,
} from './schemas/user-automation.schema';

@Injectable()
export class AutomationsService {
  constructor(
    @InjectModel(AutomationTemplate.name)
    private templateModel: Model<AutomationTemplateDocument>,
    @InjectModel(UserAutomation.name)
    private userAutomationModel: Model<UserAutomationDocument>,
  ) {}

  async findAll(onlyActive = true) {
    const filter = onlyActive ? { isActive: true } : {};
    return this.templateModel.find(filter).sort({ createdAt: 1 }).lean();
  }

  async findBySlug(slug: string) {
    const template = await this.templateModel.findOne({ slug }).lean();
    if (!template) throw new NotFoundException('Automation not found');
    return template;
  }

  async getUserAutomations(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return [];
  
    return this.userAutomationModel
      .find({
        userId: new Types.ObjectId(userId),
        isDeleted: false,
        status: { $ne: UserAutomationStatus.CANCELLED },
      })
      .populate('templateId')
      .sort({ createdAt: -1 })
      .lean();
  }
  
  async activateAutomation(userId: string, templateId: string) {
    if (!Types.ObjectId.isValid(templateId)) {
      throw new NotFoundException('Automation not found');
    }
  
    const template = await this.templateModel.findById(templateId).lean();
    if (!template) throw new NotFoundException('Automation template not found');
  
    // Check if already active
    const existing = await this.userAutomationModel.findOne({
      userId: new Types.ObjectId(userId),
      templateId: new Types.ObjectId(templateId),
      isDeleted: false,
    });
  
    if (existing) {
      if (existing.status === UserAutomationStatus.ACTIVE) {
        throw new BadRequestException('Automation already active');
      }
      // Reactivate if paused/cancelled
      existing.status = UserAutomationStatus.ACTIVE;
      existing.activatedAt = new Date();
      await existing.save();
      return this.userAutomationModel
        .findById(existing._id)
        .populate('templateId')
        .lean();
    }
  
    const userAutomation = await this.userAutomationModel.create({
      userId: new Types.ObjectId(userId),
      templateId: new Types.ObjectId(templateId),
      status: UserAutomationStatus.ACTIVE,
      activatedAt: new Date(),
      config: (template as any).defaultConfig || {},
    });
  
    return this.userAutomationModel
      .findById(userAutomation._id)
      .populate('templateId')
      .lean();
  }
  
  async toggleAutomation(userId: string, userAutomationId: string) {
    if (!Types.ObjectId.isValid(userAutomationId)) {
      throw new NotFoundException('Not found');
    }
  
    const ua = await this.userAutomationModel.findOne({
      _id: new Types.ObjectId(userAutomationId),
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    });
  
    if (!ua) throw new NotFoundException('Automation not found');
  
    ua.status = ua.status === UserAutomationStatus.ACTIVE
      ? UserAutomationStatus.PAUSED
      : UserAutomationStatus.ACTIVE;
  
    await ua.save();
    return this.userAutomationModel
      .findById(ua._id)
      .populate('templateId')
      .lean();
  }
  
  async cancelAutomation(userId: string, userAutomationId: string) {
    if (!Types.ObjectId.isValid(userAutomationId)) {
      throw new NotFoundException('Not found');
    }
  
    const ua = await this.userAutomationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(userAutomationId),
        userId: new Types.ObjectId(userId),
      },
      {
        status: UserAutomationStatus.CANCELLED,
        isDeleted: true,
        cancelledAt: new Date(),
      },
      { new: true },
    );
  
    if (!ua) throw new NotFoundException('Automation not found');
    return { message: 'Automation cancelled' };
  }

  async seed() {
    const automations = [
      {
        slug: 'youtube',
        name: 'YouTube Automation',
        tagline: 'Your YouTube channel, running itself',
        description:
          'A complete end-to-end YouTube content pipeline. Discovers trending topics, writes scripts, generates cinematic videos with Seedance, creates AI thumbnails, extracts Shorts, and uploads everything on a schedule — fully automated.',
        category: AutomationCategory.CONTENT,
        icon: '📺',
        color: '#ef4444',
        badge: 'Live',
        isActive: true,
        capabilities: [
          'Trend discovery',
          'AI scriptwriting',
          'Seedance video generation',
          'TTS voiceover',
          'Shorts extraction',
          'AI thumbnail generation',
          'Auto upload + scheduling',
          'SEO optimisation',
        ],
        heroStats: [
          { label: 'Videos generated', value: '1,200+' },
          { label: 'Avg cost per video', value: '$1.32' },
          { label: 'Shorts per video', value: '3' },
          { label: 'Pipeline success rate', value: '98%' },
        ],
        features: [
          {
            title: 'Daily trend discovery',
            description:
              'Scans YouTube daily for trending topics in your niche. Ollama LLM scores each topic for virality, CPM potential and evergreen value — then picks the best one automatically.',
            icon: '🔍',
          },
          {
            title: 'AI scriptwriting',
            description:
              'Writes complete 8-12 minute scripts including title, description, tags, chapters, thumbnail prompt and hook. Optimised for your niche and audience retention.',
            icon: '📝',
          },
          {
            title: 'Seedance video generation',
            description:
              '12 cinematic video clips generated via Seedance v1.5 Pro at $1.32 per video. Dark, atmospheric, professional quality — no stock footage needed.',
            icon: '🎬',
          },
          {
            title: 'TTS voiceover',
            description:
              'Deep authoritative narration using OpenAI TTS (onyx voice) or ElevenLabs. Script cleaned, chunked and post-processed for professional broadcast quality.',
            icon: '🎙️',
          },
          {
            title: 'Shorts extraction',
            description:
              '3 vertical Shorts extracted from every long-form video at strategic timestamps — hook, middle revelation, final insight. Zero extra cost.',
            icon: '📱',
          },
          {
            title: 'Flux AI thumbnails',
            description:
              'Cinematic thumbnails generated by Flux 2 Pro. Your title overlaid in bold Impact-style text with YouTube branding. Falls back to Pillow if API is down.',
            icon: '🖼️',
          },
          {
            title: 'Auto upload + scheduling',
            description:
              'Videos uploaded as private with publishAt timestamps. YouTube auto-publishes at your configured schedule. Full AI content disclosure set automatically.',
            icon: '📤',
          },
          {
            title: 'SEO optimisation',
            description:
              'Titles, descriptions, tags and chapters all written for maximum YouTube search visibility. Targets low-competition, high-CPM keywords in your niche.',
            icon: '📈',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Connect your YouTube channel',
            description:
              'Link your YouTube account via OAuth. Add your API keys for Atlas Seedance, OpenAI, and YouTube Data API. Takes under 5 minutes.',
          },
          {
            step: '02',
            title: 'Configure your niche and schedule',
            description:
              'Tell the automation your niche, preferred upload schedule, and voice settings. The pipeline calibrates everything to your audience.',
          },
          {
            step: '03',
            title: 'Pipeline runs automatically',
            description:
              'Every day the pipeline discovers a trend, writes a script, generates video clips, assembles the video, creates a thumbnail, and uploads — all without you touching anything.',
          },
          {
            step: '04',
            title: 'Review and optimise',
            description:
              'Monitor performance from your dashboard. See which topics get the most views, adjust your niche or schedule, and let the pipeline continuously improve.',
          },
        ],
        testimonials: [
          {
            name: 'Ahmed K.',
            role: 'YouTube Creator',
            avatar: 'AK',
            text: 'Generated 30 videos in my first month. Channel went from 0 to 8k views per day in 6 weeks. The ROI at $1.32 per video is insane.',
            rating: 5,
          },
          {
            name: 'Fatima A.',
            role: 'Digital Creator',
            avatar: 'FA',
            text: 'Pipeline runs while I sleep. Wake up to an email — video uploaded, 3 shorts scheduled. Completely changed my content workflow.',
            rating: 5,
          },
          {
            name: 'Raj P.',
            role: 'Content Creator',
            avatar: 'RP',
            text: 'The onyx TTS voice sounds completely natural. My audience cannot tell it is AI. Views and watch time are both up.',
            rating: 5,
          },
        ],
        pricing: {
          monthly: 29,
          annual: 19,
          features: [
            'Unlimited pipeline runs',
            'Daily trend discovery',
            'Full AI scriptwriting',
            'Seedance video generation',
            'OpenAI TTS voiceover',
            '3 Shorts per video',
            'Flux AI thumbnail generation',
            'Auto YouTube upload + scheduling',
            'SEO optimisation',
            'Email notifications',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'How much does video generation actually cost?',
            answer:
              'Each video costs approximately $1.32 in Seedance API credits (12 clips × 5 seconds × $0.022/second). This is charged directly to your Atlas account — separate from your NexAgent subscription.',
          },
          {
            question: 'Do I need a YouTube channel already?',
            answer:
              'Yes. You need an existing YouTube channel with YouTube Data API and OAuth access enabled. The setup guide walks you through this in under 10 minutes.',
          },
          {
            question: 'What niche does this work for?',
            answer:
              'Any niche — dark psychology, finance, fitness, cooking, technology, self-improvement, history, true crime. You configure the niche and the pipeline tailors everything to it.',
          },
          {
            question: 'How many videos does it generate per week?',
            answer:
              'By default 3 long-form videos per week (Tuesday, Thursday, Saturday) plus 3 Shorts from each video — 12 pieces of content per week total. Fully configurable.',
          },
          {
            question: 'Can viewers tell the content is AI generated?',
            answer:
              'The video quality, voiceover and scripts are all high quality — most viewers cannot tell. YouTube requires AI content disclosure which we set automatically on every upload.',
          },
          {
            question: 'What happens if Atlas API is down?',
            answer:
              'The pipeline retries automatically. If Atlas is completely unavailable it falls back gracefully — Pillow thumbnail instead of Flux AI — and you get an email notification.',
          },
        ],
        integrations: [
          { name: 'YouTube', icon: '📺', description: 'Direct upload and scheduling' },
          { name: 'Atlas Seedance', icon: '🎬', description: 'AI video generation' },
          { name: 'OpenAI', icon: '🎙️', description: 'TTS voiceover' },
          { name: 'Flux AI', icon: '🖼️', description: 'Thumbnail generation' },
          { name: 'Ollama', icon: '🧠', description: 'Local LLM for scripting' },
          { name: 'FFmpeg', icon: '⚙️', description: 'Video assembly' },
        ],
        demoVideoUrl: 'https://youtu.be/E3tBDqClLyU',
        defaultConfig: {
          niche: '',
          scheduleFrequency: 'daily',
          scheduleTime: '08:00',
          timezone: 'Asia/Dubai',
          voice: 'onyx',
          videosPerWeek: 3,
          shortsPerVideo: 3,
        },
      },
      {
        slug: 'social-media',
        name: 'Social Media Automation',
        tagline: 'Post everywhere, every day, automatically',
        description:
          'Create and schedule content across Instagram, Twitter/X, LinkedIn and TikTok automatically. AI writes captions, generates visuals, picks hashtags and posts at the best times for your audience.',
        category: AutomationCategory.SOCIAL,
        icon: '📱',
        color: '#3b82f6',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Multi-platform posting',
          'AI caption writing',
          'Visual content generation',
          'Hashtag research',
          'Best time analytics',
          'Engagement tracking',
          'Content calendar',
          'Brand voice consistency',
        ],
        heroStats: [
          { label: 'Platforms supported', value: '4' },
          { label: 'Posts per month', value: '120+' },
          { label: 'Avg engagement boost', value: 'Coming soon' },
          { label: 'Time saved per week', value: '15h+' },
        ],
        features: [
          {
            title: 'Multi-platform publishing',
            description:
              'One piece of content reformatted and published across Instagram, Twitter/X, LinkedIn and TikTok simultaneously — each optimised for that platform.',
            icon: '🌐',
          },
          {
            title: 'AI caption writing',
            description:
              'Platform-native captions written by AI in your brand voice. Instagram storytelling, Twitter punchy hooks, LinkedIn professional tone — all different, all on-brand.',
            icon: '✍️',
          },
          {
            title: 'Visual content generation',
            description:
              'AI-generated images and graphics for every post using Flux AI. Branded templates, quote cards, infographics — no Canva needed.',
            icon: '🎨',
          },
          {
            title: 'Hashtag research',
            description:
              'Analyses your niche daily for trending and high-reach hashtags. Mixes broad, medium and niche tags for maximum discoverability.',
            icon: '#️⃣',
          },
          {
            title: 'Best time posting',
            description:
              'Analyses your audience activity patterns and schedules posts at the exact times they are most active on each platform.',
            icon: '⏰',
          },
          {
            title: 'Content calendar',
            description:
              'Visual 30-day content calendar generated automatically. Themes, campaigns and seasonal content planned ahead with zero manual work.',
            icon: '📅',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Connect your accounts',
            description:
              'Link your Instagram, Twitter/X, LinkedIn and TikTok accounts via OAuth. The automation gets post access — nothing else.',
          },
          {
            step: '02',
            title: 'Define your brand voice',
            description:
              'Tell the automation your niche, tone, and content pillars. It learns your style and maintains consistency across every platform.',
          },
          {
            step: '03',
            title: 'Content generated daily',
            description:
              'Every morning the automation researches trending topics, creates platform-specific content, generates visuals and queues everything for posting.',
          },
          {
            step: '04',
            title: 'Posts go live automatically',
            description:
              'Content publishes at the optimal time for each platform. You get a daily digest of what went live and how it is performing.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 39,
          annual: 27,
          features: [
            '4 platforms included',
            'Unlimited posts',
            'AI caption writing',
            'Visual content generation',
            'Hashtag research',
            'Best time scheduling',
            '30-day content calendar',
            'Engagement analytics',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this launch?',
            answer:
              'Social Media Automation is in development. Join the waitlist for early access and a 40% launch discount.',
          },
          {
            question: 'Which platforms are supported at launch?',
            answer:
              'Instagram, Twitter/X, LinkedIn and TikTok at launch. Pinterest, YouTube Shorts and Facebook planned for Q3 2026.',
          },
          {
            question: 'Can I review posts before they go live?',
            answer:
              'Yes. You can set an approval workflow where posts queue for your review before publishing. Or set it to fully automatic.',
          },
        ],
        integrations: [
          { name: 'Instagram', icon: '📸', description: 'Feed, Stories, Reels' },
          { name: 'Twitter/X', icon: '🐦', description: 'Tweets and threads' },
          { name: 'LinkedIn', icon: '💼', description: 'Posts and articles' },
          { name: 'TikTok', icon: '🎵', description: 'Short video content' },
          { name: 'Flux AI', icon: '🎨', description: 'Visual generation' },
          { name: 'Buffer', icon: '📅', description: 'Scheduling layer' },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          platforms: ['instagram', 'twitter', 'linkedin'],
          postsPerDay: 2,
          scheduleTime: '09:00',
        },
      },
      {
        slug: 'email-marketing',
        name: 'Email Marketing Automation',
        tagline: 'Emails that write, send and optimise themselves',
        description:
          'AI-powered email marketing — campaign writing, drip sequences, subject line optimisation, A/B testing, and send-time optimisation all handled automatically. Integrates with any ESP.',
        category: AutomationCategory.EMAIL,
        icon: '📧',
        color: '#22c55e',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Campaign copywriting',
          'Drip sequence builder',
          'Subject line optimisation',
          'A/B testing',
          'Send-time optimisation',
          'List segmentation',
          'Performance analytics',
          'ESP integration',
        ],
        heroStats: [
          { label: 'Avg open rate boost', value: 'Coming soon' },
          { label: 'ESPs supported', value: '6+' },
          { label: 'Emails written per month', value: 'Unlimited' },
          { label: 'Setup time', value: '< 10 min' },
        ],
        features: [
          {
            title: 'Campaign copywriting',
            description:
              'Complete email campaigns written by AI — from welcome sequences to promotional launches. Subject lines, preview text, body copy and CTAs all included.',
            icon: '✍️',
          },
          {
            title: 'Drip sequence builder',
            description:
              'Multi-step automated email sequences triggered by subscriber behaviour. Onboarding, re-engagement, upsell — all written and configured automatically.',
            icon: '🔄',
          },
          {
            title: 'Subject line optimisation',
            description:
              'AI generates 10 subject line variants per campaign and picks the predicted highest-performer based on your audience data.',
            icon: '📊',
          },
          {
            title: 'A/B testing',
            description:
              'Automatically splits every campaign into variants, tests them on a small segment, then sends the winner to the full list.',
            icon: '🧪',
          },
          {
            title: 'Send-time optimisation',
            description:
              'Analyses when each subscriber is most likely to open and sends at that exact time — not a blanket schedule.',
            icon: '⏰',
          },
          {
            title: 'List segmentation',
            description:
              'Automatically segments your list by behaviour, engagement, purchase history and interests. Right message to the right person.',
            icon: '🎯',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Connect your ESP',
            description:
              'Link Mailchimp, ConvertKit, Klaviyo, ActiveCampaign, Beehiiv or any major ESP via API. Your existing lists and templates are imported automatically.',
          },
          {
            step: '02',
            title: 'Define your goals',
            description:
              'Tell the automation your business, audience and email goals. It builds a complete email strategy and calendar.',
          },
          {
            step: '03',
            title: 'Campaigns written and scheduled',
            description:
              'Every week new campaigns are written, subject lines optimised, and sends scheduled at the best time for each subscriber segment.',
          },
          {
            step: '04',
            title: 'Continuous optimisation',
            description:
              'The automation learns from open rates, clicks and conversions. It continuously refines your copy, timing and segmentation to improve results.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 35,
          annual: 24,
          features: [
            'Unlimited email campaigns',
            'Drip sequence builder',
            'Subject line AI optimisation',
            'Automated A/B testing',
            'Send-time optimisation',
            'List segmentation',
            '6+ ESP integrations',
            'Performance analytics',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this launch?',
            answer:
              'Email Marketing Automation is in development. Join the waitlist for early access.',
          },
          {
            question: 'Which ESPs are supported?',
            answer:
              'Mailchimp, ConvertKit, Klaviyo, ActiveCampaign, Beehiiv and Sendgrid at launch.',
          },
          {
            question: 'Does it comply with GDPR and CAN-SPAM?',
            answer:
              'Yes. All emails include required unsubscribe links and sender information. GDPR consent handling is built in.',
          },
        ],
        integrations: [
          { name: 'Mailchimp', icon: '🐒', description: 'Email platform' },
          { name: 'ConvertKit', icon: '📨', description: 'Creator email' },
          { name: 'Klaviyo', icon: '📊', description: 'E-commerce email' },
          { name: 'ActiveCampaign', icon: '⚡', description: 'Marketing automation' },
          { name: 'Beehiiv', icon: '🐝', description: 'Newsletter platform' },
          { name: 'Sendgrid', icon: '📤', description: 'Transactional email' },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          emailsPerWeek: 3,
          abTestPercentage: 20,
        },
      },
      {
        slug: 'ecommerce',
        name: 'E-commerce Automation',
        tagline: 'Run your store on autopilot',
        description:
          'Product listings, ad copy, inventory alerts, review responses, abandoned cart emails and customer follow-ups — all handled by AI so you can focus on sourcing and growth.',
        category: AutomationCategory.ECOMMERCE,
        icon: '🛍️',
        color: '#f59e0b',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Product description writing',
          'Ad creative generation',
          'Inventory alerts',
          'Review response automation',
          'Abandoned cart recovery',
          'Customer follow-ups',
          'Price optimisation',
          'Cross-sell recommendations',
        ],
        heroStats: [
          { label: 'Platforms supported', value: '4' },
          { label: 'Avg cart recovery rate', value: 'Coming soon' },
          { label: 'Product descriptions/hr', value: '100+' },
          { label: 'Setup time', value: '< 15 min' },
        ],
        features: [
          {
            title: 'Product description writing',
            description:
              'SEO-optimised product descriptions written by AI at scale. Bullet points, long descriptions, meta titles — all generated in seconds per product.',
            icon: '📝',
          },
          {
            title: 'Ad creative generation',
            description:
              'Complete ad copy for Google, Facebook and Instagram — headlines, descriptions, CTAs. Multiple variants generated for A/B testing.',
            icon: '📣',
          },
          {
            title: 'Inventory alerts',
            description:
              'Monitors stock levels and sends automated alerts when products run low. Can auto-pause ads for out-of-stock items.',
            icon: '📦',
          },
          {
            title: 'Review response automation',
            description:
              'AI responds to customer reviews on autopilot — personalised, on-brand responses to both positive and negative reviews.',
            icon: '⭐',
          },
          {
            title: 'Abandoned cart recovery',
            description:
              'Automated email and SMS sequences for abandoned carts. Timing, copy and incentives all optimised by AI.',
            icon: '🛒',
          },
          {
            title: 'Customer follow-ups',
            description:
              'Post-purchase sequences — thank you emails, review requests, cross-sell recommendations, loyalty rewards — all automated.',
            icon: '💌',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Connect your store',
            description:
              'Link your Shopify, WooCommerce, Amazon or Etsy store. Products, orders and customers are synced automatically.',
          },
          {
            step: '02',
            title: 'Configure your automations',
            description:
              'Choose which automations to enable — product descriptions, ad copy, review responses, cart recovery. Enable all or just what you need.',
          },
          {
            step: '03',
            title: 'AI goes to work',
            description:
              'Every new product gets descriptions and ad copy written. Every review gets a response. Every abandoned cart gets a recovery sequence.',
          },
          {
            step: '04',
            title: 'Monitor and optimise',
            description:
              'Track recovery rates, review response sentiment, and ad performance from one dashboard. The AI continuously improves based on results.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 45,
          annual: 31,
          features: [
            'Product description generator',
            'Ad copy for 4 platforms',
            'Inventory monitoring',
            'Review response automation',
            'Abandoned cart recovery',
            'Post-purchase sequences',
            'Shopify + WooCommerce + Amazon',
            'Performance analytics',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this launch?',
            answer:
              'E-commerce Automation is in development. Join the waitlist for early access.',
          },
          {
            question: 'Which platforms are supported?',
            answer:
              'Shopify, WooCommerce, Amazon Seller Central and Etsy at launch. eBay and Walmart planned for later.',
          },
          {
            question: 'Can it handle a store with thousands of products?',
            answer:
              'Yes. Product description generation runs in bulk — 100+ products per hour. Existing products can be batch-processed on setup.',
          },
        ],
        integrations: [
          { name: 'Shopify', icon: '🛍️', description: 'Store platform' },
          { name: 'WooCommerce', icon: '🔌', description: 'WordPress store' },
          { name: 'Amazon', icon: '📦', description: 'Marketplace' },
          { name: 'Etsy', icon: '🎨', description: 'Handmade marketplace' },
          { name: 'Google Ads', icon: '🔍', description: 'Search advertising' },
          { name: 'Meta Ads', icon: '📘', description: 'Social advertising' },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          enabledAutomations: ['descriptions', 'reviews', 'cart-recovery'],
        },
      },
      {
        slug: 'content-repurposing',
        name: 'Content Repurposing',
        tagline: 'Create once. Publish everywhere.',
        description:
          'Turn one piece of content into 10 across every format and platform. Blog to video, podcast to article, YouTube to Shorts, webinar to social posts — all done automatically.',
        category: AutomationCategory.REPURPOSING,
        icon: '♻️',
        color: '#a78bfa',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Blog → video script',
          'Podcast → article',
          'YouTube → Shorts',
          'Webinar → social clips',
          'Article → email newsletter',
          'Video → tweet thread',
          'Cross-platform distribution',
          'Format optimisation',
        ],
        heroStats: [
          { label: 'Content formats', value: '8+' },
          { label: 'Platforms supported', value: '6' },
          { label: 'Avg time saved per piece', value: '4 hours' },
          { label: 'Output per input', value: '10x' },
        ],
        features: [
          {
            title: 'Blog to video',
            description:
              'Converts blog posts into full video scripts with scene descriptions, B-roll suggestions and voiceover text. Ready for production immediately.',
            icon: '📝➡️🎬',
          },
          {
            title: 'Podcast to article',
            description:
              'Transcribes podcast episodes and rewrites them as SEO-optimised blog articles with proper structure, headings and meta descriptions.',
            icon: '🎙️➡️📄',
          },
          {
            title: 'YouTube to Shorts',
            description:
              'Analyses YouTube videos and extracts the 3 most clip-worthy moments. Reformats for vertical 9:16 with auto-captions.',
            icon: '📺➡️📱',
          },
          {
            title: 'Video to tweet thread',
            description:
              'Extracts key insights from any video and formats them as an engaging Twitter/X thread with hooks, numbered points and a CTA.',
            icon: '🎬➡️🐦',
          },
          {
            title: 'Article to newsletter',
            description:
              'Reformats blog articles as email-friendly newsletters with proper email structure, shorter paragraphs and email-native CTAs.',
            icon: '📄➡️📧',
          },
          {
            title: 'Cross-platform distribution',
            description:
              'Automatically distributes each repurposed piece to the right platform — no manual uploading or copy-pasting.',
            icon: '🌐',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Connect your content sources',
            description:
              'Link your blog RSS feed, podcast feed, YouTube channel or upload files directly. The automation monitors for new content automatically.',
          },
          {
            step: '02',
            title: 'Choose your output formats',
            description:
              'Select which formats you want each piece of content converted into. Set it once — the automation applies your preferences to every new piece.',
          },
          {
            step: '03',
            title: 'Content repurposed automatically',
            description:
              'Every time you publish new content, the automation immediately starts generating all your selected formats in the background.',
          },
          {
            step: '04',
            title: 'Distributed and published',
            description:
              'Each repurposed piece is published to the right platform automatically — or queued for your review if you prefer an approval step.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 32,
          annual: 22,
          features: [
            '8+ content format conversions',
            'Blog → video script',
            'Podcast → article',
            'YouTube → Shorts',
            'Video → tweet thread',
            'Article → newsletter',
            'Cross-platform distribution',
            'Unlimited conversions',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this launch?',
            answer:
              'Content Repurposing is in development. Join the waitlist for early access.',
          },
          {
            question: 'What content formats can I input?',
            answer:
              'Blog posts (URL or RSS), podcast episodes (MP3 or RSS), YouTube videos (URL), webinar recordings (MP4), and plain text articles.',
          },
          {
            question: 'How accurate is the transcription?',
            answer:
              'We use Whisper large-v3 for transcription — industry-leading accuracy for clear audio. Speaker diarisation is included for multi-speaker content.',
          },
        ],
        integrations: [
          { name: 'WordPress', icon: '📝', description: 'Blog source' },
          { name: 'YouTube', icon: '📺', description: 'Video source + destination' },
          { name: 'Spotify/RSS', icon: '🎵', description: 'Podcast source' },
          { name: 'Twitter/X', icon: '🐦', description: 'Thread distribution' },
          { name: 'Mailchimp', icon: '📧', description: 'Newsletter distribution' },
          { name: 'LinkedIn', icon: '💼', description: 'Article distribution' },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          outputFormats: ['shorts', 'twitter-thread', 'newsletter'],
          autoPublish: false,
        },
      },
      {
        slug: 'podcast',
        name: 'Podcast Automation',
        tagline: 'Record once. The rest handles itself.',
        description:
          'Record your podcast and let AI handle everything else — transcription, show notes, chapter markers, clips for social, a blog post, and distribution to all major platforms.',
        category: AutomationCategory.PODCAST,
        icon: '🎙️',
        color: '#ec4899',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Auto transcription',
          'Show notes generation',
          'Chapter markers',
          'Clip extraction',
          'Blog post creation',
          'Social distribution',
          'Platform submission',
          'Guest outreach',
        ],
        heroStats: [
          { label: 'Platforms distributed to', value: '8+' },
          { label: 'Time saved per episode', value: '6 hours' },
          { label: 'Clips generated per episode', value: '5+' },
          { label: 'Transcription accuracy', value: '98%' },
        ],
        features: [
          {
            title: 'Auto transcription',
            description:
              'Whisper large-v3 transcribes your episode with 98% accuracy. Speaker diarisation identifies who is speaking. Timestamps included for every sentence.',
            icon: '📝',
          },
          {
            title: 'Show notes generation',
            description:
              'Complete show notes written from the transcript — episode summary, key takeaways, timestamps, guest bio, and links mentioned. SEO-optimised.',
            icon: '📋',
          },
          {
            title: 'Chapter markers',
            description:
              'AI identifies natural topic transitions and creates chapter markers with descriptive titles. Compatible with Spotify, Apple Podcasts and YouTube.',
            icon: '📍',
          },
          {
            title: 'Clip extraction',
            description:
              'Identifies the 5 most quotable and shareable moments from each episode. Exports as vertical video clips with auto-captions for social media.',
            icon: '✂️',
          },
          {
            title: 'Blog post creation',
            description:
              'Converts each episode into a long-form SEO blog post. Not just a transcript — a properly structured article with headings, formatting and meta data.',
            icon: '📰',
          },
          {
            title: 'Platform distribution',
            description:
              'Automatically submits each episode to Spotify, Apple Podcasts, Google Podcasts, Amazon Music and 5 more platforms simultaneously.',
            icon: '🌐',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Upload your recording',
            description:
              'Upload your audio file (MP3, WAV, M4A) or connect your recording software directly. The automation starts processing immediately.',
          },
          {
            step: '02',
            title: 'AI processes your episode',
            description:
              'Transcription, show notes, chapter markers, clip extraction and blog post all generated in parallel. Usually done within 15 minutes.',
          },
          {
            step: '03',
            title: 'Review and approve',
            description:
              'Review everything in your dashboard — edit show notes, approve clips, adjust chapter markers. Or set to fully automatic if you trust the output.',
          },
          {
            step: '04',
            title: 'Published everywhere',
            description:
              'Episode submitted to all platforms, blog post published, clips posted to social media — all at your configured publish time.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 37,
          annual: 26,
          features: [
            'Unlimited episode processing',
            'Whisper transcription',
            'AI show notes',
            'Chapter marker generation',
            '5 social clips per episode',
            'SEO blog post creation',
            '8+ platform distribution',
            'RSS feed management',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this launch?',
            answer:
              'Podcast Automation is in development. Join the waitlist for early access.',
          },
          {
            question: 'Which audio formats are supported?',
            answer:
              'MP3, WAV, M4A, FLAC and OGG. Maximum file size is 2GB per episode.',
          },
          {
            question: 'Which podcast platforms does it distribute to?',
            answer:
              'Spotify, Apple Podcasts, Google Podcasts, Amazon Music, iHeartRadio, Pocket Casts, Overcast and TuneIn at launch.',
          },
          {
            question: 'Does it work for video podcasts?',
            answer:
              'Yes. MP4 video files are supported. The automation extracts the audio for transcription and can upload the full video to YouTube automatically.',
          },
        ],
        integrations: [
          { name: 'Spotify', icon: '🎵', description: 'Podcast distribution' },
          { name: 'Apple Podcasts', icon: '🎧', description: 'Podcast distribution' },
          { name: 'YouTube', icon: '📺', description: 'Video podcast' },
          { name: 'Whisper AI', icon: '🎙️', description: 'Transcription' },
          { name: 'WordPress', icon: '📝', description: 'Blog publishing' },
          { name: 'Buzzsprout', icon: '🔊', description: 'Podcast hosting' },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          autoPublish: false,
          clipsPerEpisode: 5,
          generateBlogPost: true,
        },
      },
    ];

    let created = 0;
    let updated = 0;

    for (const automation of automations) {
      const existing = await this.templateModel.findOne({
        slug: automation.slug,
      });
      if (existing) {
        await this.templateModel.findByIdAndUpdate(
          existing._id,
          { $set: automation },
          { new: true },
        );
        updated++;
      } else {
        await this.templateModel.create(automation);
        created++;
      }
    }

    return {
      message: `Seed complete — ${created} created, ${updated} updated`,
      total: automations.length,
    };
  }
}