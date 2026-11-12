import { UsersService } from './users.service';

describe('UsersService.onModuleInit (schema self-heal)', () => {
  function build() {
    const collectionUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const userModel: any = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      collection: { updateMany: collectionUpdateMany },
    };
    const service = new UsersService(userModel, {} as any, {} as any, {} as any);
    return { service, userModel, collectionUpdateMany };
  }

  it('unsets exactly the 7 fields confirmed dead, through the raw collection', async () => {
    const { service, collectionUpdateMany } = build();
    await service.onModuleInit();
    const unsetCall = collectionUpdateMany.mock.calls.find(([, u]) => u.$unset);
    expect(Object.keys(unsetCall[1].$unset).sort()).toEqual([
      'freeForeverGrantedBy', 'onboardingCompleted', 'totalCreditsUsed', 'totalVideosGenerated',
      'trialExtendedBy', 'trialExtendedUntil', 'trialReminderSent',
    ]);
  });

  it('never touches the live fields kept outside the UML (timezone, company)', async () => {
    const { service, collectionUpdateMany } = build();
    await service.onModuleInit();
    const touched = JSON.stringify(collectionUpdateMany.mock.calls);
    expect(touched).not.toContain('timezone');
    expect(touched).not.toContain('company');
  });

  it('gives users missing it an empty onboarding object', async () => {
    const { service, collectionUpdateMany } = build();
    await service.onModuleInit();
    expect(collectionUpdateMany).toHaveBeenCalledWith(
      { onboarding: { $exists: false } },
      { $set: { onboarding: {} } },
    );
  });
});
