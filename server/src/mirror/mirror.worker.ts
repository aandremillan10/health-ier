import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { serverMode } from '../config';
import type { MirrorEvent } from '../mirror-contract';
import { MirrorService } from './mirror.service';
import { MirrorFailure } from './validation';
export async function httpsTransport(events: MirrorEvent[]): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(process.env.MIRROR_URL ?? '');
  } catch {
    throw new MirrorFailure('INVALID_ENDPOINT');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    url.pathname !== '/internal/mirror/events'
  )
    throw new MirrorFailure('INVALID_ENDPOINT');
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.MIRROR_MACHINE_TOKEN ?? ''}`,
    },
    body: JSON.stringify({ clinicId: events[0]?.clinicId, events }),
  });
  if (!response.ok) throw new MirrorFailure(`REMOTE_HTTP_${response.status}`);
  const raw = await response.text();
  if (raw.length > 64000) throw new MirrorFailure('INVALID_ACK');
  return JSON.parse(raw) as unknown;
}
@Injectable()
export class MirrorWorker implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private backoff = 1000;
  constructor(private readonly mirror: MirrorService) {}
  onModuleInit(): void {
    if (serverMode() === 'EDGE' && process.env.MIRROR_ENABLED === 'true')
      this.schedule(0);
  }
  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.tick();
    }, delay);
    this.timer.unref();
  }
  private async tick(): Promise<void> {
    try {
      const delivered = await this.mirror.deliver(httpsTransport);
      const status = await this.mirror.status();
      this.backoff =
        delivered > 0 || status.pending === 0
          ? 1000
          : Math.min(this.backoff * 2, 60000);
    } catch {
      this.backoff = Math.min(this.backoff * 2, 60000);
    }
    if (!this.stopped) this.schedule(this.backoff);
  }
  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
