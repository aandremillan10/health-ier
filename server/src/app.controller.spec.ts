import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { DatabaseService } from './database/database.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: DatabaseService,
          useValue: { $queryRaw: async (): Promise<[]> => [] },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('probes PostgreSQL before confirming readiness', async () => {
      expect(await appController.health()).toEqual({
        status: 'ok',
        mode: 'EDGE',
      });
    });
  });
});
