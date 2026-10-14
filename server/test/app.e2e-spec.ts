import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';
import { afterEach, beforeEach, describe, it } from 'vitest';

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;
  let databaseAvailable: boolean;

  beforeEach(async () => {
    databaseAvailable = true;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        $queryRaw: async (): Promise<[]> => {
          if (!databaseAvailable) throw new Error('private connection detail');
          return [];
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
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
  it.each([
    '/patients/20000000-0000-4000-8000-000000000001',
    '/patients/20000000-0000-4000-8000-000000000001/documents',
  ])('protects new identity/history route %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });
  it('malformed JSON is a safe validation failure', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400)
      .expect({
        code: 'VALIDATION',
        message: 'Check the request body.',
        fieldErrors: { body: 'The request body must contain valid JSON.' },
      }));
  it('oversized bodies are bounded without echoing their content', () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ password: 'x'.repeat(1100000) })
      .expect(400)
      .expect({
        code: 'VALIDATION',
        message: 'Check the request body.',
        fieldErrors: { body: 'The request body is too large.' },
      }));
  it('unavailable PostgreSQL never reports ready or leaks connection details', () => {
    databaseAvailable = false;
    return request(app.getHttpServer()).get('/health').expect(503).expect({
      code: 'UNAVAILABLE',
      message:
        'Clinic service is temporarily unavailable. The operation was not confirmed.',
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
