import {
    Controller, Get, Post, Delete,
    Body, Param, Query, Req, UseGuards, Patch
  } from '@nestjs/common';
  import { ApiKeysService } from './api-keys.service';
  import { ApiKeyProvider } from './schemas/api-key.schema';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

  @Controller('api-keys')
  @UseGuards(JwtAuthGuard)
  export class ApiKeysController {
    constructor(private apiKeysService: ApiKeysService) {}

    // Admin can pass body.userId to save a key under a specific client's
    // account instead of their own — e.g. adding a client's OpenAI key on
    // their behalf while setting up a chatbot for them. Ignored for non-admins.
    @Post()
    save(@Req() req: any, @Body() body: any) {
      const { userId: targetUserId, ...rest } = body;
      const ownerId = req.user.role === 'admin' && targetUserId ? targetUserId : req.user._id.toString();
      return this.apiKeysService.saveKey(ownerId, rest);
    }

    // Admin can pass ?userId= to check a specific client's keys (e.g. the
    // chatbot config page checking whether the bot's owner has an OpenAI
    // key on file). Ignored for non-admins.
    @Get()
    findAll(@Req() req: any, @Query('userId') targetUserId?: string) {
      const ownerId = req.user.role === 'admin' && targetUserId ? targetUserId : req.user._id.toString();
      return this.apiKeysService.getKeys(ownerId);
    }
  
    @Get('test/:provider')
    test(@Req() req: any, @Param('provider') provider: ApiKeyProvider) {
      return this.apiKeysService.testKey(req.user._id.toString(), provider);
    }
  
    @Delete(':id')
    remove(@Req() req: any, @Param('id') id: string) {
      return this.apiKeysService.deleteKey(req.user._id.toString(), id);
    }

    @Patch(':id')
    update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
      return this.apiKeysService.saveKey(req.user._id.toString(), {
        ...body,
        key: body.value || body.key,
      });
    }

    @Post(':provider/test')
    @UseGuards(JwtAuthGuard)
    testByProvider(@Param('provider') provider: string, @Req() req: any) {
      return this.apiKeysService.testKey(
        req.user._id.toString(),
        provider as ApiKeyProvider,
      );
    }
  }