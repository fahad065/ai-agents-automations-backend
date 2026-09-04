import {
    Injectable,
    NotFoundException,
    BadRequestException,
    OnModuleInit,
    Logger,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import { Page, PageDocument, PageSlug } from './schemas/page.schema';
  import { BlogPost, BlogPostDocument, BlogCategory } from './schemas/blog-post.schema';

  // Shared between seedPages() (the full POST /cms/seed reseed) and the
  // onModuleInit() backfill below, so the two never drift out of sync.
  const SEED_ABOUT_PAGE = {
    content: `
      <h2>Our mission</h2>
      <p>LogicMate exists to give every business — from solo creators to enterprise teams, anywhere in the world — access to the same AI automation capabilities that were previously only available to large tech companies with dedicated engineering teams.</p>

      <h2>What we do</h2>
      <p>We build pre-configured AI agents, automations and chatbots that plug into your existing tools and workflows. No code required. No ML expertise needed. Just connect your accounts, configure your niche, and let them run.</p>

      <h2>Why we built this</h2>
      <p>The founder spent months building a custom YouTube automation pipeline — trend discovery, scriptwriting, video generation, thumbnail creation, uploading — from scratch. It worked incredibly well but took hundreds of hours to build and maintain.</p>
      <p>We realised that every creator and business owner needed this, but almost none had the technical skills to build it. LogicMate is that pipeline, productised and made available to businesses everywhere — not limited to any single region or market.</p>

      <h2>Our values</h2>
      <ul>
        <li><strong>Transparency</strong> — We tell you exactly what our agents do, what they cost, and how they work.</li>
        <li><strong>Quality over quantity</strong> — We would rather have 10 agents that work perfectly than 100 that work poorly.</li>
        <li><strong>Accessible pricing</strong> — AI automation should not cost thousands of dollars per month. We keep prices low by building efficient pipelines.</li>
        <li><strong>Privacy first</strong> — Your API keys are encrypted. Your content is yours. We never train on your data.</li>
      </ul>
    `,
    content_ar: `
      <h2>مهمتنا</h2>
      <p>لوجيك ميت موجودة لإعطاء كل عمل تجاري — من صنّاع المحتوى الأفراد إلى فرق الشركات الكبيرة، في أي مكان بالعالم — إمكانية الوصول لنفس قدرات أتمتة الذكاء الاصطناعي التي كانت متاحة فقط لشركات التقنية الكبرى ذات الفرق الهندسية المتخصصة.</p>

      <h2>شنو نسوي</h2>
      <p>نبني وكلاء ذكاء اصطناعي وأتمتة وشات بوتات جاهزة تتوصل بأدواتك وسير عملك الحالي. بدون كود. بدون خبرة بالذكاء الاصطناعي. بس وصّل حساباتك، حدد تخصصك، وخلّهم يشتغلون.</p>

      <h2>ليش بنينا هذا</h2>
      <p>المؤسس قضى شهور يبني خط أتمتة يوتيوب مخصص — من اكتشاف الترندات، كتابة السكربت، إنشاء الفيديو، وصنع الصورة المصغّرة، إلى الرفع — من الصفر. اشتغل بشكل ممتاز لكن أخذ مئات الساعات لبنائه وصيانته.</p>
      <p>أدركنا إن كل صانع محتوى وصاحب عمل يحتاج هذا، لكن أغلبهم ما عندهم المهارات التقنية لبنائه. لوجيك ميت هو ذاك الخط، مُنتَج ومتاح لأي عمل تجاري في أي مكان — مو مقتصر على منطقة أو سوق واحد.</p>

      <h2>قيمنا</h2>
      <ul>
        <li><strong>الشفافية</strong> — نقولك بالضبط شنو يسوّي وكلاؤنا، وكم يكلفون، وكيف يشتغلون.</li>
        <li><strong>الجودة فوق الكمية</strong> — نفضّل 10 وكلاء يشتغلون بشكل مثالي على 100 يشتغلون بشكل رديء.</li>
        <li><strong>أسعار في متناول الجميع</strong> — أتمتة الذكاء الاصطناعي ما لازم تكلّف آلاف الدولارات شهرياً. نخلّي الأسعار منخفضة ببناء خطوط فعّالة.</li>
        <li><strong>الخصوصية أولاً</strong> — مفاتيح API الخاصة فيك مشفّرة. محتواك ملكك. ما ندرّب أنظمتنا على بياناتك.</li>
      </ul>
    `,
  };

  @Injectable()
  export class CmsService implements OnModuleInit {
    private readonly logger = new Logger(CmsService.name);

    constructor(
      @InjectModel(Page.name) private pageModel: Model<PageDocument>,
      @InjectModel(BlogPost.name) private blogModel: Model<BlogPostDocument>,
    ) {}

    async onModuleInit() {
      await this.backfillAboutGlobalMarketContent();
    }

    // One-time-per-doc backfill: the About page's content used to frame
    // LogicMate as GCC/UAE-and-Kenya-only ("...in the GCC", "UAE and Kenyan
    // businesses"). The platform now targets international markets too, so
    // this rewrites the page to reflect that. Gated on `lastEditedBy` not
    // being set — that field is only ever written by updatePage() (a real
    // admin edit via PUT /cms/admin/pages/:slug from the dashboard), never
    // by seedPages(), so its absence reliably means "still exactly what the
    // seed script wrote, no admin customization to protect". Note
    // seedPages() (the POST /cms/seed admin endpoint) is NOT run on every
    // boot the way this is — this backfill is what actually delivers the
    // content update to already-deployed databases.
    private async backfillAboutGlobalMarketContent() {
      const seed = SEED_ABOUT_PAGE;
      const result = await this.pageModel.updateOne(
        {
          slug: PageSlug.ABOUT,
          lastEditedBy: { $exists: false },
          $or: [
            { content: { $ne: seed.content } },
            { content_ar: { $exists: false } },
          ],
        },
        { $set: { content: seed.content, content_ar: seed.content_ar } },
      );
      if (result.modifiedCount) {
        this.logger.log('About page content backfilled to global-market copy');
      }
    }

    // ─── Pages ───────────────────────────────────────────────────
  
    async getPage(slug: string) {
      const page = await this.pageModel.findOne({ slug, isPublished: true }).lean();
      if (!page) throw new NotFoundException(`Page not found: ${slug}`);
      return page;
    }
  
    async getPageAdmin(slug: string) {
      const page = await this.pageModel.findOne({ slug }).lean();
      if (!page) throw new NotFoundException(`Page not found: ${slug}`);
      return page;
    }
  
    async updatePage(slug: string, dto: any, adminName: string) {
      const page = await this.pageModel.findOneAndUpdate(
        { slug },
        { $set: { ...dto, lastEditedBy: adminName } },
        { new: true, upsert: true },
      );
      return page;
    }
  
    async seedPages() {
      const pages = [
        {
          slug: PageSlug.ABOUT,
          title: 'About LogicMate',
          subtitle: 'We are building the future of business automation',
          metaTitle: 'About LogicMate — AI Automation Platform',
          metaDescription: 'Learn about LogicMate, our mission to make AI automation accessible to every business, and the team behind the platform.',
          ...SEED_ABOUT_PAGE,
          teamMembers: [
            {
              name: 'Fahad Faheem',
              role: 'Founder & CEO',
              bio: 'Built the original YouTube automation pipeline. Previously worked in software engineering and content creation. Passionate about making AI tools accessible.',
              avatar: 'FF',
            },
          ],
          isPublished: true,
        },
        {
          slug: PageSlug.CONTACT,
          title: 'Contact us',
          subtitle: 'We would love to hear from you',
          metaTitle: 'Contact LogicMate — Get in Touch',
          metaDescription: 'Contact the LogicMate team for support, partnerships, or general enquiries.',
          content: `
            <p>Whether you have a question about our automations, need technical support, or want to explore a partnership — we are here to help.</p>
            <p>We aim to respond to all enquiries within 24 hours on business days.</p>
          `,
          contactInfo: {
            email: 'hello@logicmate.io',
            supportEmail: 'support@logicmate.io',
            twitter: 'https://twitter.com/logicmate',
            linkedin: 'https://linkedin.com/company/logicmate',
            address: 'Dubai, United Arab Emirates',
          },
          isPublished: true,
        },
        {
          slug: PageSlug.PRIVACY,
          title: 'Privacy Policy',
          subtitle: 'Last updated: June 4, 2026',
          metaTitle: 'Privacy Policy — LogicMate',
          metaDescription: 'Read the LogicMate privacy policy to understand how we collect, use and protect your personal data.',
          content: `
            <h2>1. Information we collect</h2>
            <p>We collect information you provide directly — your name and email address when you create an account. For manual bank transfer payments, we collect your transaction reference number to verify payments.</p>
            <p>We also collect usage data — pages visited, features used, and pipeline runs — to improve our service.</p>
  
            <h2>2. How we use your information</h2>
            <ul>
              <li>To provide and maintain our service</li>
              <li>To send you important service notifications</li>
              <li>To verify and process manual bank transfer payments</li>
              <li>To improve our automations and agents based on usage patterns</li>
              <li>To respond to your support requests</li>
            </ul>
  
            <h2>3. API keys and credentials</h2>
            <p>All API keys stored in LogicMate are encrypted using AES-256 encryption before being saved to our database. Raw key values are never logged, never displayed after initial entry, and never shared with third parties.</p>
  
            <h2>4. Data sharing</h2>
            <p>We do not sell your personal data. We share data only with:</p>
            <ul>
              <li>Wise / bank transfer — for manual payment verification (no card data stored)</li>
              <li><strong>MongoDB Atlas</strong> — for database hosting</li>
              <li><strong>Vercel</strong> — for application hosting</li>
            </ul>
            <p>All third-party services are bound by their own privacy policies and data processing agreements.</p>
  
            <h2>5. Data retention</h2>
            <p>We retain your data for as long as your account is active. When you delete your account, your personal data is removed within 30 days. Generated content (videos, scripts) stored locally on your machine is not affected.</p>
  
            <h2>6. Your rights</h2>
            <p>You have the right to access, correct, export, or delete your personal data at any time. Contact us at hello@logicmate.io to exercise these rights.</p>
  
            <h2>7. Cookies</h2>
            <p>We use essential cookies for authentication and preference storage. We do not use advertising or tracking cookies. See our Cookie Policy for details.</p>
  
            <h2>8. Contact</h2>
            <p>For privacy-related enquiries, contact us at hello@logicmate.io</p>
          `,
          isPublished: true,
        },
        {
          slug: PageSlug.TERMS,
          title: 'Terms of Service',
          subtitle: 'Last updated: June 4, 2026',
          metaTitle: 'Terms of Service — LogicMate',
          metaDescription: 'Read the LogicMate terms of service governing your use of the platform.',
          content: `
            <h2>1. Acceptance of terms</h2>
            <p>By accessing or using LogicMate, you agree to be bound by these Terms of Service. If you do not agree, do not use our service.</p>
  
            <h2>2. Description of service</h2>
            <p>LogicMate provides AI-powered automation tools and agents for content creation, social media, email marketing, and related business workflows. The service is provided on a subscription basis.</p>
  
            <h2>3. Account responsibilities</h2>
            <ul>
              <li>You are responsible for maintaining the confidentiality of your account credentials</li>
              <li>You are responsible for all activity that occurs under your account</li>
              <li>You must provide accurate information when creating your account</li>
              <li>You must be at least 18 years old to use the service</li>
            </ul>
  
            <h2>4. Acceptable use</h2>
            <p>You may not use LogicMate to:</p>
            <ul>
              <li>Generate spam, misleading, or deceptive content</li>
              <li>Violate any applicable laws or platform terms of service (YouTube, Instagram, etc.)</li>
              <li>Attempt to reverse engineer, hack, or exploit the platform</li>
              <li>Resell or redistribute our service without written permission</li>
            </ul>
  
            <h2>5. AI-generated content</h2>
            <p>You are responsible for reviewing and complying with platform policies (YouTube, Instagram, etc.) regarding AI-generated content. LogicMate automatically sets required AI disclosure flags where applicable, but compliance with all platform rules remains your responsibility.</p>
  
            <h2>6. Third-party API costs</h2>
            <p>Some automations use third-party APIs (Atlas Seedance, OpenAI, etc.) that have their own pricing. These costs are separate from your LogicMate subscription and billed directly by those providers. LogicMate is not responsible for third-party API costs or outages.</p>
  
            <h2>7. Payment and cancellation</h2>
            <p>Subscriptions are currently billed via <strong>manual bank transfer</strong> on a monthly or annual basis. An automated payment gateway will be available soon.</p>
            <p>You may cancel at any time by emailing hello@logicmate.io. Cancellation takes effect at the end of the current billing period. We offer a <strong>7-day money-back guarantee</strong> for first-time subscribers. See our <a href="/refund">Refund Policy</a> for full details.</p>
  
            <h2>8. Limitation of liability</h2>
            <p>LogicMate is provided "as is". We are not liable for any indirect, incidental, or consequential damages arising from your use of the service, including any content generated by our AI agents.</p>
  
            <h2>9. Changes to terms</h2>
            <p>We may update these terms at any time. We will notify you via email of material changes. Continued use after notification constitutes acceptance.</p>
  
            <h2>10. Contact</h2>
            <p>Legal enquiries: hello@logicmate.io</p>
          `,
          isPublished: true,
        },
        {
          slug: PageSlug.REFUND,
          title: 'Refund Policy',
          metaTitle: 'Refund Policy — LogicMate',
          metaDescription: 'LogicMate refund policy — understand our billing, cancellation and refund terms.',
          isPublished: true,
          content: `
            <h2>Refund Policy</h2>
            <p>Last updated: June 2026</p>

            <h2>1. Free Trial</h2>
            <p>All LogicMate subscriptions begin with a <strong>30-day free trial</strong>. No payment is required during the trial period. Your modules are automatically paused at the end of the trial if no subscription payment is made.</p>

            <h2>2. Current Payment Method</h2>
            <p>LogicMate currently accepts payments via <strong>manual bank transfer</strong> while our automated payment gateway is being set up. Upon payment, our team will manually verify and activate your subscription within 24 hours.</p>
            <p>An automated payment gateway (credit/debit card) will be available soon. Existing subscribers will be migrated automatically with no action required.</p>

            <h2>3. Subscription Billing</h2>
            <p>Subscriptions are available on a <strong>monthly</strong> or <strong>annual</strong> basis. Payment is made in advance via bank transfer. Your subscription period begins on the date our team confirms your payment and activates your account.</p>
            <p>Annual subscriptions are billed as a single payment for 12 months and offer a discounted monthly rate compared to the monthly plan.</p>

            <h2>4. Cancellation</h2>
            <p>You may cancel your subscription at any time by emailing <strong>hello@logicmate.io</strong>. Cancellation takes effect at the end of your current billing period. You will retain full access to all features until the period ends.</p>
            <p>No further charges will be made after cancellation. Since payments are manual, there are no automatic renewals — you choose when to renew.</p>

            <h2>5. Refunds</h2>
            <p>We offer a <strong>7-day money-back guarantee</strong> for first-time subscribers. If you are not satisfied within 7 days of your first payment being confirmed, contact us at <strong>hello@logicmate.io</strong> for a full refund via bank transfer.</p>
            <p>After 7 days from activation, refunds are not issued for the current billing period. However, you may cancel at any time to prevent future charges.</p>
            <p>Refunds are processed via bank transfer within <strong>5-10 business days</strong> of approval. You will need to provide your bank details for the refund transfer.</p>

            <h2>6. Non-Refundable Items</h2>
            <ul>
              <li>Partial billing periods after 7-day guarantee window</li>
              <li>API costs charged directly to your own accounts (OpenAI, Seedance, etc.) — these are between you and the API providers</li>
              <li>Subscriptions where the service has been fully used/delivered</li>
            </ul>

            <h2>7. Technical Issues</h2>
            <p>If you experience a technical issue that prevents you from using the service, please contact our support team at <strong>hello@logicmate.io</strong>. We will work to resolve the issue promptly or provide a service credit for any downtime caused by our platform.</p>

            <h2>8. Exceptional Circumstances</h2>
            <p>Refunds may be granted at our discretion in exceptional circumstances such as:</p>
            <ul>
              <li>Duplicate payments</li>
              <li>Payment made in error</li>
              <li>Service unavailability for an extended period caused by LogicMate</li>
            </ul>
            <p>Contact us at <strong>hello@logicmate.io</strong> with full details of your situation.</p>

            <h2>9. How to Request a Refund</h2>
            <p>To request a refund:</p>
            <ol>
              <li>Email <strong>hello@logicmate.io</strong> with subject: "Refund Request — [your email]"</li>
              <li>Include your registered email address and payment transaction reference</li>
              <li>Describe the reason for your refund request</li>
              <li>Our team will respond within 2 business days</li>
              <li>Approved refunds are transferred within 5-10 business days</li>
            </ol>

            <h2>10. Contact</h2>
            <p>For refund requests or billing questions:<br/>
            <strong>Email:</strong> hello@logicmate.io<br/>
            <strong>Website:</strong> https://www.logicmate.io<br/>
            <strong>Response time:</strong> Within 2 business days</p>
          `,
        },
        {
          slug: PageSlug.COOKIES,
          title: 'Cookie Policy',
          subtitle: 'Last updated: April 8, 2026',
          metaTitle: 'Cookie Policy — LogicMate',
          metaDescription: 'Learn how LogicMate uses cookies and how you can manage your cookie preferences.',
          content: `
            <h2>What are cookies?</h2>
            <p>Cookies are small text files stored on your device when you visit a website. They help us provide a better experience by remembering your preferences and keeping you signed in.</p>
  
            <h2>Cookies we use</h2>
  
            <h3>Essential cookies (always active)</h3>
            <p>These cookies are necessary for the website to function and cannot be disabled:</p>
            <ul>
              <li><strong>accessToken</strong> — Keeps you signed in to your account (expires in 15 minutes)</li>
              <li><strong>refreshToken</strong> — Used to refresh your session without requiring you to sign in again (expires in 7 days)</li>
            </ul>
  
            <h3>Preference cookies</h3>
            <ul>
              <li><strong>kt-theme</strong> — Remembers your dark/light mode preference (stored in localStorage)</li>
              <li><strong>kt-auth</strong> — Stores your session state locally (stored in localStorage)</li>
            </ul>
  
            <h2>Cookies we do NOT use</h2>
            <ul>
              <li>Advertising cookies</li>
              <li>Tracking pixels</li>
              <li>Analytics cookies (we use privacy-respecting server-side analytics only)</li>
              <li>Social media tracking cookies</li>
            </ul>
  
            <h2>Managing cookies</h2>
            <p>You can control cookies through your browser settings. Disabling essential cookies will prevent you from signing in to LogicMate.</p>
  
            <h2>Contact</h2>
            <p>For cookie-related enquiries: hello@logicmate.io</p>
          `,
          isPublished: true,
        },
        {
          slug: PageSlug.FAQ,
          title: 'Frequently Asked Questions',
          subtitle: 'Everything you need to know about LogicMate',
          metaTitle: 'FAQ — LogicMate',
          metaDescription: 'Find answers to common questions about LogicMate, our AI automations, pricing, and how to get started.',
          content: '',
          faqItems: [
            {
              question: 'What is LogicMate?',
              answer: 'LogicMate is an AI automation platform that lets you deploy pre-built agents and pipelines to automate content creation, social media, email marketing, and more. No coding required.',
              order: 1,
            },
            {
              question: 'How do I get started?',
              answer: 'Sign up for a free account, choose an automation or agent from our marketplace, connect your accounts, and configure your niche. Your first automation can be running in under 10 minutes.',
              order: 2,
            },
            {
              question: 'Do I need technical skills to use LogicMate?',
              answer: 'No. LogicMate is designed for non-technical users. You configure your automations through a simple dashboard — no coding, no server setup, no DevOps.',
              order: 3,
            },
            {
              question: 'What does YouTube Automation cost?',
              answer: 'The LogicMate subscription starts at $29/month. Additionally, each video generated costs approximately $3-$5 in API credits (Atlas video generation + OpenAI), billed directly to your API accounts. Cost varies based on the video model selected.',
              order: 4,
            },
            {
              question: 'Are my API keys safe?',
              answer: 'Yes. All API keys are encrypted with AES-256 before being stored in our database. Raw values are never logged, never displayed after initial entry, and never accessible to our team.',
              order: 5,
            },
            {
              question: 'Which platforms does LogicMate support?',
              answer: 'Currently YouTube (live). Social media (Instagram, Twitter, LinkedIn, TikTok), email marketing, e-commerce, content repurposing, and podcast automation are in development.',
              order: 6,
            },
            {
              question: 'Can I cancel my subscription?',
              answer: 'Yes, you can cancel at any time from your billing settings. Cancellation takes effect at the end of the current billing period. No partial refunds are issued.',
              order: 7,
            },
            {
              question: 'Does LogicMate comply with YouTube\'s AI content policies?',
              answer: 'Yes. Every video uploaded through LogicMate automatically has YouTube\'s required AI content disclosure flag set. Compliance with all other platform policies remains your responsibility.',
              order: 8,
            },
            {
              question: 'What happens if a third-party API goes down?',
              answer: 'Our pipelines have automatic fallbacks. For example, if Atlas Seedance is unavailable, the thumbnail falls back to a locally generated version. You receive an email notification of any issues.',
              order: 9,
            },
            {
              question: 'Is there a free trial?',
              answer: 'Yes. You can sign up and explore the dashboard for free. Running automations requires a paid subscription or your own API keys.',
              order: 10,
            },
          ],
          isPublished: true,
        },
      ];
  
      let created = 0;
      let updated = 0;
  
      for (const page of pages) {
        const existing = await this.pageModel.findOne({ slug: page.slug });
        if (existing) {
          await this.pageModel.findByIdAndUpdate(existing._id, { $set: page });
          updated++;
        } else {
          await this.pageModel.create(page);
          created++;
        }
      }
  
      return {
        message: `Pages seeded — ${created} created, ${updated} updated`,
        total: pages.length,
      };
    }
  
    // ─── Blog ─────────────────────────────────────────────────────
  
    async getBlogPosts(query: {
      page?: number;
      limit?: number;
      category?: string;
      tag?: string;
    }) {
      const page = Math.max(1, query.page || 1);
      const limit = Math.min(20, query.limit || 9);
      const skip = (page - 1) * limit;
  
      const filter: any = { isPublished: true };
      if (query.category) filter.category = query.category;
      if (query.tag) filter.tags = query.tag;
  
      const [posts, total] = await Promise.all([
        this.blogModel
          .find(filter)
          .sort({ publishedAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('title slug excerpt coverImage category tags authorName publishedAt readTimeMinutes viewCount')
          .lean(),
        this.blogModel.countDocuments(filter),
      ]);
  
      return {
        posts, total, page, limit,
        totalPages: Math.ceil(total / limit),
      };
    }
  
    async getBlogPost(slug: string) {
      const post = await this.blogModel.findOne({ slug, isPublished: true }).lean();
      if (!post) throw new NotFoundException('Blog post not found');
  
      // Increment view count
      await this.blogModel.findByIdAndUpdate(post._id, { $inc: { viewCount: 1 } });
      return post;
    }
  
    // Admin blog methods
    async getAllBlogPostsAdmin(query: { page?: number; limit?: number }) {
      const page = Math.max(1, query.page || 1);
      const limit = Math.min(50, query.limit || 20);
      const skip = (page - 1) * limit;
  
      const [posts, total] = await Promise.all([
        this.blogModel
          .find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.blogModel.countDocuments(),
      ]);
  
      return { posts, total, page, totalPages: Math.ceil(total / limit) };
    }
  
    async createBlogPost(dto: any, authorId: string, authorName: string) {
      if (!dto.slug) {
        dto.slug = dto.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
  
      dto.readTimeMinutes = Math.ceil(
        (dto.content?.split(' ')?.length || 0) / 200
      );
  
      return this.blogModel.create({
        ...dto,
        authorId: new Types.ObjectId(authorId),
        authorName,
        publishedAt: dto.isPublished ? new Date() : undefined,
      });
    }
  
    async updateBlogPost(id: string, dto: any) {
      if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Post not found');
  
      if (dto.content) {
        dto.readTimeMinutes = Math.ceil(dto.content.split(' ').length / 200);
      }
  
      if (dto.isPublished) {
        dto.publishedAt = dto.publishedAt || new Date();
      }
  
      const post = await this.blogModel.findByIdAndUpdate(
        id, { $set: dto }, { new: true }
      );
      if (!post) throw new NotFoundException('Post not found');
      return post;
    }
  
    async deleteBlogPost(id: string) {
      if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Post not found');
      await this.blogModel.findByIdAndDelete(id);
      return { message: 'Post deleted' };
    }
  }