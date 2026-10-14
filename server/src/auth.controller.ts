import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService, StaffGuard } from './auth';
import type { StaffRequest } from './auth';
import type { Principal } from './mirror-contract';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown): ReturnType<AuthService['login']> {
    return this.auth.login(body);
  }
  @Get('me')
  @UseGuards(StaffGuard)
  me(@Req() req: StaffRequest): Principal {
    return req.staff;
  }
  @Post('logout')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  logout(@Req() req: StaffRequest): ReturnType<AuthService['logout']> {
    return this.auth.logout(req.tokenHash);
  }
}
