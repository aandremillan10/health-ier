import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SafeErrorFilter } from './errors';
import { clinicId, serverMode } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  clinicId();
  serverMode();
  app.useGlobalFilters(new SafeErrorFilter());
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
import 'dotenv/config';
