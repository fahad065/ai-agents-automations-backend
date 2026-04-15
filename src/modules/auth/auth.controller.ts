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

  // ── Google OAuth (existing — for app login) ───────────────────

  @SkipThrottle()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Handled by Passport
  }

  @SkipThrottle()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: any) {
    const result = await this.authService.googleLogin(req.user);
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';
    res.redirect(
      `${frontendUrl}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`,
    );
  }

  // ── YouTube OAuth ─────────────────────────────────────────────

  // Step 1 — Redirect user to Google YouTube consent screen
  @SkipThrottle()
  @Get('youtube/connect')
  async connectYoutube(
    @Query('token') token: string,
    @Res() res: any,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    if (!token) {
      return res.redirect(`${frontendUrl}/dashboard/agents?youtube=error&reason=unauthorized`);
    }

    try {
      // Verify JWT manually
      const payload = await this.authService.verifyAccessToken(token);
      const url = await this.authService.getYoutubeAuthUrl(payload.sub);
      return res.redirect(url);
    } catch {
      return res.redirect(`${frontendUrl}/dashboard/agents?youtube=error&reason=unauthorized`);
    }
  }

  // Step 2 — Google redirects here after user approves
  @SkipThrottle()
  @Get('youtube/callback')
  async youtubeCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: any,
  ) {
    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3000';

    // User denied access
    if (error || !code) {
      return res.redirect(
        `${frontendUrl}/dashboard/agents?youtube=denied`
      );
    }

    try {
      await this.authService.handleYoutubeCallback(code, state);
      return res.redirect(
        `${frontendUrl}/dashboard/agents?youtube=connected`
      );
    } catch (err) {
      console.error('[YOUTUBE CALLBACK ERROR]', err);
      return res.redirect(
        `${frontendUrl}/dashboard/agents?youtube=error`
      );
    }
  }

  // Get YouTube connection status for current user
  @SkipThrottle()
  @Get('youtube/status')
  @UseGuards(JwtAuthGuard)
  async youtubeStatus(@Req() req: any) {
    return this.authService.getYoutubeStatus(req.user._id.toString());
  }

  // Disconnect YouTube for current user
  @SkipThrottle()
  @Delete('youtube/disconnect')
  @UseGuards(JwtAuthGuard)
  async youtubeDisconnect(@Req() req: any) {
    return this.authService.disconnectYoutube(req.user._id.toString());
  }

  // Get decrypted YouTube tokens — called by Python pipeline
  // Protected by service token (JWT) — not user-facing
  @SkipThrottle()
  @Get('youtube/tokens/:userId')
  @UseGuards(JwtAuthGuard)
  async getYoutubeTokens(
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    // Only allow admin or the user themselves to fetch tokens
    const requesterId = req.user._id.toString();
    const requesterRole = req.user.role;

    if (requesterId !== userId && requesterRole !== 'admin') {
      throw new Error('Unauthorized');
    }

    return this.authService.getYoutubeTokens(userId);
  }
}