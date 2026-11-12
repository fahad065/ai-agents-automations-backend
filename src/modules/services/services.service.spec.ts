import { Types } from 'mongoose';
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

describe('ServicesService migration', () => {
  function build(legacyDocs: any[]) {
    const serviceModel: any = {
      updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    const connection: any = {
      db: { collection: jest.fn(() => ({ find: () => ({ toArray: async () => legacyDocs }) })) },
    };
    return { service: new ServicesService(serviceModel, connection), serviceModel, connection };
  }

  it('reads the raw `modules` collection and upserts each doc keyed on its ORIGINAL _id', async () => {
    const id = new Types.ObjectId();
    const { service, serviceModel, connection } = build([
      { _id: id, slug: 'youtube-agent', name: 'YouTube Agent', moduleType: 'agent', features: [] },
    ]);
    await (service as any).migrateFromModules();

    expect(connection.db.collection).toHaveBeenCalledWith('modules');
    const [filter, update, opts] = serviceModel.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: id });
    expect(update.$setOnInsert._id).toBe(id);
    expect(update.$setOnInsert.slug).toBe('youtube-agent');
    expect(opts).toEqual({ upsert: true });
  });

  it('is insert-only ($setOnInsert, never $set) so admin edits in services survive every boot', async () => {
    const { service, serviceModel } = build([{ _id: new Types.ObjectId(), slug: 'a', name: 'A', moduleType: 'agent' }]);
    await (service as any).migrateFromModules();
    const update = serviceModel.updateOne.mock.calls[0][1];
    expect(Object.keys(update)).toEqual(['$setOnInsert']);
  });

  it('never writes undefined fields (they would land as null)', async () => {
    const { service, serviceModel } = build([{ _id: new Types.ObjectId(), slug: 'a', name: 'A', moduleType: 'agent' }]);
    await (service as any).migrateFromModules();
    const doc = serviceModel.updateOne.mock.calls[0][1].$setOnInsert;
    expect(Object.values(doc).some((v) => v === undefined)).toBe(false);
    expect(doc).not.toHaveProperty('demoVideoUrl');
  });

  it('skips (does not throw on) a slug collision and continues with the rest', async () => {
    const { service, serviceModel } = build([
      { _id: new Types.ObjectId(), slug: 'dup', name: 'Dup', moduleType: 'agent' },
      { _id: new Types.ObjectId(), slug: 'ok', name: 'Ok', moduleType: 'agent' },
    ]);
    serviceModel.updateOne
      .mockRejectedValueOnce(new Error('E11000 duplicate key error'))
      .mockResolvedValueOnce({ upsertedCount: 1 });
    await expect((service as any).migrateFromModules()).resolves.toBeUndefined();
    expect(serviceModel.updateOne).toHaveBeenCalledTimes(2);
  });

  it('is a no-op once `modules` has been dropped', async () => {
    const { service, serviceModel } = build([]);
    await (service as any).migrateFromModules();
    expect(serviceModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('ServicesService.dropRetiredFields', () => {
  it('unsets the retired fields through the raw collection (bypassing strict mode)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 22 });
    const svc = new ServicesService({ collection: { updateMany } } as any, {} as any);
    await (svc as any).dropRetiredFields();
    const [filter, update] = updateMany.mock.calls[0];
    expect(filter.$or).toHaveLength(3);
    expect(Object.keys(update.$unset).sort()).toEqual(['availableIn', 'category', 'estimatedCostPerRun']);
  });
});
