import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Post,
} from '@nestjs/common';
import { MirrorService, type MirrorResult } from './mirror.service';
import { MirrorFailure } from './validation';
@Controller('internal/mirror')
export class MirrorController {
  constructor(private readonly mirror: MirrorService) {}
  private async controlled<T>(
    authorization: string | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      this.mirror.authenticate(authorization);
      return await action();
    } catch (error: unknown) {
      const code =
        error instanceof MirrorFailure ? error.code : 'DATABASE_UNAVAILABLE';
      const status =
        code === 'UNAUTHORIZED_MACHINE'
          ? 401
          : code === 'WRONG_MODE' || code === 'WRONG_CLINIC'
            ? 403
            : code === 'DATABASE_UNAVAILABLE'
              ? 503
              : 400;
      throw new HttpException(
        { code, message: 'Mirror operation could not be completed.' },
        status,
      );
    }
  }
  @Post('events')
  @HttpCode(200)
  events(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<MirrorResult> {
    return this.controlled(authorization, () => this.mirror.ingest(body));
  }
  @Post('historical-files')
  @HttpCode(200)
  historicalFiles(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<{ stored: true }> {
    return this.controlled(authorization, () =>
      this.mirror.stageHistorical(body),
    );
  }
  @Get('status')
  status(
    @Headers('authorization') authorization: string | undefined,
  ): ReturnType<MirrorService['status']> {
    return this.controlled(authorization, () => this.mirror.status());
  }
  @Post('bootstrap')
  @HttpCode(200)
  bootstrap(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ bootstrapped: true }> {
    return this.controlled(authorization, async () => {
      await this.mirror.bootstrap();
      return { bootstrapped: true };
    });
  }
}
