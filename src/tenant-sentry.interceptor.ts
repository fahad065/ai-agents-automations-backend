import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as Sentry from '@sentry/nestjs';

// Tags Sentry's current scope with the authenticated caller's identity, so
// any exception captured further down the request (by SentryGlobalFilter,
// or an explicit Sentry.captureException call) is attributable to a
// specific tenant instead of showing up as an anonymous error in a shared
// pool. Runs after guards (where req.user gets attached), before the
// handler — if there's no req.user (public routes, or the chat engine,
// which tags itself explicitly with the bot owner's id instead) this is a
// harmless no-op.
@Injectable()
export class TenantSentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (user?._id) {
      Sentry.getCurrentScope().setUser({ id: user._id.toString(), email: user.email });
      Sentry.getCurrentScope().setTag('tenantUserId', user._id.toString());
    }
    return next.handle();
  }
}
