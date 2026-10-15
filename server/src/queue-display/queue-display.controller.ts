import {
  Controller,
  Get,
  Injectable,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Observable } from 'rxjs';
import { QueueDisplayService, requireQueueEdge } from './queue-display.service';
import type { QueueDisplay } from './queue-display.service';

@Injectable()
class QueueDisplayHeaders implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context.switchToHttp().getResponse<Response>().set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    return next.handle();
  }
}

@Controller()
@UseInterceptors(QueueDisplayHeaders)
export class QueueDisplayController {
  constructor(private readonly display: QueueDisplayService) {}

  private async asset(
    name: 'index.html' | 'display.css' | 'display.js',
    response: Response,
  ): Promise<string> {
    requireQueueEdge();
    const content = await readFile(join(__dirname, 'public', name), 'utf8');
    response.type(
      name === 'index.html'
        ? 'text/html'
        : name === 'display.css'
          ? 'text/css'
          : 'application/javascript',
    );
    return content;
  }

  @Get()
  page(@Res({ passthrough: true }) response: Response): Promise<string> {
    return this.asset('index.html', response);
  }

  @Get('queue-display/display.css')
  styles(@Res({ passthrough: true }) response: Response): Promise<string> {
    return this.asset('display.css', response);
  }

  @Get('queue-display/display.js')
  script(@Res({ passthrough: true }) response: Response): Promise<string> {
    return this.asset('display.js', response);
  }

  @Get('queue-display/data')
  data(@Query() query: unknown): Promise<QueueDisplay> {
    return this.display.current(query);
  }
}
