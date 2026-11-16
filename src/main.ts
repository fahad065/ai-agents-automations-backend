import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    // Keeps the exact request bytes on req.rawBody — Meta webhook
    // signatures (X-Hub-Signature-256) are an HMAC of the raw body.
    rawBody: true,
  });

  // Graceful shutdown — drain in-flight requests on SIGTERM/SIGINT
  // (Railway sends SIGTERM during a rolling deploy; without this the
  // process exits immediately and drops whatever was in flight)
  app.enableShutdownHooks();

  // CORS — strict in production, flexible in development
  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = isDev
    ? [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:8001',
        'https://ai-agents-automations-frontend.vercel.app',
        'https://www.logicmate.io',
        'https://logicmate.io'
      ]
    : [process.env.FRONTEND_URL as string];

  // The chat widget runs on CUSTOMERS' websites (any domain) and calls the
  // public, unauthenticated /chat/:embedKey routes — those must accept any
  // origin, or the browser blocks every widget message in production (it
  // did: until 2026-11-16 the widget only worked on our own domain). They
  // use no cookies/credentials, so `credentials: false` there. Everything
  // else keeps the strict allow-list.
  const PUBLIC_CHAT_PATH = /^\/api\/v1\/chat\//;
  const baseCors = {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  app.enableCors((req: any, callback: (err: Error | null, options?: any) => void) => {
    const path = req.originalUrl || req.url || '';
    if (PUBLIC_CHAT_PATH.test(path)) {
      callback(null, { ...baseCors, origin: true, credentials: false, methods: ['GET', 'POST', 'OPTIONS'] });
    } else {
      callback(null, { ...baseCors, origin: allowedOrigins, credentials: true });
    }
  });

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Compression
  app.use(compression());

  // ── Health check — before global prefix ───────────────────
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );


  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Server running → http://localhost:${port}/api/v1`);
  console.log(`Environment → ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();