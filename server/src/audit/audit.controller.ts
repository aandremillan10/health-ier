import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth';
import type { StaffRequest } from '../auth';
import { AuditService } from './audit.service';

@Controller('audit-events')
@UseGuards(StaffGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get('actors')
  actors(@Req() req: StaffRequest): ReturnType<AuditService['actors']> {
    return this.audit.actors(req.staff);
  }
  @Get()
  list(
    @Req() req: StaffRequest,
    @Query() query: unknown,
  ): ReturnType<AuditService['list']> {
    return this.audit.list(req.staff, query);
  }
  @Post('print')
  print(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ): ReturnType<AuditService['print']> {
    return this.audit.print(req.staff, body);
  }
}
