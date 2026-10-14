import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClinicService } from './clinic.service';
import { StaffGuard } from './auth';
import type { StaffRequest } from './auth';

@Controller()
@UseGuards(StaffGuard)
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}
  @Get('patients')
  patients(
    @Req() req: StaffRequest,
    @Query('search') search: unknown,
  ): ReturnType<ClinicService['patients']> {
    return this.clinic.patients(req.staff, search);
  }
  @Post('patients')
  createPatient(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ): ReturnType<ClinicService['createPatient']> {
    return this.clinic.createPatient(req.staff, body);
  }
  @Patch('patients/:id')
  updatePatient(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['updatePatient']> {
    return this.clinic.updatePatient(req.staff, id, body);
  }
  @Get('patients/:id/vitals')
  vitals(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<ClinicService['listVitals']> {
    return this.clinic.listVitals(req.staff, id);
  }
  @Post('patients/:id/vitals')
  createVitals(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['createVitals']> {
    return this.clinic.createVitals(req.staff, id, body);
  }
  @Patch('vitals/:id')
  updateVitals(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['change']> {
    return this.clinic.change(req.staff, 'vitals', id, body);
  }
  @Post('vitals/:id/finalize')
  finalizeVitals(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['change']> {
    return this.clinic.change(req.staff, 'vitals', id, body, true);
  }
  @Post('vitals/:id/corrections')
  correctVitals(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['correct']> {
    return this.clinic.correct(req.staff, 'vitals', id, body);
  }
  @Get('patients/:id/charts/:discipline/entries')
  entries(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Param('discipline') area: string,
  ): ReturnType<ClinicService['listEntries']> {
    return this.clinic.listEntries(req.staff, id, area);
  }
  @Post('patients/:id/charts/:discipline/entries')
  createEntry(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Param('discipline') area: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['createEntry']> {
    return this.clinic.createEntry(req.staff, id, area, body);
  }
  @Patch('entries/:id')
  updateEntry(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['change']> {
    return this.clinic.change(req.staff, 'entry', id, body);
  }
  @Post('entries/:id/finalize')
  finalizeEntry(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['change']> {
    return this.clinic.change(req.staff, 'entry', id, body, true);
  }
  @Post('entries/:id/corrections')
  correctEntry(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<ClinicService['correct']> {
    return this.clinic.correct(req.staff, 'entry', id, body);
  }
  @Get('entries/:id/corrections')
  corrections(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<ClinicService['corrections']> {
    return this.clinic.corrections(req.staff, id);
  }
  @Post('documents/preview')
  preview(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ): ReturnType<ClinicService['document']> {
    return this.clinic.document(req.staff, body, false);
  }
  @Post('documents')
  issue(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ): ReturnType<ClinicService['document']> {
    return this.clinic.document(req.staff, body, true);
  }
  @Get('documents/:id')
  document(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<ClinicService['readDocument']> {
    return this.clinic.readDocument(req.staff, id);
  }
}
