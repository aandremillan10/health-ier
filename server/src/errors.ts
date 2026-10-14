import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

export function fail(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new HttpException({ code, message, ...details }, status);
}
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'object' && 'code' in body
            ? body
            : { code: 'REQUEST_FAILED', message: 'Request failed.' },
        );
      return;
    }
    response.status(503).json({
      code: 'UNAVAILABLE',
      message:
        'Clinic service is temporarily unavailable. The operation was not confirmed.',
    });
  }
}
