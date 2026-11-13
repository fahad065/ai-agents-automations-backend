import { Types } from 'mongoose';

const del = jest.fn();
jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: (...a: any[]) => del(...a) }));

import { DocumentsService } from './documents.service';

describe('DocumentsService.purgeAllForUser (account deletion)', () => {
  const userId = new Types.ObjectId().toString();
  let model: any;
  let service: DocumentsService;

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    del.mockReset().mockResolvedValue(undefined);
    model = {
      find: jest.fn(() => ({
        select: () => ({
          lean: async () => [
            { _id: 'd1', fileUrl: 'https://blob/emirates-id.pdf' },
            { _id: 'd2', fileUrl: 'https://blob/passport.png' },
          ],
        }),
      })),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    };
    service = new DocumentsService(model, {} as any);
  });

  it('deletes every stored file and hard-deletes all rows, including soft-deleted ones', async () => {
    await expect(service.purgeAllForUser(userId)).resolves.toBe(2);
    expect(del).toHaveBeenCalledTimes(2);
    const filter = model.find.mock.calls[0][0];
    expect(filter).not.toHaveProperty('isDeleted');
    expect(model.deleteMany).toHaveBeenCalledWith({ userId: new Types.ObjectId(userId) });
  });

  it('still deletes the rows when a file delete fails', async () => {
    del.mockRejectedValueOnce(new Error('blob gone'));
    await expect(service.purgeAllForUser(userId)).resolves.toBe(2);
    expect(model.deleteMany).toHaveBeenCalled();
  });
});
