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
    expect(out.featureCards).toEqual(cards);
    expect(out.pricing.features).toEqual(['Website widget']);
    expect(out).not.toHaveProperty('features');
    expect(out).not.toHaveProperty('moduleType');
    expect(out).not.toHaveProperty('isActive');
    expect(out).not.toHaveProperty('outputType');
  });

  it('drops fields that are not in the architecture.md services shape', () => {
    const out = legacyModuleToService({
      ...base, pipelineType: 'youtube', category: 'youtube', availableIn: ['UAE'], estimatedCostPerRun: '$3',
    });
    expect(out.pipelineType).toBe('youtube');
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

  it('keeps the 9 chatbot templates with Basic/Pro pricing tiers', () => {
    const chatbots = mapped.filter((m) => m.type === ServiceType.CHATBOT);
    expect(chatbots).toHaveLength(9);
    for (const c of chatbots) {
      expect(c.pricingTiers.map((t: any) => t.key)).toEqual(['basic', 'pro']);
    }
  });
});

describe('ServicesService.dropRetiredFields', () => {
  it('unsets the retired fields through the raw collection (bypassing strict mode)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 22 });
    const svc = new ServicesService({ collection: { updateMany } } as any);
    await (svc as any).dropRetiredFields();
    const [filter, update] = updateMany.mock.calls[0];
    expect(filter.$or).toHaveLength(3);
    expect(Object.keys(update.$unset).sort()).toEqual(['availableIn', 'category', 'estimatedCostPerRun']);
  });
});
