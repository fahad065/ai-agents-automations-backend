import { Types } from 'mongoose';

import { DocumentsService } from './documents.service';

function storageMock() {
  return {
    deleteKeys: jest.fn().mockResolvedValue(undefined),
    presignDownload: jest.fn().mockResolvedValue('https://r2.example/signed-get'),
  };
}

describe('DocumentsService.purgeAllForUser (account deletion)', () => {
  const userId = new Types.ObjectId().toString();
  let model: any;
  let storage: any;
  let service: DocumentsService;

  beforeEach(() => {
    storage = storageMock();
    model = {
      find: jest.fn(() => ({
        select: () => ({
          lean: async () => [
            { _id: 'd1', storageKey: `users/${userId}/documents/emirates-id.pdf` },
            { _id: 'd2', storageKey: `users/${userId}/documents/passport.png` },
          ],
        }),
      })),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    };
    service = new DocumentsService(model, {} as any, storage, {} as any);
  });

  it('deletes every stored file and hard-deletes all rows', async () => {
    await expect(service.purgeAllForUser(userId)).resolves.toBe(2);
    expect(storage.deleteKeys).toHaveBeenCalledWith('private', [`users/${userId}/documents/emirates-id.pdf`]);
    expect(storage.deleteKeys).toHaveBeenCalledWith('private', [`users/${userId}/documents/passport.png`]);
    const filter = model.find.mock.calls[0][0];
    expect(filter).not.toHaveProperty('isDeleted');
    expect(model.deleteMany).toHaveBeenCalledWith({ userId: new Types.ObjectId(userId) });
  });

  it('still deletes the rows when a file delete fails', async () => {
    storage.deleteKeys.mockRejectedValueOnce(new Error('storage down'));
    await expect(service.purgeAllForUser(userId)).resolves.toBe(2);
    expect(model.deleteMany).toHaveBeenCalled();
  });
});

describe('DocumentsService — private R2 documents', () => {
  const owner = new Types.ObjectId().toString();
  const actor = { id: owner, role: 'user' as const };

  it('records an uploaded file after the uploads service verifies it', async () => {
    const created: any[] = [];
    const model: any = { create: jest.fn(async (d: any) => { created.push(d); return { ...d, _id: new Types.ObjectId() }; }) };
    const uploads: any = { verifyUploaded: jest.fn().mockResolvedValue({ key: `users/${owner}/documents/x.pdf`, size: 1234, contentType: 'application/pdf', url: null }) };
    const service = new DocumentsService(model, { record: jest.fn() } as any, storageMock() as any, uploads);

    await service.createDocument(owner, 'Emirates ID', { key: `users/${owner}/documents/x.pdf`, name: 'C:\\scans\\emirates-id.pdf' }, actor);

    expect(uploads.verifyUploaded).toHaveBeenCalledWith({ userId: owner, isAdmin: false }, 'user-document', { userId: owner }, `users/${owner}/documents/x.pdf`);
    expect(created[0]).toMatchObject({ documentType: 'Emirates ID', storageKey: `users/${owner}/documents/x.pdf`, fileName: 'emirates-id.pdf', fileType: 'application/pdf', fileSize: 1234 });
    expect(created[0].fileUrl).toBeUndefined();
  });

  it('opens a private document through a short-lived signed link', async () => {
    const storage = storageMock();
    const docs: Record<string, any> = {
      r2: { storageKey: 'users/u/documents/a.pdf', fileName: 'a.pdf' },
    };
    const model: any = { findOne: jest.fn((f: any) => ({ lean: async () => docs[f.__which] })) };
    const service = new DocumentsService(model, {} as any, storage as any, {} as any);
    const id = new Types.ObjectId().toString();

    model.findOne.mockImplementationOnce(() => ({ lean: async () => docs.r2 }));
    await expect(service.documentUrl(owner, id)).resolves.toEqual({ url: 'https://r2.example/signed-get' });
    expect(storage.presignDownload).toHaveBeenCalledWith('users/u/documents/a.pdf', 'a.pdf');
    model.findOne.mockImplementationOnce(() => ({ lean: async () => ({ fileName: 'no-file.pdf' }) }));
    await expect(service.documentUrl(owner, id)).rejects.toThrow(/not found/);
  });

  it('a non-admin only finds their own documents', async () => {
    const model: any = { findOne: jest.fn(() => ({ lean: async () => null })) };
    const service = new DocumentsService(model, {} as any, storageMock() as any, {} as any);
    await expect(service.documentUrl(owner, new Types.ObjectId().toString())).rejects.toThrow(/not found/);
    expect(model.findOne.mock.calls[0][0].userId).toEqual(new Types.ObjectId(owner));
  });
});
