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
import { ReferralsService } from './referrals.service';
import type { ReferralDto } from './referrals.service';

@Controller()
@UseGuards(StaffGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get('patients/:id/referrals')
  patient(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): Promise<ReferralDto[]> {
    return this.referrals.listPatient(req.staff, id);
  }
  @Get('referrals/inbox')
  inbox(
    @Req() req: StaffRequest,
    @Query('scope') scope: unknown,
  ): Promise<ReferralDto[]> {
    return this.referrals.inbox(req.staff, scope);
  }
  @Get('referrals/sent')
  sent(
    @Req() req: StaffRequest,
    @Query('scope') scope: unknown,
  ): Promise<ReferralDto[]> {
    return this.referrals.sent(req.staff, scope);
  }
  @Post('patients/:id/referrals')
  create(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReferralDto> {
    return this.referrals.create(req.staff, id, body);
  }
  @Post('referrals/:id/accept')
  accept(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReferralDto> {
    return this.referrals.transition(req.staff, id, body, 'accept');
  }
  @Post('referrals/:id/start')
  start(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReferralDto> {
    return this.referrals.transition(req.staff, id, body, 'start');
  }
  @Post('referrals/:id/complete')
  complete(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReferralDto> {
    return this.referrals.transition(req.staff, id, body, 'complete');
  }
  @Post('referrals/:id/cancel')
  cancel(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReferralDto> {
    return this.referrals.transition(req.staff, id, body, 'cancel');
  }
  @Post('referrals/:id/reject')
  reject(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ReferralDto> {
    return this.referrals.transition(req.staff, id, body, 'reject');
  }
}
