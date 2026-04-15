import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as CryptoJS from 'crypto-js';
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

  // ── Encryption helpers ────────────────────────────────────────

  private get encryptionKey(): string {
    return this.config.get('ENCRYPTION_KEY') || '';
  }

  private encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  private decrypt(cipherText: string): string {
    const bytes = CryptoJS.AES.decrypt(cipherText, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // ── Auth methods ──────────────────────────────────────────────

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

  // ── YouTube OAuth ─────────────────────────────────────────────

  async getYoutubeAuthUrl(userId: string): Promise<string> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const backendUrl = this.config.get('BACKEND_URL') || 'http://localhost:4000';
    const redirectUri = `${backendUrl}/api/v1/auth/youtube/callback`;

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent', // always get refresh token
      state: userId,     // pass userId through OAuth flow
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleYoutubeCallback(code: string, userId: string): Promise<void> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');
    const backendUrl = this.config.get('BACKEND_URL') || 'http://localhost:4000';
    const redirectUri = `${backendUrl}/api/v1/auth/youtube/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as any;

    if (!tokens.access_token) {
      throw new BadRequestException('Failed to get access token from Google');
    }

    // Get YouTube channel info
    let channelTitle = '';
    let channelId = '';
    let channelThumbnail = '';

    try {
      const channelRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const channelData = await channelRes.json() as any;
      const channel = channelData.items?.[0];
      channelTitle = channel?.snippet?.title || '';
      channelId = channel?.id || '';
      channelThumbnail = channel?.snippet?.thumbnails?.default?.url || '';
    } catch {
      // Non-critical — continue without channel info
    }

    // Build token data object
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + ((tokens.expires_in || 3600) * 1000),
      token_type: tokens.token_type || 'Bearer',
      channel_id: channelId,
      channel_title: channelTitle,
      channel_thumbnail: channelThumbnail,
    };

    // Encrypt and store in api-keys collection
    const encrypted = this.encrypt(JSON.stringify(tokenData));
    const label = channelTitle
      ? `YouTube — ${channelTitle}`
      : 'YouTube Channel';

    const ApiKeyModel = this.userModel.db.model('ApiKey');
    const existing = await ApiKeyModel.findOne({
      userId: new Types.ObjectId(userId),
      provider: 'youtube_oauth',
    });

    if (existing) {
      existing.encryptedKey = encrypted;
      existing.label = label;
      existing.isActive = true;
      existing.lastUsedAt = new Date();
      await existing.save();
    } else {
      await ApiKeyModel.create({
        userId: new Types.ObjectId(userId),
        provider: 'youtube_oauth',
        label,
        encryptedKey: encrypted,
        isActive: true,
        lastUsedAt: new Date(),
      });
    }
  }

  async getYoutubeStatus(userId: string): Promise<{
    connected: boolean;
    channelTitle?: string;
    channelId?: string;
    channelThumbnail?: string;
    expired?: boolean;
  }> {
    try {
      const ApiKeyModel = this.userModel.db.model('ApiKey');
      const key = await ApiKeyModel.findOne({
        userId: new Types.ObjectId(userId),
        provider: 'youtube_oauth',
        isActive: true,
      }).select('+encryptedKey');

      if (!key) return { connected: false };

      const decrypted = this.decrypt(key.encryptedKey);
      const tokenData = JSON.parse(decrypted);

      const isExpired = tokenData.expiry_date < Date.now();

      return {
        connected: true,
        channelTitle: tokenData.channel_title,
        channelId: tokenData.channel_id,
        channelThumbnail: tokenData.channel_thumbnail,
        expired: isExpired,
      };
    } catch {
      return { connected: false };
    }
  }

  async disconnectYoutube(userId: string): Promise<{ message: string }> {
    const ApiKeyModel = this.userModel.db.model('ApiKey');
    await ApiKeyModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), provider: 'youtube_oauth' },
      { isActive: false }
    );
    return { message: 'YouTube disconnected' };
  }

  async verifyAccessToken(token: string): Promise<{ sub: string; email: string }> {
    return this.jwtService.verifyAsync(token, {
      secret: this.config.get('JWT_SECRET'),
    });
  }

  async getYoutubeTokens(userId: string): Promise<any> {
    const ApiKeyModel = this.userModel.db.model('ApiKey');
    const key = await ApiKeyModel.findOne({
      userId: new Types.ObjectId(userId),
      provider: 'youtube_oauth',
      isActive: true,
    }).select('+encryptedKey');

    if (!key) {
      throw new NotFoundException('YouTube not connected — please connect your channel first');
    }

    const decrypted = this.decrypt(key.encryptedKey);
    const tokenData = JSON.parse(decrypted);

    // Auto-refresh if token expired
    if (tokenData.expiry_date < Date.now()) {
      if (!tokenData.refresh_token) {
        // Mark as inactive — user must reconnect
        await ApiKeyModel.findOneAndUpdate(
          { userId: new Types.ObjectId(userId), provider: 'youtube_oauth' },
          { isActive: false }
        );
        throw new UnauthorizedException(
          'YouTube token expired and no refresh token available. Please reconnect your channel.'
        );
      }

      const clientId = this.config.get('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');

      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: tokenData.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
        }),
      });

      const refreshed = await refreshRes.json() as any;

      if (refreshed.access_token) {
        // Update token data with new access token
        tokenData.access_token = refreshed.access_token;
        tokenData.expiry_date = Date.now() + ((refreshed.expires_in || 3600) * 1000);

        // Save refreshed token back to DB
        const newEncrypted = this.encrypt(JSON.stringify(tokenData));
        key.encryptedKey = newEncrypted;
        key.lastUsedAt = new Date();
        await key.save();

        console.log(`[YOUTUBE] Token auto-refreshed for user ${userId}`);
      } else {
        // Refresh failed — mark as expired, user must reconnect
        await ApiKeyModel.findOneAndUpdate(
          { userId: new Types.ObjectId(userId), provider: 'youtube_oauth' },
          { isActive: false }
        );
        throw new UnauthorizedException(
          'YouTube token expired. Please reconnect your channel from the Agents page.'
        );
      }
    }

    // Update last used timestamp
    await ApiKeyModel.findByIdAndUpdate(key._id, { lastUsedAt: new Date() });

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
      token_type: tokenData.token_type,
      channel_id: tokenData.channel_id,
      channel_title: tokenData.channel_title,
    };
  }

  // ── Private helpers ───────────────────────────────────────────

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