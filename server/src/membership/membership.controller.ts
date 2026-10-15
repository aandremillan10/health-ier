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
import { StaffGuard } from '../auth';
import type { StaffRequest } from '../auth';
import { MembershipService } from './membership.service';
@Controller()
@UseGuards(StaffGuard)
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}
  @Get('patients/:id/family')
  family(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Query('asOf') asOf: unknown,
  ): ReturnType<MembershipService['family']> {
    return this.membership.family(req.staff, id, asOf);
  }
  @Post('patients/:id/membership')
  create(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['create']> {
    return this.membership.create(req.staff, id, body);
  }
  @Patch('memberships/:id')
  update(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['changeMembership']> {
    return this.membership.changeMembership(req.staff, id, body, 'update');
  }
  @Post('memberships/:id/corrections')
  correct(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['changeMembership']> {
    return this.membership.changeMembership(req.staff, id, body, 'correct');
  }
  @Post('memberships/:id/dependents')
  link(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['link']> {
    return this.membership.link(req.staff, id, body);
  }
  @Patch('dependent-links/:id')
  updateLink(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['changeLink']> {
    return this.membership.changeLink(req.staff, id, body, 'update');
  }
  @Post('dependent-links/:id/corrections')
  correctLink(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['changeLink']> {
    return this.membership.changeLink(req.staff, id, body, 'correct');
  }
  @Post('dependent-links/:id/unlink')
  unlink(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): ReturnType<MembershipService['changeLink']> {
    return this.membership.changeLink(req.staff, id, body, 'unlink');
  }
  @Get('memberships/:id/history')
  membershipHistory(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<MembershipService['history']> {
    return this.membership.history(req.staff, id, 'membership');
  }
  @Get('dependent-links/:id/history')
  linkHistory(
    @Req() req: StaffRequest,
    @Param('id') id: string,
  ): ReturnType<MembershipService['history']> {
    return this.membership.history(req.staff, id, 'dependent');
  }
}
