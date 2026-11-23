import { ForbiddenException } from '@nestjs/common';
import { UploadsService } from './uploads.service';

const BOT = '507f1f77bcf86cd799439011';
const MB = 1024 * 1024;

function make(opts: { configured?: boolean; ownsBot?: boolean; inUse?: boolean; stat?: any } = {}) {
  const storage: any = {
    isConfigured: () => opts.configured !== false,
    presignUpload: jest.fn().mockResolvedValue('https://r2.example/signed-put'),
    presignDownload: jest.fn().mockResolvedValue('https://r2.example/signed-get'),
    publicUrl: (k: string) => `https://media.example/${k}`,
    stat: jest.fn().mockResolvedValue(opts.stat === undefined ? { size: 1000, contentType: 'image/png' } : opts.stat),
    deleteKeys: jest.fn().mockResolvedValue(undefined),
  };
  const chatbots: any = {
    findOne: jest.fn().mockImplementation(async (id: string) => {
      if (opts.ownsBot === false) throw new ForbiddenException('Access denied');
      return { _id: { toString: () => id } };
    }),
    assertMediaQuota: jest.fn().mockResolvedValue(undefined),
  };
  const knowledgeModel: any = { exists: jest.fn().mockResolvedValue(opts.inUse ? { _id: 'k1' } : null) };
  const moduleRef: any = { get: () => chatbots };
  const service = new UploadsService(storage, moduleRef, knowledgeModel);
  service.onModuleInit();
  return { service, storage, chatbots, knowledgeModel };
}
const owner = { userId: 'u1', isAdmin: false };
const admin = { userId: 'a1', isAdmin: true };

describe('UploadsService — POST /uploads', () => {
  it('signs a knowledge photo into the bot\'s folder, bound to type and size', async () => {
    const { service, storage, chatbots } = make();
    const out = await service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'image/jpeg', size: 9 * MB, name: '../../living room.jpg' });
    expect(out.key).toMatch(new RegExp(`^chatbots/${BOT}/knowledge/[a-z0-9]+\\.jpg$`));
    expect(out.url).toBe(`https://media.example/${out.key}`);
    expect(out.bucket).toBe('public');
    expect(out.name).toBe('living room.jpg');
    expect(storage.presignUpload).toHaveBeenCalledWith('public', out.key, 'image/jpeg', 9 * MB);
    expect(chatbots.assertMediaQuota).toHaveBeenCalledWith(BOT, 'u1', false, 'image');
  });

  it('knowledge photos: every browser-viewable format (AVIF, GIF, BMP…); HEIC/TIFF/SVG are refused', async () => {
    const { service } = make();
    for (const [type, ext] of [['image/avif', 'avif'], ['image/gif', 'gif'], ['image/bmp', 'bmp'], ['image/webp', 'webp'], ['image/png', 'png']]) {
      const out = await service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: type, size: MB, name: `x.${ext}` });
      expect(out.key.endsWith(`.${ext}`)).toBe(true);
    }
    for (const type of ['image/heic', 'image/tiff', 'image/svg+xml']) {
      await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: type, size: MB })).rejects.toThrow(/isn't allowed/);
    }
  });

  it('allows PDFs up to 100 MB and photos up to 10 MB', async () => {
    const { service } = make();
    await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'application/pdf', size: 100 * MB })).resolves.toHaveProperty('uploadUrl');
    await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'application/pdf', size: 100 * MB + 1 })).rejects.toThrow(/max 100 MB/);
    await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'image/png', size: 10 * MB + 1 })).rejects.toThrow(/max 10 MB/);
  });

  it('refuses unknown purposes, wrong types, empty files, other people\'s bots and unset storage', async () => {
    const { service } = make();
    await expect(service.createUpload(owner, { purpose: 'anything', contentType: 'image/png', size: 1 })).rejects.toThrow(/Unknown upload purpose/);
    await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'video/mp4', size: 1 })).rejects.toThrow(/isn't allowed/);
    await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'image/png', size: 0 })).rejects.toThrow(/empty/);
    await expect(make({ ownsBot: false }).service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'image/png', size: 1 })).rejects.toThrow(/Access denied/);
    await expect(make({ configured: false }).service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, contentType: 'image/png', size: 1 })).rejects.toThrow(/not set up/);
  });

  it('does not let a caller choose the folder', async () => {
    const { service } = make();
    const out = await service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, folder: 'users/someone-else/', contentType: 'image/png', size: 1 });
    expect(out.key.startsWith(`chatbots/${BOT}/knowledge/`)).toBe(true);
    await expect(service.createUpload(owner, { purpose: 'chatbot-knowledge', chatbotId: '../users', contentType: 'image/png', size: 1 })).rejects.toThrow(/invalid chatbotId/);
  });

  it('service brochures are admin-only', async () => {
    const { service } = make();
    await expect(service.createUpload(owner, { purpose: 'service-brochure', serviceId: 'clinic-chatbot', contentType: 'application/pdf', size: 1 })).rejects.toThrow(/Only admins/);
    const out = await service.createUpload(admin, { purpose: 'service-brochure', serviceId: 'clinic-chatbot', contentType: 'application/pdf', size: 50 * MB });
    expect(out.key).toMatch(/^services\/clinic-chatbot\/brochures\/[a-z0-9]+\.pdf$/);
  });

  it('service media: admin only, any media type, sorted into folders by kind', async () => {
    const { service } = make();
    await expect(service.createUpload(owner, { purpose: 'service-media', serviceId: 'gym-chatbot', contentType: 'video/mp4', size: 1 })).rejects.toThrow(/Only admins/);
    const cases: [string, number, RegExp][] = [
      ['video/mp4', 1500 * MB, /^services\/gym-chatbot\/videos\/[a-z0-9]+\.mp4$/],
      ['video/quicktime', 10 * MB, /\/videos\/[a-z0-9]+\.mov$/],
      ['audio/mpeg', 10 * MB, /\/audio\/[a-z0-9]+\.mp3$/],
      ['image/gif', 1 * MB, /\/images\/[a-z0-9]+\.gif$/],
      ['application/pdf', 150 * MB, /\/files\/[a-z0-9]+\.pdf$/],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 5 * MB, /\/files\/[a-z0-9]+\.pptx$/],
    ];
    for (const [contentType, size, re] of cases) {
      const out = await service.createUpload(admin, { purpose: 'service-media', serviceId: 'gym-chatbot', contentType, size });
      expect(out.key).toMatch(re);
      expect(out.url).toContain(out.key);
    }
    // Nothing that runs in a browser is served from the public media domain.
    for (const contentType of ['text/html', 'image/svg+xml', 'application/javascript']) {
      await expect(service.createUpload(admin, { purpose: 'service-media', serviceId: 'gym-chatbot', contentType, size: 1 })).rejects.toThrow(/isn't allowed/);
    }
    await expect(service.createUpload(admin, { purpose: 'service-media', serviceId: 'gym-chatbot', contentType: 'video/mp4', size: 2049 * MB })).rejects.toThrow(/too large/);
  });

  it('user documents go to the private bucket in the caller\'s own folder (admin may pick a user)', async () => {
    const { service, storage } = make();
    const mine = await service.createUpload(owner, { purpose: 'user-document', userId: 'someone-else', contentType: 'application/pdf', size: 1 });
    expect(mine.key.startsWith('users/u1/documents/')).toBe(true);
    expect(mine.url).toBeNull();
    expect(storage.presignUpload).toHaveBeenLastCalledWith('private', mine.key, 'application/pdf', 1);
    const forUser = await service.createUpload(admin, { purpose: 'user-document', userId: 'client42', contentType: 'image/png', size: 1 });
    expect(forUser.key.startsWith('users/client42/documents/')).toBe(true);
  });
});

