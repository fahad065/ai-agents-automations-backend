import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Niche, NicheDocument } from './niches.schema';

const SEED_NICHES = [
  { slug: 'content_social',   name: 'Content & Social Media', icon: '📱', color: '#7c3aed', sortOrder: 1,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'real_estate',      name: 'Real Estate',            icon: '🏢', color: '#0ea5e9', sortOrder: 2,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'healthcare',       name: 'Healthcare & Clinics',   icon: '🏥', color: '#22c55e', sortOrder: 3,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'hr_recruitment',   name: 'HR & Recruitment',       icon: '🧑‍💼', color: '#f59e0b', sortOrder: 4,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'ecommerce_retail', name: 'E-commerce & Retail',    icon: '🛒', color: '#ef4444', sortOrder: 5,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'marketing',        name: 'Marketing & Agencies',   icon: '📣', color: '#a855f7', sortOrder: 6,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'hospitality',      name: 'Hospitality & Tourism',  icon: '🏨', color: '#06b6d4', sortOrder: 7,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'education',        name: 'Education & Schools',    icon: '🎓', color: '#84cc16', sortOrder: 8,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'logistics',        name: 'Logistics & Delivery',   icon: '🚚', color: '#f97316', sortOrder: 9,  availableIn: ['UAE', 'Kenya'] },
  { slug: 'agriculture',      name: 'Agriculture',            icon: '🌾', color: '#65a30d', sortOrder: 10, availableIn: ['Kenya'] },
  { slug: 'finance',          name: 'Finance & Microfinance', icon: '💰', color: '#eab308', sortOrder: 11, availableIn: ['UAE', 'Kenya'] },
  { slug: 'internal_copilot', name: 'Internal Copilot',       icon: '🤖', color: '#6366f1', sortOrder: 12, availableIn: ['UAE', 'Kenya'] },
];

@Injectable()
export class NichesService implements OnModuleInit {
  private readonly logger = new Logger(NichesService.name);

  constructor(
    @InjectModel(Niche.name) private nicheModel: Model<NicheDocument>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    for (const niche of SEED_NICHES) {
      await this.nicheModel.updateOne(
        { slug: niche.slug },
        { $setOnInsert: niche },
        { upsert: true },
      );
    }
    this.logger.log(`Niches seeded (${SEED_NICHES.length})`);
  }

  async findAll(country?: string): Promise<NicheDocument[]> {
    const filter: any = { isActive: true };
    if (country) filter.availableIn = country;
    return this.nicheModel.find(filter).sort({ sortOrder: 1 }).lean() as any;
  }

  async create(data: Partial<Niche>): Promise<NicheDocument> {
    return this.nicheModel.create(data);
  }

  async update(slug: string, data: Partial<Niche>): Promise<NicheDocument | null> {
    return this.nicheModel.findOneAndUpdate({ slug }, data, { new: true });
  }
}
