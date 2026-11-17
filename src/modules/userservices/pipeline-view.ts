// Agents/automations are userservices rows (type 'agent' | 'automation')
// since 2026-11-17. The /userservices API answers in the flat shape the
// dashboard already reads (My Services cards, the edit modal, the pipeline
// widget), so `toPipelineView()` flattens a row and `PIPELINE_FIELD_PATHS`
// says where each editable field now lives.

// Editable field (as the API knows it) → path on the userservices row.
export const PIPELINE_FIELD_PATHS: Record<string, string> = {
  name: 'name',
  niche: 'config.niche',
  scheduleFrequency: 'config.schedule.frequency',
  scheduleTime: 'config.schedule.time',
  scheduleDays: 'config.schedule.days',
  customPrompt: 'config.customPrompt',
  useCustomPrompt: 'config.useCustomPrompt',
  youtubeChannelId: 'config.youtubeChannelId',
  videoModel: 'config.videoModel',
  enabledComponents: 'config.enabledComponents',
};

const plain = (v: any) => (v && typeof v.toObject === 'function' ? v.toObject() : v);

// The dashboard's status pill. Paused is the customer's own switch; an
// unpaid trial shows as "expired" like before.
function displayStatus(r: any): string {
  if (r.config?.paused && ['trial', 'active'].includes(r.status)) return 'paused';
  if (r.status === 'past_due') return 'expired';
  return r.status;
}

// serviceId may be populated (name/slug/display/pipeline/pricing) or a bare id.
export function toPipelineView(row: any) {
  const r = plain(row) || {};
  const c = r.config || {};
  const svc = r.serviceId && typeof r.serviceId === 'object' && 'name' in r.serviceId ? r.serviceId : null;
  return {
    _id: r._id,
    userId: r.userId,
    serviceId: svc ? svc._id : r.serviceId,
    moduleId: svc
      ? {
          _id: svc._id,
          name: svc.name,
          slug: svc.slug,
          icon: svc.display?.icon,
          color: svc.display?.color,
          pipelineType: svc.pipeline?.pipelineType,
          capabilities: svc.content?.capabilities || [],
          platforms: svc.display?.platforms || [],
          pricing: svc.pricing,
        }
      : r.serviceId,
    moduleName: svc?.name || r.name,
    moduleType: r.type,
    name: r.name,
    status: displayStatus(r),
    paused: !!c.paused,
    pipelineType: c.pipelineType,
    pipelineCategory: c.pipelineCategory,
    nicheSlug: c.nicheSlug,
    niche: c.niche,
    enabledComponents: c.enabledComponents || [],
    scheduleFrequency: c.schedule?.frequency || 'manual',
    scheduleTime: c.schedule?.time || '08:00',
    scheduleDays: c.schedule?.days || ['1'],
    customPrompt: c.customPrompt,
    useCustomPrompt: !!c.useCustomPrompt,
    youtubeChannelId: c.youtubeChannelId,
    videoModel: c.videoModel || 'auto',
    apiKeyMode: c.apiKeyMode || 'own_keys',
    totalRuns: c.totalRuns || 0,
    totalCost: c.totalCost || 0,
    lastRunAt: c.lastRunAt,
    trialEndDate: r.trialEndDate,
    nextRenewalDate: r.nextRenewalDate,
    isFreeForever: !!r.isFreeForever,
    plan: r.plan,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
