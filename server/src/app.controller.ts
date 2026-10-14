import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { serverMode } from './config';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}
  @Get('health')
  async health(): Promise<{ status: 'ok'; mode: 'EDGE' | 'CLOUD' }> {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok', mode: serverMode() };
  }
}
