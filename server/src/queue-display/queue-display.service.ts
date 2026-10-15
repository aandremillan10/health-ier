import { Injectable } from '@nestjs/common';
import { manilaDay } from '../clinic-dates';
import { clinicId, serverMode } from '../config';
import { DatabaseService } from '../database/database.service';
import { fail } from '../errors';
import { object } from '../validation';

type Discipline = 'medical' | 'dental' | 'laboratory';
interface DisplayDepartment {
  discipline: Discipline;
  serving: string[];
  waiting: string[];
}
export interface QueueDisplay {
  date: string;
  updatedAt: string;
  departments: DisplayDepartment[];
}
const prefixes = { medical: 'M', dental: 'D', laboratory: 'L' } as const;

export function requireQueueEdge(): void {
  if (serverMode() !== 'EDGE')
    fail(404, 'NOT_FOUND', 'Queue display is available on the clinic server.');
}

@Injectable()
export class QueueDisplayService {
  constructor(private readonly db: DatabaseService) {}

  async current(query: unknown): Promise<QueueDisplay> {
    requireQueueEdge();
    object(query, []);
    const now = new Date();
    const date = manilaDay(now);
    const rows = await this.db.appointment.findMany({
      where: {
        clinicId: clinicId(),
        queueDay: date,
        discipline: { in: ['medical', 'dental', 'laboratory'] },
        status: { in: ['arrived', 'waiting', 'with_provider', 'lab'] },
      },
      select: { discipline: true, status: true, queueNumber: true },
      orderBy: [{ queueNumber: 'asc' }, { discipline: 'asc' }],
    });
    const departments: DisplayDepartment[] = (
      ['medical', 'dental', 'laboratory'] as const
    ).map((discipline) => ({ discipline, serving: [], waiting: [] }));
    for (const row of rows) {
      const area = row.discipline;
      if (area !== 'medical' && area !== 'dental' && area !== 'laboratory')
        continue;
      const ticket = `${prefixes[area]}${String(row.queueNumber).padStart(3, '0')}`;
      const department = departments.find(
        (item) =>
          item.discipline === (row.status === 'lab' ? 'laboratory' : area),
      )!;
      if (row.status === 'arrived' || row.status === 'waiting')
        department.waiting.push(ticket);
      else if (
        row.status === 'lab' ||
        (row.status === 'with_provider' && area !== 'laboratory')
      )
        department.serving.push(ticket);
    }
    return { date, updatedAt: now.toISOString(), departments };
  }
}
