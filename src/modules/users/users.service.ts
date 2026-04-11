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
  
    // Admin only
    async findAll(page = 1, limit = 20) {
      const skip = (page - 1) * limit;
      const [users, total] = await Promise.all([
        this.userModel.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
        this.userModel.countDocuments(),
      ]);
      return { users, total, page, limit };
    }
  }