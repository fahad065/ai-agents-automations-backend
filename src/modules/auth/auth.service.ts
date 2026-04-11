import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    BadRequestException,
  } from '@nestjs/common';
  import { InjectModel } from '@nestjs/mongoose';
  import { Model } from 'mongoose';
  import { JwtService } from '@nestjs/jwt';
  import { ConfigService } from '@nestjs/config';
  import * as bcrypt from 'bcryptjs';
  import { User, UserDocument, AuthProvider } from '../users/schemas/user.schema';
  import { RegisterDto, LoginDto } from './dto/auth.dto';
import { NotificationsService } from '../notifications/notifications.service';
  
  @Injectable()
  export class AuthService {
    constructor(
      @InjectModel(User.name) private userModel: Model<UserDocument>,
      private jwtService: JwtService,
      private config: ConfigService,
      private notificationsService: NotificationsService,
    ) {}
  
    async register(dto: RegisterDto) {
      const exists = await this.userModel.findOne({ email: dto.email });
      if (exists) throw new ConflictException('Email already registered');
  
      const hashedPassword = await bcrypt.hash(dto.password, 12);
  
      const user = await this.userModel.create({
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        provider: AuthProvider.LOCAL,
      });
  
      const tokens = await this.generateTokens(user);
      await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);

      await this.notificationsService.onUserRegistered(
        user._id.toString(),
        user.name,
        user.email,
      );
  
      return { user: this.sanitize(user), ...tokens };
    }
  
    async login(dto: LoginDto) {
      const user = await this.userModel
        .findOne({ email: dto.email })
        .select('+password');
  
      if (!user || !user.password) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      const passwordMatch = await bcrypt.compare(dto.password, user.password);
      if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');
  
      if (!user.isActive) throw new UnauthorizedException('Account deactivated');
  
      const tokens = await this.generateTokens(user);
      await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
  
      return { user: this.sanitize(user), ...tokens };
    }
  
    async googleLogin(googleUser: any) {
      let user = await this.userModel.findOne({ email: googleUser.email });
  
      if (!user) {
        user = await this.userModel.create({
          name: googleUser.name,
          email: googleUser.email,
          googleId: googleUser.googleId,
          avatar: googleUser.avatar,
          provider: AuthProvider.GOOGLE,
        });
      } else if (!user.googleId) {
        user.googleId = googleUser.googleId;
        user.provider = AuthProvider.GOOGLE;
        if (!user.avatar) user.avatar = googleUser.avatar;
        await user.save();
      }
  
      const tokens = await this.generateTokens(user);
      await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
  
      return { user: this.sanitize(user), ...tokens };
    }
  
    async refreshTokens(userId: string, refreshToken: string) {
      const user = await this.userModel.findById(userId);
      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Access denied');
      }
  
      const tokenMatch = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!tokenMatch) throw new UnauthorizedException('Invalid refresh token');
  
      const tokens = await this.generateTokens(user);
      await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
  
      return tokens;
    }
  
    async logout(userId: string) {
      await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
      return { message: 'Logged out successfully' };
    }
  
    private async generateTokens(user: UserDocument) {
      const payload = { sub: user._id.toString(), email: user.email };
  
      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(payload, {
          secret: this.config.get('JWT_SECRET'),
          expiresIn: this.config.get('JWT_EXPIRES_IN'),
        }),
        this.jwtService.signAsync(payload, {
          secret: this.config.get('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
        }),
      ]);
  
      return { accessToken, refreshToken };
    }
  
    private async saveRefreshToken(userId: string, token: string) {
      const hashed = await bcrypt.hash(token, 10);
      await this.userModel.findByIdAndUpdate(userId, { refreshToken: hashed });
    }
  
    private sanitize(user: UserDocument) {
      const obj = user.toObject();
      delete obj.password;
      delete obj.refreshToken;
      return obj;
    }
  }