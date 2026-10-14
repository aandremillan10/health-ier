import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthService, StaffGuard } from './auth';
import { AuthController } from './auth.controller';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';
import { MirrorModule } from './mirror/mirror.module';

@Module({
  imports: [DatabaseModule, MirrorModule],
  controllers: [AppController, AuthController, ClinicController],
  providers: [AuthService, StaffGuard, ClinicService],
})
export class AppModule {}
