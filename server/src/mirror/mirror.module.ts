import { Module } from '@nestjs/common';
import { MirrorController } from './mirror.controller';
import { MirrorService } from './mirror.service';
import { MirrorWorker } from './mirror.worker';
import { HistoricalStorage } from '../historical-documents/historical-storage';
@Module({
  controllers: [MirrorController],
  providers: [MirrorService, MirrorWorker, HistoricalStorage],
  exports: [MirrorService],
})
export class MirrorModule {}
