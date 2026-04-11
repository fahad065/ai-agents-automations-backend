import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, Req, UseGuards,
  } from '@nestjs/common';
  import { AdminService } from './admin.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { AdminGuard } from '../auth/guards/admin.guard';
  
  @Controller('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  export class AdminController {
    constructor(private adminService: AdminService) {}
  
    @Get('overview')
    getOverview() {
      return this.adminService.getOverview();
    }
  
    @Get('users')
    getUsers(
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Query('search') search?: string,
      @Query('role') role?: string,
      @Query('status') status?: string,
    ) {
      return this.adminService.getUsers({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        search, role, status,
      });
    }
  
    @Get('users/:id')
    getUser(@Param('id') id: string) {
      return this.adminService.getUser(id);
    }
  
    @Patch('users/:id')
    updateUser(@Param('id') id: string, @Body() dto: any) {
      return this.adminService.updateUser(id, dto);
    }
  
    @Delete('users/:id')
    deleteUser(@Param('id') id: string) {
      return this.adminService.deleteUser(id);
    }
  
    @Post('users/:id/impersonate')
    impersonate(@Param('id') id: string) {
      return this.adminService.impersonateUser(id);
    }
  
    @Get('modules')
    getModules() {
      return this.adminService.getModules();
    }
  
    @Post('modules')
    createModule(@Body() dto: any) {
      return this.adminService.createModule(dto);
    }
  
    @Patch('modules/:id')
    updateModule(@Param('id') id: string, @Body() dto: any) {
      return this.adminService.updateModule(id, dto);
    }
  
    @Delete('modules/:id')
    deleteModule(@Param('id') id: string) {
      return this.adminService.deleteModule(id);
    }
  
    @Get('pipelines')
    getPipelines(
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Query('status') status?: string,
      @Query('userId') userId?: string,
    ) {
      return this.adminService.getPipelineLogs({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
        status, userId,
      });
    }
  
    @Get('system')
    getSystemStats() {
      return this.adminService.getSystemStats();
    }
  }