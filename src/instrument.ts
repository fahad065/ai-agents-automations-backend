// Must be imported as the very first line of main.ts, before any other
// import — Sentry's Node SDK patches modules (http, mongoose, etc.) for
// auto-instrumentation, which only works if it runs before those modules
// are required elsewhere in the app.
import * as Sentry from '@sentry/nestjs';

// No SENTRY_DSN set → the SDK quietly disables itself (no events sent, no
// crash, no perf cost beyond the no-op). Nothing else in this file needs
// to branch on whether it's configured — that's the documented, intended
// behavior of calling init() with an empty dsn.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.SENTRY_DSN ? 0.1 : 0,
});
