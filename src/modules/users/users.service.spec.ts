import { UsersService } from './users.service';
import { USER_FIELD_GROUPS } from './schemas/user.schema';

describe('UsersService.onModuleInit (schema self-heal)', () => {
  function build() {
    const collectionUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const dropIndex = jest.fn().mockResolvedValue(undefined);
    const userModel: any = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      collection: { updateMany: collectionUpdateMany, dropIndex },
    };
    const service = new UsersService(userModel, {} as any, {} as any, {} as any);
    return { service, userModel, collectionUpdateMany, dropIndex };
  }

  // The grouping migration is the only raw updateMany whose update is a
  // pipeline (an array).
  const groupingCall = (calls: any[][]) => calls.find(([, u]) => Array.isArray(u));

  it('unsets exactly the 7 fields confirmed dead, through the raw collection', async () => {
    const { service, collectionUpdateMany } = build();
    await service.onModuleInit();
    const unsetCall = collectionUpdateMany.mock.calls.find(([, u]) => !Array.isArray(u) && u.$unset);
    expect(Object.keys(unsetCall[1].$unset).sort()).toEqual([
      'freeForeverGrantedBy', 'onboardingCompleted', 'totalCreditsUsed', 'totalVideosGenerated',
      'trialExtendedBy', 'trialExtendedUntil', 'trialReminderSent',
    ]);
  });

  it('gives users missing it an empty onboarding object', async () => {
    const { service, collectionUpdateMany } = build();
    await service.onModuleInit();
    expect(collectionUpdateMany).toHaveBeenCalledWith(
      { onboarding: { $exists: false } },
      { $set: { onboarding: {} } },
    );
  });

  describe('grouping flat fields (2026-11-16)', () => {
    it('only matches docs that still have an old flat field', async () => {
      const { service, collectionUpdateMany } = build();
      await service.onModuleInit();
      const [filter] = groupingCall(collectionUpdateMany.mock.calls)!;
      const matched = filter.$or.map((c: any) => Object.keys(c)[0]).sort();
      const allOld = Object.values(USER_FIELD_GROUPS).flatMap((g) => Object.values(g)).sort();
      expect(matched).toEqual(allOld);
    });

    it('moves every old field into its group, keeping timezone/company (not dropping them)', async () => {
      const { service, collectionUpdateMany } = build();
      await service.onModuleInit();
      const [, pipeline] = groupingCall(collectionUpdateMany.mock.calls)!;
      const set = pipeline[0].$set;
      expect(set.profile.$mergeObjects[0]).toEqual({
        phoneNumber: '$phoneNumber', country: '$country', avatar: '$avatar',
        timezone: '$timezone', company: '$company',
      });
      expect(set.welcomeEmails.$mergeObjects[0]).toEqual({
        day1Sent: '$welcomeDay1Sent', day3Sent: '$welcomeDay3Sent', day7Sent: '$welcomeDay7Sent',
      });
      expect(set.deletion.$mergeObjects[0]).toEqual({
        requestedAt: '$deletionRequestedAt', pendingAt: '$pendingDeletionAt', reminderSent: '$deletionReminderSent',
      });
      expect(Object.keys(set).sort()).toEqual(['auth', 'deletion', 'plan', 'profile', 'welcomeEmails']);
    });

    it('lets an already-grouped value win over the old flat one', async () => {
      const { service, collectionUpdateMany } = build();
      await service.onModuleInit();
      const [, pipeline] = groupingCall(collectionUpdateMany.mock.calls)!;
      for (const group of Object.keys(USER_FIELD_GROUPS)) {
        // $mergeObjects: later objects win, so the existing group is last.
        expect(pipeline[0].$set[group].$mergeObjects[1]).toEqual({ $ifNull: [`$${group}`, {}] });
      }
    });

    it('removes every old flat field in the same update', async () => {
      const { service, collectionUpdateMany } = build();
      await service.onModuleInit();
      const [, pipeline] = groupingCall(collectionUpdateMany.mock.calls)!;
      const allOld = Object.values(USER_FIELD_GROUPS).flatMap((g) => Object.values(g)).sort();
      expect([...pipeline[1].$unset].sort()).toEqual(allOld);
    });

    it('drops the indexes on the old flat paths, ignoring ones already gone', async () => {
      const { service, dropIndex } = build();
      dropIndex.mockRejectedValueOnce(new Error('index not found'));
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(dropIndex.mock.calls.map(([n]) => n)).toEqual(['googleId_1', 'planType_1']);
    });
  });
});
