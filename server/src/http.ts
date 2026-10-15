import type { NestExpressApplication } from '@nestjs/platform-express';
import { SafeErrorFilter } from './errors';
export function configureHttp(app: NestExpressApplication): void {
  app.useBodyParser('json', {
    limit: '15mb',
    type: (req) =>
      req.method === 'POST' &&
      /^\/internal\/mirror\/historical-files(?:\?.*)?$/.test(req.url ?? '') &&
      String(req.headers['content-type'] ?? '').startsWith('application/json'),
  });
  app.useBodyParser('json', {
    limit: '15mb',
    type: (req) =>
      req.method === 'POST' &&
      /^\/patients\/[0-9a-f-]{36}\/historical-documents(?:\?.*)?$/i.test(
        req.url ?? '',
      ) &&
      String(req.headers['content-type'] ?? '').startsWith('application/json'),
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalFilters(new SafeErrorFilter());
}
