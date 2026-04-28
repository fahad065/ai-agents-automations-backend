import {
    Injectable,
    NotFoundException,
    BadRequestException,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model, Types } from 'mongoose';
  import * as bcrypt from 'bcryptjs';
  import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
  
  @Injectable()
  export class UsersService {
    constructor(
      @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) {}
  
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
      const user = await this.userModel.findByIdAndUpdate(
        userId,
        { $set: dto },
        { new: true },
      ).select('-password -refreshToken').lean();
      if (!user) throw new NotFoundException('User not found');
      return { message: 'Profile updated', user };
    }
  
    async changePassword(userId: string, oldPassword: string, newPassword: string) {
      const user = await this.userModel.findById(userId).select('+password');
      if (!user?.password) throw new BadRequestException('No password set (OAuth user)');
  
      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match) throw new BadRequestException('Incorrect current password');
  
      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();
      return { message: 'Password updated' };
    }
  
    async deactivate(userId: string) {
      await this.userModel.findByIdAndUpdate(userId, { isActive: false });
      return { message: 'Account deactivated' };
    }

    async findAll(page = 1, limit = 10, filters?: {
      search?: string;
      isActive?: string;
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
      if (filters?.isActive !== undefined && filters?.isActive !== 'all') {
        filter.isActive = filters.isActive === 'true';
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
   
      return { users, total, page, limit, pages: Math.ceil(total / limit) };
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
      isActive?: boolean;
      planType?: string;
      role?: string;
      trialEndDate?: string;
      isFreeForever?: boolean;
    }) {
      const allowed = [
        'name', 'phoneNumber', 'country', 'isActive',
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
      return user;
    }
   
    async adminDelete(id: string) {
      // Soft delete — never hard delete
      await this.userModel.findByIdAndUpdate(id, {
        isDeleted: true,
        isActive: false,
      });
      return { message: 'User deactivated successfully' };
    }
  }