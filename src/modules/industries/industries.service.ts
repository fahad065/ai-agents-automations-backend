import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Industry, IndustryDocument } from './industries.schema';

const SEED_INDUSTRIES = [
  {
    slug: 'content_social', name: 'Content & Social Media', name_ar: 'المحتوى والتواصل الاجتماعي',
    icon: '📱', color: '#7c3aed', sortOrder: 1, availableIn: ['UAE', 'Kenya'],
    description: 'Post to every platform, every day, in any language — without lifting a finger.',
    description_ar: 'انشر على كل منصة، كل يوم، بأي لغة — دون أن ترفع إصبعك.',
  },
  {
    slug: 'real_estate', name: 'Real Estate', name_ar: 'العقارات',
    icon: '🏢', color: '#0ea5e9', sortOrder: 2, availableIn: ['UAE', 'Kenya'],
    description: 'Qualify leads on WhatsApp and follow up 24/7 across UAE and Kenyan markets.',
    description_ar: 'أهّل العملاء المحتملين عبر واتساب وتابع معهم على مدار الساعة في أسواق الإمارات وكينيا.',
  },
  {
    slug: 'healthcare', name: 'Healthcare & Clinics', name_ar: 'الرعاية الصحية والعيادات',
    icon: '🏥', color: '#22c55e', sortOrder: 3, availableIn: ['UAE', 'Kenya'],
    description: 'HIPAA-aware agents for patient outreach and healthcare content.',
    description_ar: 'وكلاء ذكاء اصطناعي للتواصل مع المرضى وإنتاج المحتوى الطبي.',
  },
  {
    slug: 'hr_recruitment', name: 'HR & Recruitment', name_ar: 'الموارد البشرية والتوظيف',
    icon: '🧑‍💼', color: '#f59e0b', sortOrder: 4, availableIn: ['UAE', 'Kenya'],
    description: 'Post jobs, screen CVs and onboard new hires — all automated.',
    description_ar: 'انشر الوظائف وفرّز السيرات الذاتية وأدمج الموظفين الجدد — كل ذلك بشكل آلي.',
  },
  {
    slug: 'ecommerce_retail', name: 'E-commerce & Retail', name_ar: 'التجارة الإلكترونية والتجزئة',
    icon: '🛒', color: '#ef4444', sortOrder: 5, availableIn: ['UAE', 'Kenya'],
    description: 'Automate product listings, customer reviews and social selling.',
    description_ar: 'أتمتة قوائم المنتجات ومراجعات العملاء والبيع عبر التواصل الاجتماعي.',
  },
  {
    slug: 'marketing', name: 'Marketing & Agencies', name_ar: 'التسويق والوكالات',
    icon: '📣', color: '#a855f7', sortOrder: 6, availableIn: ['UAE', 'Kenya'],
    description: 'Build automated funnels that generate, nurture and convert leads at scale.',
    description_ar: 'أنشئ قمعًا تسويقيًا آليًا يولّد العملاء المحتملين ويرعاهم ويحوّلهم على نطاق واسع.',
  },
  {
    slug: 'hospitality', name: 'Hospitality & Tourism', name_ar: 'الضيافة والسياحة',
    icon: '🏨', color: '#06b6d4', sortOrder: 7, availableIn: ['UAE', 'Kenya'],
    description: 'Delight guests before, during and after their stay.',
    description_ar: 'أسعد ضيوفك قبل إقامتهم وأثناءها وبعدها.',
  },
  {
    slug: 'education', name: 'Education & Schools', name_ar: 'التعليم والمدارس',
    icon: '🎓', color: '#84cc16', sortOrder: 8, availableIn: ['UAE', 'Kenya'],
    description: 'Grow enrollments and keep students engaged with AI-driven content.',
    description_ar: 'زِد التسجيلات وحافظ على تفاعل الطلاب من خلال المحتوى المدعوم بالذكاء الاصطناعي.',
  },
  {
    slug: 'logistics', name: 'Logistics & Delivery', name_ar: 'اللوجستيات والتوصيل',
    icon: '🚚', color: '#f97316', sortOrder: 9, availableIn: ['UAE', 'Kenya'],
    description: 'Keep clients informed and operations moving without manual updates.',
    description_ar: 'أبقِ عملاءك على اطلاع دائم وحافظ على سير العمليات دون تحديثات يدوية.',
  },
  {
    slug: 'agriculture', name: 'Agriculture', name_ar: 'الزراعة',
    icon: '🌾', color: '#65a30d', sortOrder: 10, availableIn: ['Kenya'],
    description: 'Reach rural markets with localised, actionable agricultural intelligence.',
    description_ar: 'تواصل مع الأسواق الريفية بمعلومات زراعية محلية وقابلة للتنفيذ.',
  },
  {
    slug: 'finance', name: 'Finance & Microfinance', name_ar: 'المالية والتمويل الأصغر',
    icon: '💰', color: '#eab308', sortOrder: 11, availableIn: ['UAE', 'Kenya'],
    description: 'Automated market insights, reports and compliant financial content.',
    description_ar: 'رؤى سوقية آلية وتقارير ومحتوى مالي متوافق مع اللوائح.',
  },
  {
    slug: 'internal_copilot', name: 'Internal Copilot', name_ar: 'المساعد الداخلي',
    icon: '🤖', color: '#6366f1', sortOrder: 12, availableIn: ['UAE', 'Kenya'],
    description: 'AI copilots that support your internal teams and customer service.',
    description_ar: 'مساعدون بالذكاء الاصطناعي يدعمون فرقك الداخلية وخدمة العملاء.',
  },
];

@Injectable()
export class IndustriesService implements OnModuleInit {
  private readonly logger = new Logger(IndustriesService.name);

  constructor(
    @InjectModel(Industry.name) private industryModel: Model<IndustryDocument>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    for (const industry of SEED_INDUSTRIES) {
      await this.industryModel.updateOne(
        { slug: industry.slug },
        { $setOnInsert: industry },
        { upsert: true },
      );
    }
    this.logger.log(`Industries seeded (${SEED_INDUSTRIES.length})`);
  }

  async findAll(country?: string, lang = 'en'): Promise<any[]> {
    const filter: any = { isActive: true };
    if (country) filter.availableIn = country;
    const docs = await this.industryModel
      .find(filter)
      .populate('defaultModuleIds', 'name name_ar slug icon color moduleType')
      .sort({ sortOrder: 1 })
      .lean();
    return docs.map(d => this.localize(d, lang));
  }

  async findBySlug(slug: string, lang = 'en'): Promise<any> {
    const doc = await this.industryModel
      .findOne({ slug, isActive: true })
      .populate('defaultModuleIds', 'name name_ar slug icon color moduleType tagline tagline_ar')
      .lean();
    if (!doc) return null;
    return this.localize(doc, lang);
  }

  async create(data: Partial<Industry>): Promise<IndustryDocument> {
    return this.industryModel.create(data);
  }

  async update(slug: string, data: Partial<Industry>): Promise<IndustryDocument | null> {
    return this.industryModel.findOneAndUpdate({ slug }, data, { new: true });
  }

  async setDefaultModules(slug: string, moduleIds: string[]): Promise<IndustryDocument | null> {
    return this.industryModel.findOneAndUpdate(
      { slug },
      { defaultModuleIds: moduleIds },
      { new: true },
    );
  }

  private localize(doc: any, lang: string): any {
    if (lang !== 'ar') return doc;
    return {
      ...doc,
      name: doc.name_ar || doc.name,
      description: doc.description_ar || doc.description,
    };
  }
}
