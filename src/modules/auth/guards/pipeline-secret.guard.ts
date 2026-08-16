import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class PipelineSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers['x-pipeline-secret'] || '';
    const expected = process.env.PIPELINE_SECRET || 'logicmate_pipeline_secret_2026';
    if (secret !== expected) {
      throw new UnauthorizedException('Invalid pipeline secret');
    }
    return true;
  }
}