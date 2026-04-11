import {
    Injectable,
    NotFoundException,
    BadRequestException,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import { Page, PageDocument, PageSlug } from './schemas/page.schema';
  import { BlogPost, BlogPostDocument, BlogCategory } from './schemas/blog-post.schema';
  
  @Injectable()
  export class CmsService {
    constructor(
      @InjectModel(Page.name) private pageModel: Model<PageDocument>,
      @InjectModel(BlogPost.name) private blogModel: Model<BlogPostDocument>,
    ) {}
  
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
          title: 'About NexAgent',
          subtitle: 'We are building the future of business automation',
          metaTitle: 'About NexAgent — AI Automation Platform',
          metaDescription: 'Learn about NexAgent, our mission to make AI automation accessible to every business, and the team behind the platform.',
          content: `
            <h2>Our mission</h2>
            <p>NexAgent exists to give every business — from solo creators to enterprise teams — access to the same AI automation capabilities that were previously only available to large tech companies with dedicated engineering teams.</p>
  
            <h2>What we do</h2>
            <p>We build pre-configured AI agents and automation pipelines that plug into your existing tools and workflows. No code required. No ML expertise needed. Just connect your accounts, configure your niche, and let the agents run.</p>
  
            <h2>Why we built this</h2>
            <p>The founder spent months building a custom YouTube automation pipeline — trend discovery, scriptwriting, video generation, thumbnail creation, uploading — from scratch. It worked incredibly well but took hundreds of hours to build and maintain.</p>
            <p>We realised that every creator and business owner needed this, but almost none had the technical skills to build it. NexAgent is that pipeline, productised and made available to everyone.</p>
  
            <h2>Our values</h2>
            <ul>
              <li><strong>Transparency</strong> — We tell you exactly what our agents do, what they cost, and how they work.</li>
              <li><strong>Quality over quantity</strong> — We would rather have 10 agents that work perfectly than 100 that work poorly.</li>
              <li><strong>Accessible pricing</strong> — AI automation should not cost thousands of dollars per month. We keep prices low by building efficient pipelines.</li>
              <li><strong>Privacy first</strong> — Your API keys are encrypted. Your content is yours. We never train on your data.</li>
            </ul>
          `,
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
          metaTitle: 'Contact NexAgent — Get in Touch',
          metaDescription: 'Contact the NexAgent team for support, partnerships, or general enquiries.',
          content: `
            <p>Whether you have a question about our automations, need technical support, or want to explore a partnership — we are here to help.</p>
            <p>We aim to respond to all enquiries within 24 hours on business days.</p>
          `,
          contactInfo: {
            email: 'hello@nexagent.ai',
            supportEmail: 'support@nexagent.ai',
            twitter: 'https://twitter.com/nexagent',
            linkedin: 'https://linkedin.com/company/nexagent',
            address: 'Dubai, United Arab Emirates',
          },
          isPublished: true,
        },
        {
          slug: PageSlug.PRIVACY,
          title: 'Privacy Policy',
          subtitle: 'Last updated: April 8, 2026',
          metaTitle: 'Privacy Policy — NexAgent',
          metaDescription: 'Read the NexAgent privacy policy to understand how we collect, use and protect your personal data.',
          content: `
            <h2>1. Information we collect</h2>
            <p>We collect information you provide directly — your name, email address, and payment details when you create an account or subscribe to a plan.</p>
            <p>We also collect usage data — pages visited, features used, and pipeline runs — to improve our service.</p>
  
            <h2>2. How we use your information</h2>
            <ul>
              <li>To provide and maintain our service</li>
              <li>To send you important service notifications</li>
              <li>To process payments securely via Stripe</li>
              <li>To improve our automations and agents based on usage patterns</li>
              <li>To respond to your support requests</li>
            </ul>
  
            <h2>3. API keys and credentials</h2>
            <p>All API keys stored in NexAgent are encrypted using AES-256 encryption before being saved to our database. Raw key values are never logged, never displayed after initial entry, and never shared with third parties.</p>
  
            <h2>4. Data sharing</h2>
            <p>We do not sell your personal data. We share data only with:</p>
            <ul>
              <li><strong>Stripe</strong> — for payment processing</li>
              <li><strong>MongoDB Atlas</strong> — for database hosting</li>
              <li><strong>Vercel</strong> — for application hosting</li>
            </ul>
            <p>All third-party services are bound by their own privacy policies and data processing agreements.</p>
  
            <h2>5. Data retention</h2>
            <p>We retain your data for as long as your account is active. When you delete your account, your personal data is removed within 30 days. Generated content (videos, scripts) stored locally on your machine is not affected.</p>
  
            <h2>6. Your rights</h2>
            <p>You have the right to access, correct, export, or delete your personal data at any time. Contact us at privacy@nexagent.ai to exercise these rights.</p>
  
            <h2>7. Cookies</h2>
            <p>We use essential cookies for authentication and preference storage. We do not use advertising or tracking cookies. See our Cookie Policy for details.</p>
  
            <h2>8. Contact</h2>
            <p>For privacy-related enquiries, contact us at privacy@nexagent.ai</p>
          `,
          isPublished: true,
        },
        {
          slug: PageSlug.TERMS,
          title: 'Terms of Service',
          subtitle: 'Last updated: April 8, 2026',
          metaTitle: 'Terms of Service — NexAgent',
          metaDescription: 'Read the NexAgent terms of service governing your use of the platform.',
          content: `
            <h2>1. Acceptance of terms</h2>
            <p>By accessing or using NexAgent, you agree to be bound by these Terms of Service. If you do not agree, do not use our service.</p>
  
            <h2>2. Description of service</h2>
            <p>NexAgent provides AI-powered automation tools and agents for content creation, social media, email marketing, and related business workflows. The service is provided on a subscription basis.</p>
  
            <h2>3. Account responsibilities</h2>
            <ul>
              <li>You are responsible for maintaining the confidentiality of your account credentials</li>
              <li>You are responsible for all activity that occurs under your account</li>
              <li>You must provide accurate information when creating your account</li>
              <li>You must be at least 18 years old to use the service</li>
            </ul>
  
            <h2>4. Acceptable use</h2>
            <p>You may not use NexAgent to:</p>
            <ul>
              <li>Generate spam, misleading, or deceptive content</li>
              <li>Violate any applicable laws or platform terms of service (YouTube, Instagram, etc.)</li>
              <li>Attempt to reverse engineer, hack, or exploit the platform</li>
              <li>Resell or redistribute our service without written permission</li>
            </ul>
  
            <h2>5. AI-generated content</h2>
            <p>You are responsible for reviewing and complying with platform policies (YouTube, Instagram, etc.) regarding AI-generated content. NexAgent automatically sets required AI disclosure flags where applicable, but compliance with all platform rules remains your responsibility.</p>
  
            <h2>6. Third-party API costs</h2>
            <p>Some automations use third-party APIs (Atlas Seedance, OpenAI, etc.) that have their own pricing. These costs are separate from your NexAgent subscription and billed directly by those providers. NexAgent is not responsible for third-party API costs or outages.</p>
  
            <h2>7. Payment and cancellation</h2>
            <p>Subscriptions are billed monthly or annually. You may cancel at any time — cancellation takes effect at the end of the current billing period. No refunds are issued for partial periods.</p>
  
            <h2>8. Limitation of liability</h2>
            <p>NexAgent is provided "as is". We are not liable for any indirect, incidental, or consequential damages arising from your use of the service, including any content generated by our AI agents.</p>
  
            <h2>9. Changes to terms</h2>
            <p>We may update these terms at any time. We will notify you via email of material changes. Continued use after notification constitutes acceptance.</p>
  
            <h2>10. Contact</h2>
            <p>Legal enquiries: legal@nexagent.ai</p>
          `,
          isPublished: true,
        },
        {
          slug: PageSlug.COOKIES,
          title: 'Cookie Policy',
          subtitle: 'Last updated: April 8, 2026',
          metaTitle: 'Cookie Policy — NexAgent',
          metaDescription: 'Learn how NexAgent uses cookies and how you can manage your cookie preferences.',
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
            <p>You can control cookies through your browser settings. Disabling essential cookies will prevent you from signing in to NexAgent.</p>
  
            <h2>Contact</h2>
            <p>For cookie-related enquiries: privacy@nexagent.ai</p>
          `,
          isPublished: true,
        },
        {
          slug: PageSlug.FAQ,
          title: 'Frequently Asked Questions',
          subtitle: 'Everything you need to know about NexAgent',
          metaTitle: 'FAQ — NexAgent',
          metaDescription: 'Find answers to common questions about NexAgent, our AI automations, pricing, and how to get started.',
          content: '',
          faqItems: [
            {
              question: 'What is NexAgent?',
              answer: 'NexAgent is an AI automation platform that lets you deploy pre-built agents and pipelines to automate content creation, social media, email marketing, and more. No coding required.',
              order: 1,
            },
            {
              question: 'How do I get started?',
              answer: 'Sign up for a free account, choose an automation or agent from our marketplace, connect your accounts, and configure your niche. Your first automation can be running in under 10 minutes.',
              order: 2,
            },
            {
              question: 'Do I need technical skills to use NexAgent?',
              answer: 'No. NexAgent is designed for non-technical users. You configure your automations through a simple dashboard — no coding, no server setup, no DevOps.',
              order: 3,
            },
            {
              question: 'What does YouTube Automation cost?',
              answer: 'The NexAgent subscription starts at $29/month. Additionally, each video generated costs approximately $1.32 in Seedance API credits (billed directly to your Atlas account). This is separate from your NexAgent subscription.',
              order: 4,
            },
            {
              question: 'Are my API keys safe?',
              answer: 'Yes. All API keys are encrypted with AES-256 before being stored in our database. Raw values are never logged, never displayed after initial entry, and never accessible to our team.',
              order: 5,
            },
            {
              question: 'Which platforms does NexAgent support?',
              answer: 'Currently YouTube (live). Social media (Instagram, Twitter, LinkedIn, TikTok), email marketing, e-commerce, content repurposing, and podcast automation are in development.',
              order: 6,
            },
            {
              question: 'Can I cancel my subscription?',
              answer: 'Yes, you can cancel at any time from your billing settings. Cancellation takes effect at the end of the current billing period. No partial refunds are issued.',
              order: 7,
            },
            {
              question: 'Does NexAgent comply with YouTube\'s AI content policies?',
              answer: 'Yes. Every video uploaded through NexAgent automatically has YouTube\'s required AI content disclosure flag set. Compliance with all other platform policies remains your responsibility.',
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