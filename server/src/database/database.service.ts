import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString =
      process.env.DATABASE_URL ??
      'postgresql://unconfigured@127.0.0.1:1/healthier_unconfigured';
    super({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      }),
    });
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
