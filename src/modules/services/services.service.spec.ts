import { ServicesService } from './services.service';
import { legacyModuleToService } from './legacy-module.mapper';
import { LEGACY_SEED_MODULES } from './seed-services';
import { ServiceStatus, ServiceType } from './schemas/service.schema';

describe('legacyModuleToService', () => {
  const base = { slug: 'x', name: 'X', moduleType: 'agent' };

  it('maps isActive/isComingSoon to a single status', () => {
    expect(legacyModuleToService({ ...base, isActive: true, isComingSoon: false }).status).toBe(ServiceStatus.ACTIVE);
    expect(legacyModuleToService({ ...base, isActive: true, isComingSoon: true }).status).toBe(ServiceStatus.COMING_SOON);
    expect(legacyModuleToService({ ...base, isActive: false }).status).toBe(ServiceStatus.INACTIVE);
    expect(legacyModuleToService({ ...base }).status).toBe(ServiceStatus.ACTIVE);
  });

  it('renames moduleType -> type and features -> featureCards, leaving pricing.features alone', () => {
    const cards = [{ icon: '🔍', title: 'Trend discovery', description: 'd' }];
    const out = legacyModuleToService({
      ...base,
      moduleType: 'chatbot',
      features: cards,
      pricing: { monthly: 39, annual: 31, features: ['Website widget'] },
    });
    expect(out.type).toBe(ServiceType.CHATBOT);
    expect(out.content.featureCards).toEqual(cards);
    expect(out.pricing.features).toEqual(['Website widget']);
    expect(out).not.toHaveProperty('features');
    expect(out).not.toHaveProperty('moduleType');
    expect(out).not.toHaveProperty('isActive');
    expect(out).not.toHaveProperty('outputType');
    expect(out).not.toHaveProperty('badge');
  });

  it('drops fields that are not in the architecture.md services shape', () => {
    const out = legacyModuleToService({
      ...base, pipelineType: 'youtube', category: 'youtube', availableIn: ['UAE'], estimatedCostPerRun: '$3',
    });
    expect(out.pipeline.pipelineType).toBe('youtube');
    for (const f of ['category', 'availableIn', 'estimatedCostPerRun']) expect(out).not.toHaveProperty(f);
  });

  it('carries isDeleted through so soft-deleted modules stay soft-deleted', () => {
    expect(legacyModuleToService({ ...base, isDeleted: true }).isDeleted).toBe(true);
  });
});

describe('LEGACY_SEED_MODULES', () => {
  const mapped = LEGACY_SEED_MODULES.map(legacyModuleToService);

  it('has unique slugs', () => {
    const slugs = mapped.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('maps every entry to a real non-bundle type and a valid status', () => {
    for (const m of mapped) {
      expect([ServiceType.AGENT, ServiceType.AUTOMATION, ServiceType.CHATBOT]).toContain(m.type);
      expect(Object.values(ServiceStatus)).toContain(m.status);
    }
  });

  it('keeps the 7 chatbot templates with Basic/Pro pricing tiers', () => {
    const chatbots = mapped.filter((m) => m.type === ServiceType.CHATBOT);
    expect(chatbots).toHaveLength(7);
    for (const c of chatbots) {
      expect(c.pricing.tiers.map((t: any) => t.key)).toEqual(['basic', 'pro']);
    }
  });
});

describe('ServicesService.onModuleInit (seed only an empty database)', () => {
  const build = (count: number) => {
    const model: any = { estimatedDocumentCount: jest.fn().mockResolvedValue(count), insertMany: jest.fn().mockResolvedValue([]) };
    return { svc: new ServicesService(model, {} as any), model };
  };

  it('seeds the whole catalog into an empty database', async () => {
    const { svc, model } = build(0);
    await svc.onModuleInit();
    expect(model.insertMany).toHaveBeenCalledTimes(1);
    expect(model.insertMany.mock.calls[0][0]).toHaveLength(LEGACY_SEED_MODULES.length);
  });

  it('writes nothing once the catalog has any document', async () => {
    const { svc, model } = build(1);
    await svc.onModuleInit();
    expect(model.insertMany).not.toHaveBeenCalled();
  });
});

describe('ServicesService.update (uploaded media cleanup)', () => {
  const BASE = 'https://media.logicmate.io';
  const OLD_VIDEO = `${BASE}/services/gym-chatbot/videos/abc.mp4`;
  const build = (before: any, after: any) => {
    const model: any = {
      findOne: jest.fn(() => ({ select: () => ({ lean: async () => before }) })),
      findOneAndUpdate: jest.fn(() => Promise.resolve(after)),
    };
    const storage: any = { deleteKeys: jest.fn().mockResolvedValue(undefined) };
    return { svc: new ServicesService(model, storage), storage };
  };
  beforeEach(() => { process.env.R2_PUBLIC_URL = BASE; });

  it('deletes the old uploaded video when it is replaced', async () => {
    const { svc, storage } = build({ content: { demoVideoUrl: OLD_VIDEO } }, { content: { demoVideoUrl: `${BASE}/services/gym-chatbot/videos/new.mp4` } });
    await svc.update('gym-chatbot', { content: { demoVideoUrl: 'x' } });
    expect(storage.deleteKeys).toHaveBeenCalledWith('public', ['services/gym-chatbot/videos/abc.mp4']);
  });

  it('keeps files when nothing changed, and never touches outside links', async () => {
    const same = build({ content: { demoVideoUrl: OLD_VIDEO } }, { content: { demoVideoUrl: OLD_VIDEO } });
    await same.svc.update('gym-chatbot', { name: 'Gym' });
    expect(same.storage.deleteKeys).not.toHaveBeenCalled();
    const yt = build({ content: { demoVideoUrl: 'https://youtu.be/x', brochureUrl: 'https://blob.example/old.pdf' } }, { content: {} });
    await yt.svc.update('gym-chatbot', { content: {} });
    expect(yt.storage.deleteKeys).not.toHaveBeenCalled();
  });
});
