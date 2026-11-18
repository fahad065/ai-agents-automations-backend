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
    return { svc: new ServicesService(model), model };
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
