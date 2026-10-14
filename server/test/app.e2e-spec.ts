import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { SafeErrorFilter } from '../src/errors';
import { afterEach, beforeEach, describe, it } from 'vitest';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ $queryRaw: async (): Promise<[]> => [] })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new SafeErrorFilter());
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', mode: 'EDGE' });
  });
  it('missing auth returns a safe structured denial', () =>
    request(app.getHttpServer())
      .get('/patients')
      .expect(401)
      .expect({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' }));

  afterEach(async () => {
    await app.close();
  });
});
