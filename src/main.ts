import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

type HttpHandler = (req: unknown, res: unknown) => unknown;

let cachedServer: HttpHandler | undefined;

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/$/, '');
}

function getAllowedOrigins() {
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  return new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configuredOrigins,
  ]);
}

function configureAppCors(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const allowedOrigins = getAllowedOrigins();

  app.enableCors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const isAllowedVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(
        normalizedOrigin,
      );

      callback(null, allowedOrigins.has(normalizedOrigin) || isAllowedVercelPreview);
    },
    credentials: true,
  });
}

function configureBodyParser(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  // Images are submitted as base64 data URLs for the MVP. A 10 MB image becomes
  // larger in JSON, so the request body limit needs headroom above the UI limit.
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ limit: '15mb', extended: true }));
}

async function getCloudFunctionServer(): Promise<HttpHandler> {
  if (cachedServer) {
    return cachedServer;
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureBodyParser(app);
  configureAppCors(app);
  await app.init();
  cachedServer = app.getHttpAdapter().getInstance() as HttpHandler;

  return cachedServer;
}

export async function cuanLimbah(req: unknown, res: unknown) {
  const server = await getCloudFunctionServer();
  return server(req, res);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureBodyParser(app);
  configureAppCors(app);

  await app.listen(process.env.PORT ?? 3000);
}

if (require.main === module) {
  void bootstrap();
}
