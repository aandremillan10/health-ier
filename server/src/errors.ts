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
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        response.status(400).json({
          code: 'VALIDATION',
          message: 'Check the request body.',
          fieldErrors: { body: 'The request body must contain valid JSON.' },
        });
        return;
      }
      if (error.type === 'entity.too.large') {
        response.status(400).json({
          code: 'VALIDATION',
          message: 'Check the request body.',
          fieldErrors: { body: 'The request body is too large.' },
        });
        return;
      }
    }
    if (error instanceof HttpException) {
      const body = error.getResponse();
      if (
        error.getStatus() === 400 &&
        !(typeof body === 'object' && 'code' in body)
      ) {
        response.status(400).json({
          code: 'VALIDATION',
          message: 'Check the request body.',
          fieldErrors: { body: 'The request body must contain valid JSON.' },
        });
        return;
      }
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
