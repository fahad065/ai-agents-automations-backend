import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Feedback, FeedbackDocument } from './schemas/feedback.schema';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(Feedback.name)
    private feedbackModel: Model<FeedbackDocument>,
  ) {}

  // Submit feedback
  async create(data: {
    userId: string;
    moduleId?: string;
    moduleType?: string;
    moduleName?: string;
    rating: number;
    text: string;
    userName?: string;
    userAvatar?: string;
    userRole?: string;
  }): Promise<FeedbackDocument> {
    return this.feedbackModel.create({
      userId: new Types.ObjectId(data.userId),
      moduleId: data.moduleId ? new Types.ObjectId(data.moduleId) : undefined,
      moduleType: data.moduleType,
      moduleName: data.moduleName,
      rating: data.rating,
      text: data.text,
      userName: data.userName,
      userAvatar: data.userAvatar,
      userRole: data.userRole,
      isApproved: false,
    });
  }

  // Get public approved feedback (for website)
  async getPublic(moduleId?: string, limit = 10) {
    const filter: any = { isApproved: true, isDeleted: false };
    if (moduleId) filter.moduleId = new Types.ObjectId(moduleId);

    return this.feedbackModel
      .find(filter)
      .sort({ rating: -1, createdAt: -1 })
      .limit(limit)
      .select('moduleName moduleType rating text userName userAvatar userRole createdAt')
      .lean();
  }

  // Admin: get all feedback
  async findAll(options: {
    isApproved?: boolean;
    moduleType?: string;
    page?: number;
    limit?: number;
  }) {
    const { isApproved, moduleType, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;
    const filter: any = { isDeleted: false };

    if (isApproved !== undefined) filter.isApproved = isApproved;
    if (moduleType) filter.moduleType = moduleType;

    const [data, total] = await Promise.all([
      this.feedbackModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.feedbackModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // Admin: approve feedback
  async approve(feedbackId: string, adminId: string): Promise<void> {
    await this.feedbackModel.findByIdAndUpdate(feedbackId, {
      isApproved: true,
      approvedBy: new Types.ObjectId(adminId),
      approvedAt: new Date(),
    });
  }

  // Soft delete
  async softDelete(feedbackId: string): Promise<void> {
    await this.feedbackModel.findByIdAndUpdate(feedbackId, { isDeleted: true });
  }
}