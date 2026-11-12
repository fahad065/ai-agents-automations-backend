import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    OnModuleInit,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import * as bcrypt from 'bcryptjs';
  import { User, UserDocument, UserStatus } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserModule, UserModuleDocument } from '../modules/schemas/user-module.schema';
import { Chatbot, ChatbotDocument } from '../chatbots/schemas/chatbot.schema';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction, ActorRole } from '../activity-logs/schemas/activity-log.schema';

  @Injectable()
  export class UsersService implements OnModuleInit {
    private readonly logger = new Logger(UsersService.name);

    constructor(
      @InjectModel(User.name) private userModel: Model<UserDocument>,
      @InjectModel(UserModule.name) private userModuleModel: Model<UserModuleDocument>,
      @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
      private activityLogsService: ActivityLogsService,
    ) {}

    // Self-heals every pre-existing doc still on the old shape — same
    // aggregation-pipeline updateMany() pattern as
    // ApiKeysService.onModuleInit(). No manual migration script, since
    // this sandbox has no network path to the real MongoDB Atlas instance.
    // See ai/architecture.md's "users" section.
    async onModuleInit() {
      const statusResult = await this.userModel.updateMany(
        { status: { $exists: false } } as any,
        [
          {
            $set: {
              status: {
                $cond: [{ $eq: ['$isActive', false] }, UserStatus.INACTIVE, UserStatus.ACTIVE],
              },
            },
          },
          { $unset: ['isActive', 'facebookId', 'appleId', 'totalAgents', 'totalAutomations'] },
        ] as any,
      );
      if (statusResult.modifiedCount) {
        this.logger.log(`Backfilled status on ${statusResult.modifiedCount} user(s)`);
      }

      const notifyResult = await this.userModel.updateMany(
        { notifyPreferences: { $exists: false } } as any,
        [
          {
            $set: {
              notifyPreferences: {
                onComplete: { $ifNull: ['$notifyOnComplete', true] },
                onFail: { $ifNull: ['$notifyOnFail', true] },
                trialExpiry: { $ifNull: ['$notifyTrialExpiry', true] },
                billing: { $ifNull: ['$notifyBilling', true] },
                emailUpdates: { $ifNull: ['$emailUpdates', false] },
              },
            },
          },
          {
            $unset: [
              'notifyOnComplete', 'notifyOnFail', 'notifyTrialExpiry',
              'notifyBilling', 'emailUpdates',
            ],
          },
        ] as any,
      );
      if (notifyResult.modifiedCount) {
        this.logger.log(`Backfilled notifyPreferences on ${notifyResult.modifiedCount} user(s)`);
      }
    }

    async findById(id: string) {
      const user = await this.userModel.findById(id);
      if (!user) throw new NotFoundException('User not found');
      return user;
    }
  
    async getProfile(userId: string) {
      if (!Types.ObjectId.isValid(userId)) {
        throw new NotFoundException('User not found');
      }
      const user = await this.userModel
        .findById(userId)
        .select('-password -refreshToken')
        .lean();
      if (!user) throw new NotFoundException('User not found');
      return { user };
    }
    
    async updateProfile(userId: string, dto: UpdateProfileDto) {
      if (!Types.ObjectId.isValid(userId)) {
        throw new NotFoundException('User not found');
      }
      // notifyPreferences is a nested object on the schema — flatten it to
      // dotted paths so a partial update (e.g. just {billing: false}) only
      // touches the sub-fields actually sent, instead of a whole-object
      // $set wiping out every other preference not included in this call.
      const { notifyPreferences, ...rest } = dto as any;
      const set: Record<string, any> = { ...rest };
      if (notifyPreferences) {
        for (const [key, value] of Object.entries(notifyPreferences)) {
          if (value !== undefined) set[`notifyPreferences.${key}`] = value;
        }
      }

      const user = await this.userModel.findByIdAndUpdate(
        userId,
        { $set: set },
        { new: true },
      ).select('-password -refreshToken').lean();
      if (!user) throw new NotFoundException('User not found');

      await this.activityLogsService.record({
        userId, actorId: userId, actorRole: ActorRole.USER,
        action: ActivityAction.UPDATE, entityType: 'user', entityId: userId,
        changes: { after: { fieldsChanged: Object.keys(dto) } },
        description: `Profile updated (${Object.keys(dto).join(', ')})`,
      });

      return { message: 'Profile updated', user };
    }

    async changePassword(userId: string, oldPassword: string, newPassword: string) {
      const user = await this.userModel.findById(userId).select('+password');
      if (!user?.password) throw new BadRequestException('No password set (OAuth user)');

      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match) throw new BadRequestException('Incorrect current password');

      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();

      // No field values logged, ever — just that the event happened.
      await this.activityLogsService.record({
        userId, actorId: userId, actorRole: ActorRole.USER,
        action: ActivityAction.UPDATE, entityType: 'user', entityId: userId,
        description: 'Password changed',
      });

      return { message: 'Password updated' };
    }

    async deactivate(userId: string) {
      await this.userModel.findByIdAndUpdate(userId, { status: UserStatus.INACTIVE });

      await this.activityLogsService.record({
        userId, actorId: userId, actorRole: ActorRole.USER,
        action: ActivityAction.UPDATE, entityType: 'user', entityId: userId,
        changes: { after: { status: UserStatus.INACTIVE } },
        description: 'Account deactivated',
      });

      return { message: 'Account deactivated' };
    }

    async findAll(page = 1, limit = 10, filters?: {
      search?: string;
      status?: string;
      planType?: string;
    }) {
      const skip = (page - 1) * limit;
      const filter: any = { isDeleted: false };

      if (filters?.search) {
        filter.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { email: { $regex: filters.search, $options: 'i' } },
        ];
      }
      if (filters?.status && filters?.status !== 'all') {
        filter.status = filters.status;
      }
      if (filters?.planType && filters?.planType !== 'all') {
        filter.planType = filters.planType;
      }

      const [users, total] = await Promise.all([
        this.userModel
          .find(filter)
          .select('-password -refreshToken')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.userModel.countDocuments(filter),
      ]);

      // totalAgents/totalAutomations/totalChatbots are deliberately not
      // stored on User (see the schema's comment) — computed fresh here,
      // batched across the whole page in 2 aggregate queries rather than
      // one countDocuments() per user (same "batched, not N+1" rule
      // ChatbotsService.findAllAdmin()/AdminService.getUsagePerTenant()
      // already established elsewhere in this codebase).
      const userIds = users.map((u: any) => u._id);
      const [moduleCounts, chatbotCounts] = await Promise.all([
        this.userModuleModel.aggregate([
          { $match: { userId: { $in: userIds } } },
          { $group: { _id: { userId: '$userId', moduleType: '$moduleType' }, count: { $sum: 1 } } },
        ]),
        this.chatbotModel.aggregate([
          { $match: { userId: { $in: userIds } } },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]),
      ]);
      const agentsByUser = new Map<string, number>();
      const automationsByUser = new Map<string, number>();
      for (const row of moduleCounts as any[]) {
        const uid = String(row._id.userId);
        if (row._id.moduleType === 'agent') agentsByUser.set(uid, row.count);
        else if (row._id.moduleType === 'automation') automationsByUser.set(uid, row.count);
      }
      const chatbotsByUser = new Map((chatbotCounts as any[]).map((r) => [String(r._id), r.count]));

      const withCounts = users.map((u: any) => ({
        ...u,
        totalAgents: agentsByUser.get(String(u._id)) || 0,
        totalAutomations: automationsByUser.get(String(u._id)) || 0,
        totalChatbots: chatbotsByUser.get(String(u._id)) || 0,
      }));

      return { users: withCounts, total, page, limit, pages: Math.ceil(total / limit) };
    }
   
    async findOne(id: string) {
      const user = await this.userModel
        .findById(id)
        .select('-password -refreshToken')
        .lean();
      if (!user) throw new NotFoundException('User not found');
      return user;
    }
   
    async adminUpdate(id: string, data: {
      name?: string;
      phoneNumber?: string;
      country?: string;
      status?: string;
      planType?: string;
      role?: string;
      trialEndDate?: string;
      isFreeForever?: boolean;
    }, adminId?: string) {
      const allowed = [
        'name', 'phoneNumber', 'country', 'status',
        'planType', 'role', 'trialEndDate', 'isFreeForever',
      ];
      const update: any = {};
      for (const key of allowed) {
        if (data[key] !== undefined) update[key] = data[key];
      }

      const user = await this.userModel.findByIdAndUpdate(
        id, update, { new: true }
      ).select('-password -refreshToken');

      if (!user) throw new NotFoundException('User not found');

      if (adminId) {
        await this.activityLogsService.record({
          userId: id, actorId: adminId, actorRole: ActorRole.ADMIN,
          action: ActivityAction.UPDATE, entityType: 'user', entityId: id,
          changes: { after: update },
          description: `Account updated by admin (${Object.keys(update).join(', ')})`,
        });
      }

      return user;
    }

    async adminDelete(id: string, adminId?: string) {
      // Soft delete — never hard delete
      await this.userModel.findByIdAndUpdate(id, {
        isDeleted: true,
        status: UserStatus.INACTIVE,
      });

      if (adminId) {
        await this.activityLogsService.record({
          userId: id, actorId: adminId, actorRole: ActorRole.ADMIN,
          action: ActivityAction.DELETE, entityType: 'user', entityId: id,
          description: 'Account deactivated by admin',
        });
      }

      return { message: 'User deactivated successfully' };
    }

    async extendTrial(userId: string, days: number, adminId: string): Promise<any> {
      const user = await this.userModel.findById(userId);
      if (!user) throw new NotFoundException('User not found');
     
      const currentEnd = user.trialEndDate ? new Date(user.trialEndDate) : new Date();
      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + days);
     
      await this.userModel.findByIdAndUpdate(userId, {
        trialEndDate: newEnd,
        trialExtendedUntil: newEnd,
        trialExtendedBy: adminId,
        // Reactivate if was expired
        planType: 'trial',
      });
     
      // Reactivate paused modules if extending
      await this.userModuleModel.updateMany(
        { userId, pausedReason: 'trial_expired' },
        { $set: { isActive: true, pausedReason: null } },
      );
     
      return { message: `Trial extended by ${days} days until ${newEnd.toDateString()}` };
    }
     
    async pauseUserModules(userId: string, pause: boolean): Promise<any> {
      const result = await this.userModuleModel.updateMany(
        { userId },
        { $set: { isActive: !pause, ...(pause && { pausedReason: 'admin_paused' }) } },
      );
      return { message: `${result.modifiedCount} modules ${pause ? 'paused' : 'unpaused'}` };
    }
  }