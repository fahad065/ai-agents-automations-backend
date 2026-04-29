import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // ── Standard auth ─────────────────────────────────────────────

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    if (!dto['userId'] || !dto.refreshToken) {
      throw new Error('userId and refreshToken required');
    }
    return this.authService.refreshTokens(dto['userId'], dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any) {
    return this.authService.logout(req.user._id.toString());
  }

  @SkipThrottle()
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: any) {
    const user = req.user.toObject ? req.user.toObject() : req.user;
    delete user.password;
    delete user.refreshToken;
    return { user };
  }

  // ── Google OAuth — manual redirect to force account selection ──

  @SkipThrottle()
  @Get('google')
  async googleAuth(@Res() res: any) {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    const callbackUrl = this.config.get('GOOGLE_CALLBACK_URL');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'email profile',
      prompt: 'select_account',
      access_type: 'offline',
    });

    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
  }

  @SkipThrottle()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() res: any,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    if (error || !code) {
      return res.redirect(`${frontendUrl}/auth/login?error=cancelled`);
    }

    try {
      const clientId = this.config.get('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET');
      const callbackUrl = this.config.get('GOOGLE_CALLBACK_URL');

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenRes.json() as any;

      if (!tokens.access_token) {
        throw new Error('Failed to get access token');
      }

      // Get user profile
      const profileRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const profile = await profileRes.json() as any;

      const googleUser = {
        googleId: profile.id,
        email: profile.email,
        name: profile.name,
        avatar: profile.picture,
      };

      const result = await this.authService.googleLogin(googleUser);

      return res.redirect(
        `${frontendUrl}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`
      );
    } catch (err) {
      console.error('[GOOGLE CALLBACK ERROR]', err);
      return res.redirect(`${frontendUrl}/auth/login?error=oauth_failed`);
    }
  }

  // ── YouTube OAuth ─────────────────────────────────────────────

  @SkipThrottle()
  @Get('youtube/connect')
  async connectYoutube(
    @Query('token') token: string,
    @Res() res: any,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    if (!token) {
      return res.redirect(`${frontendUrl}/dashboard/modules?youtube=error&reason=unauthorized`);
    }

    try {
      const payload = await this.authService.verifyAccessToken(token);
      const url = await this.authService.getYoutubeAuthUrl(payload.sub);
      return res.redirect(url);
    } catch {
      return res.redirect(`${frontendUrl}/dashboard/modules?youtube=error&reason=unauthorized`);
    }
  }

  @SkipThrottle()
  @Get('youtube/callback')
  async youtubeCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: any,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    if (error || !code) {
      return res.redirect(`${frontendUrl}/dashboard/modules?youtube=denied`);
    }

    try {
      await this.authService.handleYoutubeCallback(code, state);
      return res.redirect(`${frontendUrl}/dashboard/modules?youtube=connected`);
    } catch (err) {
      console.error('[YOUTUBE CALLBACK ERROR]', err);
      return res.redirect(`${frontendUrl}/dashboard/modules?youtube=error`);
    }
  }

  @SkipThrottle()
  @Get('youtube/status')
  @UseGuards(JwtAuthGuard)
  async youtubeStatus(@Req() req: any) {
    return this.authService.getYoutubeStatus(req.user._id.toString());
  }

  @SkipThrottle()
  @Delete('youtube/disconnect')
  @UseGuards(JwtAuthGuard)
  async youtubeDisconnect(@Req() req: any) {
    return this.authService.disconnectYoutube(req.user._id.toString());
  }

  @SkipThrottle()
  @Get('youtube/tokens/:userId')
  @UseGuards(JwtAuthGuard)
  async getYoutubeTokens(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const requesterId = req.user._id.toString();
    const requesterRole = req.user.role;

    if (requesterId !== userId && requesterRole !== 'admin') {
      throw new Error('Unauthorized');
    }

    return this.authService.getYoutubeTokens(userId);
  }
  
}