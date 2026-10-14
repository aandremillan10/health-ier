import type { NestExpressApplication } from '@nestjs/platform-express';
import { SafeErrorFilter } from './errors';
export function configureHttp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalFilters(new SafeErrorFilter());
}
