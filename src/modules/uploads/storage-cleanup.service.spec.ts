jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

import { StorageCleanupService } from './storage-cleanup.service';

const NOW = Date.parse('2026-11-24T04:00:00Z');
const old = new Date(NOW - 2 * 24 * 3600 * 1000);
const fresh = new Date(NOW - 2 * 3600 * 1000);
const lean = (rows: any[]) => ({ select: () => ({ lean: async () => rows }) });

function make(objects: Record<string, { key: string; lastModified: Date }[]>, rows: { kb?: any[]; services?: any[]; docs?: any[] } = {}) {
  const storage: any = {
    isConfigured: () => true,
    listObjects: jest.fn(async (_kind: string, prefix: string) => objects[prefix] || []),
    deleteKeys: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new StorageCleanupService(
    storage,
    { find: () => lean(rows.kb || []) } as any,
    { find: () => lean(rows.services || []) } as any,
    { find: () => lean(rows.docs || []) } as any,
  );
  return { svc, storage };
}

describe('StorageCleanupService (daily stray-upload clean-up)', () => {
  it('deletes unused files older than 24h, keeps used and recent ones', async () => {
    const { svc, storage } = make(
      {
        'chatbots/': [
          { key: 'chatbots/b1/knowledge/used.jpg', lastModified: old },
          { key: 'chatbots/b1/knowledge/stray.jpg', lastModified: old },
          { key: 'chatbots/b1/knowledge/just-uploaded.jpg', lastModified: fresh },
          { key: 'chatbots/b1/knowledge/a.jpg', lastModified: old },
          { key: 'chatbots/b1/knowledge/b.jpg', lastModified: old },
        ],
        'services/': [
          { key: 'services/gym-chatbot/videos/live.mp4', lastModified: old },
          { key: 'services/gym-chatbot/videos/abandoned.mp4', lastModified: old },
          { key: 'services/gym-chatbot/files/brochure.pdf', lastModified: old },
          { key: 'services/clinic-chatbot/files/x.pdf', lastModified: old },
        ],
        'users/': [
          { key: 'users/u1/documents/id.pdf', lastModified: old },
          { key: 'users/u1/documents/never-saved.pdf', lastModified: old },
          { key: 'users/u1/documents/c.pdf', lastModified: old },
          { key: 'users/u1/documents/d.pdf', lastModified: old },
        ],
      },
      {
        kb: [{ attachments: [{ key: 'chatbots/b1/knowledge/used.jpg' }, { key: 'chatbots/b1/knowledge/a.jpg' }, { key: 'chatbots/b1/knowledge/b.jpg' }] }],
        // A different media domain than today's still counts as used.
        services: [
          { content: { demoVideoUrl: 'https://old-domain.r2.dev/services/gym-chatbot/videos/live.mp4', brochureUrl: 'https://media.logicmate.io/services/gym-chatbot/files/brochure.pdf' } },
          { content: { brochureUrl: 'https://media.logicmate.io/services/clinic-chatbot/files/x.pdf' } },
          { content: { demoVideoUrl: 'https://youtu.be/abc' } },
        ],
        docs: [{ storageKey: 'users/u1/documents/id.pdf' }, { storageKey: 'users/u1/documents/c.pdf' }, { storageKey: 'users/u1/documents/d.pdf' }],
      },
    );
    const result = await svc.cleanUp(NOW);
    expect(storage.deleteKeys).toHaveBeenCalledWith('public', ['chatbots/b1/knowledge/stray.jpg']);
    expect(storage.deleteKeys).toHaveBeenCalledWith('public', ['services/gym-chatbot/videos/abandoned.mp4']);
    expect(storage.deleteKeys).toHaveBeenCalledWith('private', ['users/u1/documents/never-saved.pdf']);
    expect(result['chatbots/'].deleted).toBe(1);
  });

  it('never lists or touches invoices', async () => {
    const { svc, storage } = make({});
    await svc.cleanUp(NOW);
    expect(storage.listObjects.mock.calls.map((c: any[]) => c[1])).toEqual(['chatbots/', 'services/', 'users/']);
  });

  it('deletes nothing in a folder where too many files look unused (bug guard)', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ key: `services/x/videos/${i}.mp4`, lastModified: old }));
    const { svc, storage } = make({ 'services/': many }, { services: [] });
    const result = await svc.cleanUp(NOW);
    expect(storage.deleteKeys).not.toHaveBeenCalledWith('public', expect.arrayContaining(['services/x/videos/0.mp4']));
    expect(result['services/'].skipped).toMatch(/too many/);
  });

  it('deletes nothing if the database cannot be read', async () => {
    const { svc, storage } = make({ 'chatbots/': [{ key: 'chatbots/b/knowledge/z.jpg', lastModified: old }] });
    (svc as any).knowledgeModel = { find: () => ({ select: () => ({ lean: async () => { throw new Error('db down'); } }) }) };
    await svc.run();
    expect(storage.deleteKeys).not.toHaveBeenCalled();
  });
});
