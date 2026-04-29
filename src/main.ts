import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

type HttpHandler = (req: unknown, res: unknown) => unknown;

let cachedServer: HttpHandler | undefined;

function configureAppCors(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const frontendUrl = process.env.FRONTEND_URL?.trim() || 'http://localhost:5173';

  app.enableCors({
    origin: frontendUrl,
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
