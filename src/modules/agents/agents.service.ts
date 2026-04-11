import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AgentTemplate,
  AgentTemplateDocument,
  AgentCategory,
} from './schemas/agent-template.schema';
import { UserAgent, UserAgentDocument, AgentStatus } from './schemas/user-agent.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AgentsService {
  constructor(
    @InjectModel(AgentTemplate.name)
    private templateModel: Model<AgentTemplateDocument>,
    @InjectModel(UserAgent.name)
    private agentModel: Model<UserAgentDocument>,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Templates ──────────────────────────────────────────────

  async getTemplates(onlyActive = true) {
    const filter = onlyActive ? { isActive: true } : {};
    return this.templateModel.find(filter).sort({ createdAt: 1 }).lean();
  }

  async getTemplateBySlug(slug: string) {
    const template = await this.templateModel.findOne({ slug }).lean();
    if (!template) throw new NotFoundException('Agent not found');
    return template;
  }

  async seedTemplates() {
    // Map from OLD slugs (already in DB) to NEW slugs
    // This lets us update existing docs without losing their _id
    const slugMapping: Record<string, string> = {
      'youtube-automation': 'youtube',     // old DB slug → new slug
      'dark-psychology': 'youtube',        // if already migrated once
      'fitness-coach': 'fitness',
      'marketing-agent': 'marketing',
    };
  
    const templates = [
      {
        // This will UPDATE the existing youtube-automation document
        // preserving its _id = 69cd74a987c1b10e8f26340f
        slug: 'youtube',
        name: 'Youtube Agent',
        tagline: 'Automate your entire YouTube channel with AI',
        description:
          'A fully automated YouTube content pipeline. Discovers trending topics in your niche, writes scripts, generates videos with Seedance, creates thumbnails, and uploads on a schedule — all automatically.',
        category: AgentCategory.YOUTUBE,
        icon: '📺',
        color: '#ef4444',
        badge: 'Live',
        isActive: true,
        capabilities: [
          'Trend discovery',
          'AI scriptwriting',
          'Seedance video generation',
          'TTS voiceover',
          'AI thumbnails',
          'Auto upload + scheduling',
          'Shorts extraction',
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
            title: 'Viral hook generation',
            description:
              'Generates psychological hooks proven to stop scrollers. Uses dark psychology principles like curiosity gaps, fear of missing out, and social proof triggers.',
            icon: '⚡',
          },
          {
            title: 'AI scriptwriting',
            description:
              'Full 8-12 minute scripts written in an authoritative, mysterious tone. Optimised for watch time and audience retention.',
            icon: '📝',
          },
          {
            title: 'Trend discovery',
            description:
              'Scans YouTube daily for trending topics in psychology, human behavior and self-improvement. Picks the highest-potential topic automatically.',
            icon: '🔍',
          },
          {
            title: 'SEO optimisation',
            description:
              'Titles, descriptions, tags and chapters all written for maximum YouTube search visibility. Targets low-competition, high-CPM keywords.',
            icon: '📈',
          },
          {
            title: 'Seedance video generation',
            description:
              '12 cinematic dark and atmospheric video clips generated per video using Seedance v1.5 Pro. $1.32 per complete video.',
            icon: '🎬',
          },
          {
            title: 'Auto upload + scheduling',
            description:
              'Videos uploaded as private with publishAt timestamps. Goes live Tuesday, Thursday, Saturday at your configured time.',
            icon: '📤',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Agent discovers trending topic',
            description:
              'Every day the agent scans YouTube for viral psychology topics. Scores each one for CPM potential, competition level, and evergreen value — then picks the best.',
          },
          {
            step: '02',
            title: 'Script and metadata generated',
            description:
              'Ollama LLM writes a full 10-minute script, YouTube title, description, tags, chapters, thumbnail prompt and hook. All in your brand voice.',
          },
          {
            step: '03',
            title: 'Video created automatically',
            description:
              'Seedance generates 12 cinematic clips. OpenAI TTS narrates the script. FFmpeg assembles the final video with subtitles. Flux AI generates the thumbnail.',
          },
          {
            step: '04',
            title: 'Uploaded and scheduled',
            description:
              'The finished video uploads to YouTube, sets the thumbnail, adds chapters, and schedules to go public at your preferred time. You get an email when done.',
          },
        ],
        testimonials: [
          {
            name: 'Ahmed K.',
            role: 'YouTube Creator',
            avatar: 'AK',
            text: 'Generated 30 videos in my first month. Channel went from 0 to 8k views per day in 6 weeks. The ROI is insane for $1.32 per video.',
            rating: 5,
          },
          {
            name: 'Raj P.',
            role: 'Content Creator',
            avatar: 'RP',
            text: 'The onyx TTS voice for dark psychology content is perfect. Deep and authoritative. My audience cannot tell it is AI.',
            rating: 5,
          },
          {
            name: 'Fatima A.',
            role: 'Digital Marketer',
            avatar: 'FA',
            text: 'Pipeline runs while I sleep. Wake up to an email saying video uploaded and 3 shorts scheduled. Completely changed my workflow.',
            rating: 5,
          },
        ],
        pricing: {
          monthly: 29,
          annual: 19,
          features: [
            'Unlimited pipeline runs',
            'Daily trend discovery',
            'Full script generation',
            'Seedance video clips included',
            'Auto YouTube upload',
            '3 shorts per video',
            'AI thumbnail generation',
            'Email notifications',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'How much does video generation cost?',
            answer:
              'Each video costs approximately $1.32 in Seedance API credits (12 clips × 5 seconds × $0.022/second). This is billed directly to your Atlas account.',
          },
          {
            question: 'Do I need a YouTube channel already?',
            answer:
              'Yes. You need an existing YouTube channel and Google account with YouTube API access enabled. The agent uploads directly to your channel via OAuth.',
          },
          {
            question: 'Can viewers tell the content is AI generated?',
            answer:
              'The scripts, voiceover, and videos are high quality — most viewers cannot tell. YouTube requires AI content disclosure which we set automatically on every upload.',
          },
          {
            question: 'How many videos does it generate per week?',
            answer:
              'By default 3 long-form videos per week (Tuesday, Thursday, Saturday) plus 3 shorts from each. You can configure the schedule to daily if you want more.',
          },
          {
            question: 'What happens if Atlas API is down?',
            answer:
              'The pipeline retries automatically. If Atlas is completely unavailable it falls back to a Pillow-generated thumbnail and continues. You get an email notification of any issues.',
          },
        ],
        defaultConfig: {
          niche: '',               // empty — user fills in their own
          scheduleFrequency: 'daily',
          scheduleTime: '08:00',
          timezone: 'Asia/Dubai',
          voice: 'onyx',
          videoLength: '10min',
        },
        demoVideoUrl: 'https://youtu.be/E3tBDqClLyU',
      },
      {
        slug: 'fitness',
        name: 'Fitness Coach Agent',
        tagline: 'AI fitness coaching that never sleeps',
        description:
          'An AI fitness agent that creates personalised workout plans, nutrition content, and progress tracking videos for fitness creators and online coaches.',
        category: AgentCategory.FITNESS,
        icon: '💪',
        color: '#22c55e',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Personalised workout plans',
          'Nutrition content',
          'Progress tracking scripts',
          'Trend-aware content',
          'Multi-format output',
          'Brand voice training',
        ],
        heroStats: [
          { label: 'Content formats', value: '5' },
          { label: 'Platforms supported', value: '4' },
          { label: 'Avg engagement rate', value: 'Coming soon' },
          { label: 'Channels supported', value: 'Coming soon' },
        ],
        features: [
          {
            title: 'Personalised workout plans',
            description:
              'Generates complete weekly workout plans tailored to specific goals, equipment, and fitness levels.',
            icon: '🏋️',
          },
          {
            title: 'Nutrition content',
            description:
              'Creates meal plans, macro breakdowns, and nutrition education videos automatically.',
            icon: '🥗',
          },
          {
            title: 'Progress tracking scripts',
            description:
              'Generates scripts for before/after content, transformation videos, and milestone celebrations.',
            icon: '📊',
          },
          {
            title: 'Trend-aware content',
            description:
              'Stays on top of fitness trends and creates timely content around new exercises, diet trends, and supplement research.',
            icon: '🔥',
          },
          {
            title: 'Multi-format output',
            description:
              'Creates long-form YouTube videos, Instagram Reels scripts, TikTok hooks, and email newsletters.',
            icon: '📱',
          },
          {
            title: 'Brand voice training',
            description:
              'Learns your coaching style, tone, and methodology. Content sounds like you, not generic AI.',
            icon: '🎯',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Set your coaching niche',
            description:
              'Tell the agent your specialty — weight loss, muscle building, endurance, nutrition. It calibrates all content to your audience.',
          },
          {
            step: '02',
            title: 'Agent researches trending topics',
            description:
              'Scans fitness subreddits, YouTube trending, and Google Trends daily to find what your audience wants to learn.',
          },
          {
            step: '03',
            title: 'Content created and formatted',
            description:
              'Scripts, workout plans, and visual content generated across all your platforms simultaneously.',
          },
          {
            step: '04',
            title: 'Published on schedule',
            description:
              'Content goes live at optimal times for your audience timezone. You review and approve before publish.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 39,
          annual: 29,
          features: [
            'Unlimited content generation',
            'Multi-platform publishing',
            'Workout plan generator',
            'Nutrition content creator',
            'YouTube video scripts',
            'Instagram Reels scripts',
            'Email newsletter writer',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this agent launch?',
            answer:
              'The Fitness Coach Agent is currently in development. Join the waitlist to get early access and a 40% launch discount.',
          },
          {
            question: 'Will it work for any fitness niche?',
            answer:
              'Yes — weight loss, muscle building, yoga, running, nutrition, CrossFit. You define the niche and the agent specialises accordingly.',
          },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          niche: 'fitness and wellness',
          scheduleFrequency: 'daily',
          scheduleTime: '07:00',
        },
      },
      {
        slug: 'marketing',
        name: 'Marketing Agent',
        tagline: 'AI that runs your entire marketing',
        description:
          'End-to-end marketing automation — ad copy, email campaigns, social content, A/B testing, and performance analytics all handled by AI.',
        category: AgentCategory.MARKETING,
        icon: '📣',
        color: '#f59e0b',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Ad copywriting',
          'Email campaigns',
          'Social media content',
          'A/B testing',
          'Performance analytics',
          'Landing page copy',
        ],
        heroStats: [
          { label: 'Platforms supported', value: '6' },
          { label: 'Ad variations generated', value: 'Coming soon' },
          { label: 'Email open rate boost', value: 'Coming soon' },
          { label: 'Campaigns managed', value: 'Coming soon' },
        ],
        features: [
          {
            title: 'Ad copywriting',
            description:
              'Generates high-converting ad copy for Google, Facebook, Instagram, and LinkedIn. Multiple variations for A/B testing.',
            icon: '✍️',
          },
          {
            title: 'Email campaigns',
            description:
              'Writes full drip sequences, newsletters, and promotional emails. Optimised subject lines and CTAs.',
            icon: '📧',
          },
          {
            title: 'Social media content',
            description:
              'Daily content calendar across all platforms. Captions, hashtags, and posting schedules handled automatically.',
            icon: '📱',
          },
          {
            title: 'A/B testing',
            description:
              'Generates multiple variants of every piece of copy. Tracks performance and doubles down on winners.',
            icon: '🧪',
          },
          {
            title: 'Performance analytics',
            description:
              'Pulls data from all platforms into one dashboard. Identifies what is working and auto-optimises.',
            icon: '📊',
          },
          {
            title: 'Landing page copy',
            description:
              'Writes complete landing pages, sales pages, and product descriptions that convert.',
            icon: '🎯',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Connect your platforms',
            description:
              'Link your ad accounts, email platform, and social media. The agent gets read access to your existing performance data.',
          },
          {
            step: '02',
            title: 'Define your goals',
            description:
              'Tell the agent your target audience, product, and goals. It builds a full marketing strategy automatically.',
          },
          {
            step: '03',
            title: 'Content generated daily',
            description:
              'Ad copy, emails, and social posts created every day based on your strategy and what is performing best.',
          },
          {
            step: '04',
            title: 'Optimise and scale',
            description:
              'The agent learns from performance data, stops what is not working, and scales what is. Fully autonomous.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 49,
          annual: 35,
          features: [
            'Unlimited ad copy generation',
            'Email campaign writer',
            'Social media calendar',
            'A/B testing framework',
            'Multi-platform analytics',
            'Landing page copy',
            'Weekly performance reports',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this agent launch?',
            answer:
              'The Marketing Agent is in development. Join the waitlist for early access.',
          },
          {
            question: 'Which ad platforms does it support?',
            answer:
              'Google Ads, Facebook Ads, Instagram Ads, LinkedIn Ads, Twitter Ads, and TikTok Ads at launch.',
          },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          niche: 'digital marketing',
          scheduleFrequency: 'daily',
        },
      },
      {
        slug: 'education',
        name: 'Education Agent',
        tagline: 'Turn your knowledge into a course empire',
        description:
          'Creates educational content, online courses, quiz generators, explainer videos, and slide decks automatically from your expertise.',
        category: AgentCategory.EDUCATION,
        icon: '🎓',
        color: '#3b82f6',
        badge: 'Coming soon',
        isActive: true,
        capabilities: [
          'Course creation',
          'Quiz generation',
          'Explainer videos',
          'Slide deck creation',
          'Study guide writing',
          'Assessment design',
        ],
        heroStats: [
          { label: 'Content formats', value: '6' },
          { label: 'Subjects supported', value: 'Unlimited' },
          { label: 'Courses created', value: 'Coming soon' },
          { label: 'Student completion rate', value: 'Coming soon' },
        ],
        features: [
          {
            title: 'Course creation',
            description:
              'Turns your expertise into structured online courses with modules, lessons, and learning objectives.',
            icon: '📚',
          },
          {
            title: 'Quiz generation',
            description:
              'Creates quizzes, assessments, and practice tests with answer keys and explanations automatically.',
            icon: '✅',
          },
          {
            title: 'Explainer videos',
            description:
              'Converts complex topics into clear, engaging explainer video scripts with visual aids.',
            icon: '🎥',
          },
          {
            title: 'Slide deck creation',
            description:
              'Generates complete PowerPoint and Google Slides presentations from your content.',
            icon: '📊',
          },
          {
            title: 'Study guide writing',
            description:
              'Creates comprehensive study guides, cheat sheets, and reference materials for students.',
            icon: '📖',
          },
          {
            title: 'Assessment design',
            description:
              'Designs rubrics, grading criteria, and assessment frameworks for any subject.',
            icon: '🎯',
          },
        ],
        howItWorks: [
          {
            step: '01',
            title: 'Define your subject',
            description:
              'Tell the agent your area of expertise and target audience. It maps out a complete content curriculum.',
          },
          {
            step: '02',
            title: 'Content structured automatically',
            description:
              'Modules, lessons, and learning paths created from your input. Logical progression guaranteed.',
          },
          {
            step: '03',
            title: 'Multi-format generation',
            description:
              'Video scripts, slides, quizzes, and study materials all created simultaneously.',
          },
          {
            step: '04',
            title: 'Publish to your platform',
            description:
              'Content exported to Teachable, Udemy, Kajabi, or your own LMS automatically.',
          },
        ],
        testimonials: [],
        pricing: {
          monthly: 35,
          annual: 25,
          features: [
            'Unlimited course content',
            'Quiz and assessment generator',
            'Video script writer',
            'Slide deck creator',
            'Study guide generator',
            'LMS integrations',
            'Student progress tracking',
            'Priority support',
          ],
        },
        faq: [
          {
            question: 'When will this agent launch?',
            answer:
              'The Education Agent is in development. Join the waitlist for early access.',
          },
          {
            question: 'Which LMS platforms does it support?',
            answer:
              'Teachable, Udemy, Kajabi, Thinkific, and custom LMS via API at launch.',
          },
        ],
        demoVideoUrl: '',
        defaultConfig: {
          niche: 'online education',
          scheduleFrequency: 'weekly',
        },
      },
    ];
  
    let created = 0;
    let updated = 0;
  
    for (const template of templates) {
      // Check by new slug first
      let existing = await this.templateModel.findOne({ slug: template.slug });
  
      // If not found by new slug, check if there's an old slug to migrate
      if (!existing) {
        const oldSlug = Object.keys(slugMapping).find(
          (k) => slugMapping[k] === template.slug,
        );
        if (oldSlug) {
          existing = await this.templateModel.findOne({ slug: oldSlug });
        }
      }
  
      if (existing) {
        // Update in place — preserves the _id so UserAgent references stay valid
        await this.templateModel.findByIdAndUpdate(
          existing._id,
          { $set: template },
          { new: true },
        );
        updated++;
      } else {
        await this.templateModel.create(template);
        created++;
      }
    }
  
    return {
      message: `Seed complete — ${created} created, ${updated} updated`,
      total: templates.length,
    };
  }

  // ─── User Agents ─────────────────────────────────────────────

  async createAgent(userId: string, body: any) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user');
    }

    const template = await this.templateModel.findById(body.templateId);
    if (!template) throw new NotFoundException('Template not found');

    const agent = await this.agentModel.create({
      userId: new Types.ObjectId(userId),
      templateId: template._id,
      name: body.name || template.name,
      niche: body.niche || template.defaultConfig?.niche || '',
      scheduleFrequency: body.scheduleFrequency || 'daily',
      scheduleTime: body.scheduleTime || '08:00',
      status: 'active',
      videosGenerated: 0,
      creditsUsed: 0,
    });

    await this.notificationsService.onAgentCreated(userId, agent.name, body.niche || '');

    return this.agentModel
      .findById(agent._id)
      .populate('templateId', 'name slug category icon color');
  }

  async getUserAgents(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return [];

    return this.agentModel
      .find({
        userId: new Types.ObjectId(userId),
        isDeleted: { $ne: true },
      })
      .populate('templateId', 'name slug category icon color capabilities')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getAgentById(userId: string, agentId: string) {
    if (!Types.ObjectId.isValid(agentId)) {
      throw new NotFoundException('Agent not found');
    }

    const agent = await this.agentModel
      .findOne({
        _id: new Types.ObjectId(agentId),
        userId: new Types.ObjectId(userId),
        isDeleted: { $ne: true },
      })
      .populate('templateId')
      .lean();

    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async updateAgent(userId: string, agentId: string, body: any) {
    if (!Types.ObjectId.isValid(agentId)) {
      throw new NotFoundException('Agent not found');
    }

    const agent = await this.agentModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(agentId),
        userId: new Types.ObjectId(userId),
        isDeleted: { $ne: true },
      },
      {
        $set: {
          ...(body.name && { name: body.name }),
          ...(body.niche && { niche: body.niche }),
          ...(body.scheduleFrequency && {
            scheduleFrequency: body.scheduleFrequency,
          }),
          ...(body.scheduleTime && { scheduleTime: body.scheduleTime }),
        },
      },
      { new: true },
    ).populate('templateId', 'name slug category icon color');

    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async toggleAgentStatus(userId: string, agentId: string) {
    if (!Types.ObjectId.isValid(agentId)) {
      throw new NotFoundException('Agent not found');
    }

    const agent = await this.agentModel.findOne({
      _id: new Types.ObjectId(agentId),
      userId: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    });

    if (!agent) throw new NotFoundException('Agent not found');

    agent.status = agent.status === AgentStatus.ACTIVE ? AgentStatus.PAUSED : AgentStatus.ACTIVE;

    await agent.save();
    return agent;
  }

  async deleteAgent(userId: string, agentId: string) {
    if (!Types.ObjectId.isValid(agentId)) {
      throw new NotFoundException('Agent not found');
    }

    const agent = await this.agentModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(agentId),
        userId: new Types.ObjectId(userId),
      },
      { isDeleted: true, status: 'paused' },
      { new: true },
    );

    if (!agent) throw new NotFoundException('Agent not found');

    await this.notificationsService.onAgentDeleted(userId, agent.name);
    return { message: 'Agent deleted' };
  }
}