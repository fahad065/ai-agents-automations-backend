import { ServiceStatus, ServiceType } from './schemas/service.schema';

// Old ModuleTemplate document (from the `modules` collection, or the legacy-
// shaped seed data) -> new `services` document. The single place this
// mapping lives — used by both the boot-time migration and the seed.
//
// Renamed: moduleType -> type, features -> featureCards,
//          isActive + isComingSoon -> status, pricingTiers -> pricing.tiers.
// Grouped (2026-11-16): content / display / pipeline / pricing — see
//          service.schema.ts. `badge` dropped: the pill comes from status.
// Dropped: outputType and totalUsersCount/totalRunsCount/avgCostPerRun
//          (zero readers), plus category, availableIn and
//          estimatedCostPerRun (not in the architecture.md services shape;
//          their readers were moved to nicheSlug or removed).
export function legacyModuleToService(m: Record<string, any>): Record<string, any> {
  let status = ServiceStatus.ACTIVE;
  if (m.isComingSoon) status = ServiceStatus.COMING_SOON;
  else if (m.isActive === false) status = ServiceStatus.INACTIVE;

  return {
    type: (m.moduleType as ServiceType) || ServiceType.AGENT,
    name: m.name,
    name_ar: m.name_ar,
    slug: m.slug,
    status,
    isDeleted: !!m.isDeleted,
    nicheSlug: m.nicheSlug,
    include: [],
    content: {
      tagline: m.tagline,
      tagline_ar: m.tagline_ar,
      description: m.description,
      description_ar: m.description_ar,
      capabilities: m.capabilities || [],
      capabilities_ar: m.capabilities_ar || [],
      heroStats: m.heroStats || [],
      featureCards: m.features || [],
      howItWorks: m.howItWorks || [],
      faq: m.faq || [],
      demoVideoUrl: m.demoVideoUrl,
    },
    display: {
      icon: m.icon ?? '🤖',
      color: m.color ?? '#7c3aed',
      sortOrder: m.sortOrder ?? 0,
      platforms: m.platforms || [],
    },
    pipeline: {
      pipelineType: m.pipelineType,
      pipelineCategory: m.pipelineCategory || 'standalone',
      components: m.components || [],
      requiredApiKeys: m.requiredApiKeys || [],
      defaultConfig: m.defaultConfig || {},
    },
    pricing: {
      ...(m.pricing || { monthly: 0, annual: 0, features: [] }),
      tiers: m.pricingTiers || [],
    },
  };
}
