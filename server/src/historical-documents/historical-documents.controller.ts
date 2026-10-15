import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StaffGuard } from '../auth';
import type { StaffRequest } from '../auth';
import { HistoricalDocumentsService } from './historical-documents.service';

@Controller('patients/:patientId/historical-documents')
@UseGuards(StaffGuard)
export class HistoricalDocumentsController {
  constructor(private readonly records: HistoricalDocumentsService) {}
  @Get()
  list(
    @Req() req: StaffRequest,
    @Param('patientId') patientId: string,
    @Query() query: unknown,
  ): ReturnType<HistoricalDocumentsService['list']> {
    return this.records.list(req.staff, patientId, query);
  }
  @Post()
  import(
    @Req() req: StaffRequest,
    @Param('patientId') patientId: string,
    @Body() body: unknown,
  ): ReturnType<HistoricalDocumentsService['import']> {
    return this.records.import(req.staff, patientId, body);
  }
  @Get(':id')
  read(
    @Req() req: StaffRequest,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
  ): ReturnType<HistoricalDocumentsService['read']> {
    return this.records.read(req.staff, patientId, id);
  }
  @Get(':id/content')
  content(
    @Req() req: StaffRequest,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
  ): ReturnType<HistoricalDocumentsService['content']> {
    return this.records.content(req.staff, patientId, id);
  }
}
