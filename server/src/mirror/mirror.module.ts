import { Module } from '@nestjs/common';
import { MirrorController } from './mirror.controller';
import { MirrorService } from './mirror.service';
import { MirrorWorker } from './mirror.worker';
@Module({
  controllers: [MirrorController],
  providers: [MirrorService, MirrorWorker],
  exports: [MirrorService],
})
export class MirrorModule {}