describe('UploadsService — discard, open, verify', () => {
  it('discards an unsaved upload, but keeps one a record still uses', async () => {
    const free = make();
    await free.service.discard(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, key: `chatbots/${BOT}/knowledge/abc.jpg` });
    expect(free.storage.deleteKeys).toHaveBeenCalledWith('public', [`chatbots/${BOT}/knowledge/abc.jpg`]);
    const used = make({ inUse: true });
    await used.service.discard(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, key: `chatbots/${BOT}/knowledge/abc.jpg` });
    expect(used.storage.deleteKeys).not.toHaveBeenCalled();
  });

  it('never touches a key outside the caller\'s folder', async () => {
    const { service, storage } = make();
    await expect(service.discard(owner, { purpose: 'chatbot-knowledge', chatbotId: BOT, key: 'chatbots/other/knowledge/abc.jpg' })).rejects.toThrow(/Invalid file/);
    await expect(service.discard(owner, { purpose: 'user-document', key: 'users/someone-else/documents/a.pdf' })).rejects.toThrow(/Invalid file/);
    expect(storage.deleteKeys).not.toHaveBeenCalled();
  });

  it('opens a private file through a short-lived signed link', async () => {
    const { service, storage } = make({ stat: { size: 10, contentType: 'application/pdf' } });
    const out = await service.fileUrl(owner, { purpose: 'user-document', key: 'users/u1/documents/x.pdf', name: 'passport.pdf' });
    expect(out.url).toBe('https://r2.example/signed-get');
    expect(storage.presignDownload).toHaveBeenCalledWith('users/u1/documents/x.pdf', 'passport.pdf');
  });

  it('verifyUploaded checks the file exists with an allowed type', async () => {
    const ok = make({ stat: { size: 10, contentType: 'image/png' } });
    await expect(ok.service.verifyUploaded(owner, 'chatbot-knowledge', { chatbotId: BOT }, `chatbots/${BOT}/knowledge/a.png`)).resolves.toMatchObject({ contentType: 'image/png' });
    const missing = make({ stat: null });
    await expect(missing.service.verifyUploaded(owner, 'chatbot-knowledge', { chatbotId: BOT }, `chatbots/${BOT}/knowledge/a.png`)).rejects.toThrow(/not found/);
    const bad = make({ stat: { size: 10, contentType: 'text/html' } });
    await expect(bad.service.verifyUploaded(owner, 'chatbot-knowledge', { chatbotId: BOT }, `chatbots/${BOT}/knowledge/a.png`)).rejects.toThrow(/Unsupported/);
  });
});
