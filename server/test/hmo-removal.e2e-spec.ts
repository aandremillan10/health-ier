import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';

const removedRoutes = [
  ['get', '/patients/20000000-0000-4000-8000-000000000001/family'],
  ['post', '/patients/20000000-0000-4000-8000-000000000001/membership'],
  ['patch', '/memberships/28000000-0000-4000-8000-000000000001'],
  ['post', '/memberships/28000000-0000-4000-8000-000000000001/corrections'],
  ['post', '/memberships/28000000-0000-4000-8000-000000000001/dependents'],
  ['patch', '/dependent-links/38000000-0000-4000-8000-000000000001'],
  ['post', '/dependent-links/38000000-0000-4000-8000-000000000001/corrections'],
  ['post', '/dependent-links/38000000-0000-4000-8000-000000000001/unlink'],
  ['get', '/memberships/28000000-0000-4000-8000-000000000001/history'],
  ['get', '/dependent-links/38000000-0000-4000-8000-000000000001/history'],
] as const;

describe('removed HMO HTTP routes', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ $queryRaw: async (): Promise<[]> => [] })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it.each(removedRoutes)('returns 404 for %s %s', async (method, path) => {
    const client = request(app.getHttpServer());
    await client[method](path).expect(404);
  });
});
