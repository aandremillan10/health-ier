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
import { LaboratoryService } from './laboratory.service';
import type { LabOrderDto } from './laboratory.service';

@Controller()
@UseGuards(StaffGuard)
export class LaboratoryController {
  constructor(private readonly laboratory: LaboratoryService) {}
  @Get('patients/:id/lab-orders')
  orders(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): Promise<LabOrderDto[]> {
    return this.laboratory.listOrders(req.staff, id);
  }
  @Get('laboratory/queue')
  queue(
    @Req() req: StaffRequest,
    @Query('scope') scope: unknown,
  ): Promise<LabOrderDto[]> {
    return this.laboratory.queue(req.staff, scope);
  }
  @Post('patients/:id/lab-orders')
  create(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.createOrder(req.staff, id, body);
  }
  @Post('lab-orders/:id/start')
  start(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.transition(req.staff, id, body, 'start');
  }
  @Post('lab-orders/:id/cancel')
  cancel(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.transition(req.staff, id, body, 'cancel');
  }
  @Post('lab-orders/:id/reject')
  reject(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.transition(req.staff, id, body, 'reject');
  }
  @Post('lab-orders/:id/review')
  review(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.transition(req.staff, id, body, 'review');
  }
  @Post('lab-orders/:id/result')
  result(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.saveResult(req.staff, id, body);
  }
  @Post('lab-results/:id/finalize')
  finalize(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.finalizeResult(req.staff, id, body);
  }
  @Post('lab-results/:id/corrections')
  correct(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LabOrderDto> {
    return this.laboratory.finalizeResult(req.staff, id, body, true);
  }
}
