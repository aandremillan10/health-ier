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
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(StaffGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get()
  read(
    @Req() req: StaffRequest,
    @Query() query: unknown,
  ): ReturnType<ReportsService['read']> {
    return this.reports.read(req.staff, query);
  }
  @Post('export')
  export(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ): ReturnType<ReportsService['export']> {
    return this.reports.export(req.staff, body);
  }
}
