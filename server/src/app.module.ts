import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthService, StaffGuard } from './auth';
import { AuthController } from './auth.controller';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';
import { MirrorModule } from './mirror/mirror.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuditInterceptor } from './audit/audit.interceptor';
import { ClinicalSummaryController } from './clinical-summary/clinical-summary.controller';
import { ClinicalSummaryService } from './clinical-summary/clinical-summary.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { LaboratoryController } from './laboratory/laboratory.controller';
import { LaboratoryService } from './laboratory/laboratory.service';
import { MembershipController } from './membership/membership.controller';
import { MembershipService } from './membership/membership.service';
import { ReferralsController } from './referrals/referrals.controller';
import { ReferralsService } from './referrals/referrals.service';
import { HistoricalDocumentsController } from './historical-documents/historical-documents.controller';
import { HistoricalDocumentsService } from './historical-documents/historical-documents.service';
import { HistoricalStorage } from './historical-documents/historical-storage';

@Module({
  imports: [DatabaseModule, MirrorModule],
  controllers: [
    AppController,
    AuthController,
    ClinicController,
    AuditController,
    ClinicalSummaryController,
    ReportsController,
    AppointmentsController,
    LaboratoryController,
    MembershipController,
    ReferralsController,
    HistoricalDocumentsController,
  ],
  providers: [
    AuthService,
    StaffGuard,
    ClinicService,
    AuditService,
    ClinicalSummaryService,
    ReportsService,
    AppointmentsService,
    LaboratoryService,
    MembershipService,
    ReferralsService,
    HistoricalDocumentsService,
    HistoricalStorage,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
