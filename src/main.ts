import { NestFactory } from '@nestjs/core';
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

async function getCloudFunctionServer(): Promise<HttpHandler> {
  if (cachedServer) {
    return cachedServer;
  }

  const app = await NestFactory.create(AppModule);
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
  const app = await NestFactory.create(AppModule);
  configureAppCors(app);

  await app.listen(process.env.PORT ?? 3000);
}

if (require.main === module) {
  void bootstrap();
}
