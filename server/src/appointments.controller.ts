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
import { StaffGuard } from './auth';
import type { StaffRequest } from './auth';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
@UseGuards(StaffGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get()
  list(
    @Req() req: StaffRequest,
    @Query() query: unknown,
  ): ReturnType<AppointmentsService['list']> {
    return this.appointments.list(req.staff, query);
  }
  @Post()
  create(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ): ReturnType<AppointmentsService['create']> {
    return this.appointments.create(req.staff, body);
  }
  @Post(':id/transitions')
  transition(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<AppointmentsService['change']> {
    return this.appointments.change(req.staff, id, body);
  }
  @Post(':id/corrections')
  correct(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<AppointmentsService['change']> {
    return this.appointments.change(req.staff, id, body, true);
  }
}
