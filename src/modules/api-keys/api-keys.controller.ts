import {
    Controller, Get, Post, Delete,
    Body, Param, Req, UseGuards, Patch
  } from '@nestjs/common';
  import { ApiKeysService } from './api-keys.service';
  import { ApiKeyProvider } from './schemas/api-key.schema';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  
  @Controller('api-keys')
  @UseGuards(JwtAuthGuard)
  export class ApiKeysController {
    constructor(private apiKeysService: ApiKeysService) {}
  
    @Post()
    save(@Req() req: any, @Body() body: any) {
      return this.apiKeysService.saveKey(req.user._id.toString(), body);
    }
  
    @Get()
    findAll(@Req() req: any) {
      return this.apiKeysService.getKeys(req.user._id.toString());
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