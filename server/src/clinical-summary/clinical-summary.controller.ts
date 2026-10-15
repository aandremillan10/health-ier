import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth';
import type { StaffRequest } from '../auth';
import { ClinicalSummaryService } from './clinical-summary.service';

@Controller()
@UseGuards(StaffGuard)
export class ClinicalSummaryController {
  constructor(private readonly summary: ClinicalSummaryService) {}
  @Get('patients/:id/clinical-summary')
  read(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<ClinicalSummaryService['read']> {
    return this.summary.read(req.staff, id);
  }
  @Post('patients/:id/clinical-summary')
  create(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicalSummaryService['create']> {
    return this.summary.create(req.staff, id, body);
  }
  @Patch('clinical-summary-items/:id')
  update(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicalSummaryService['change']> {
    return this.summary.change(req.staff, id, body, 'update');
  }
  @Post('clinical-summary-items/:id/corrections')
  correct(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicalSummaryService['change']> {
    return this.summary.change(req.staff, id, body, 'correct');
  }
  @Post('clinical-summary-items/:id/inactivate')
  inactivate(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicalSummaryService['change']> {
    return this.summary.change(req.staff, id, body, 'inactivate');
  }
  @Get('clinical-summary-items/:id/history')
  history(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<ClinicalSummaryService['history']> {
    return this.summary.history(req.staff, id);
  }
}
