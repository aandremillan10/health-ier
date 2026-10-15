import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type { Prisma } from '../generated/prisma/client';
import type { Principal } from '../mirror-contract';
import { DatabaseService } from '../database/database.service';
import { recordAudit } from '../audit/audit.service';
import { clinicRange } from '../clinic-dates';
import { clinicId } from '../config';
import { fail } from '../errors';
import { object, text } from '../validation';

interface Report {
  from: string;
  to: string;
  generatedAt: string;
  fingerprint: string;
  totals: {
    visits: number;
    noShows: number;
    pendingLabs: number;
    averageLabMinutes: number | null;
    newPatients: number;
  };
  daily: { date: string; visits: number }[];
  departments: {
    discipline: 'medical' | 'dental' | 'laboratory';
    patients: number;
  }[];
}
export function reportCsv(report: Report): string {
  const rows: (string | number | null)[][] = [
    ['section', 'label', 'value', 'unit'],
    ['range', 'From', report.from, 'date'],
    ['range', 'To', report.to, 'date'],
    ['summary', 'Visits', report.totals.visits, 'count'],
    ['summary', 'No-shows', report.totals.noShows, 'count'],
    ['summary', 'Pending laboratories', report.totals.pendingLabs, 'count'],
    [
      'summary',
      'Average laboratory turnaround',
      report.totals.averageLabMinutes,
      'minutes',
    ],
    [
      'summary',
      'New patient registrations',
      report.totals.newPatients,
      'count',
    ],
    ...report.daily.map((row) => ['daily', row.date, row.visits, 'visits']),
    ...report.departments.map((row) => [
      'department',
      row.discipline,
      row.patients,
      'patients',
    ]),
  ];
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            const cell = String(value ?? '');
            return /[",\r\n]/.test(cell)
              ? `"${cell.replaceAll('"', '""')}"`
              : cell;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}
  private authorize(staff: Principal): void {
    if (!staff.isHead && !['clerk', 'attendant'].includes(staff.role))
      fail(
        403,
        'FORBIDDEN',
        'Operational reports are available to the clinic head, clerk and nursing attendant.',
      );
  }
  private async aggregate(
    tx: Prisma.TransactionClient,
    range: ReturnType<typeof clinicRange>,
  ): Promise<Report> {
    const [appointments, labs, newPatients] = await Promise.all([
      tx.appointment.findMany({
        where: {
          clinicId: clinicId(),
          scheduledAt: { gte: range.gte, lt: range.lt },
        },
        select: {
          patientId: true,
          discipline: true,
          status: true,
          scheduledAt: true,
        },
      }),
      tx.labOrder.findMany({
        where: { createdAt: { gte: range.gte, lt: range.lt } },
        select: {
          status: true,
          createdAt: true,
          results: {
            where: { status: 'finalized' },
            orderBy: { finalizedAt: 'asc' },
            take: 1,
            select: { finalizedAt: true },
          },
        },
      }),
      tx.patient.count({
        where: { createdAt: { gte: range.gte, lt: range.lt } },
      }),
    ]);
    const daily = new Map<string, number>();
    const lastDay = Date.parse(`${range.to}T00:00:00Z`);
    for (
      let day = new Date(`${range.from}T00:00:00Z`);
      day.getTime() <= lastDay;
      day = new Date(day.getTime() + 86400000)
    )
      daily.set(day.toISOString().slice(0, 10), 0);
    const departments = new Map<
      'medical' | 'dental' | 'laboratory',
      Set<string>
    >([
      ['medical', new Set()],
      ['dental', new Set()],
      ['laboratory', new Set()],
    ]);
    let visits = 0;
    let noShows = 0;
    for (const visit of appointments) {
      if (visit.status === 'no_show') noShows++;
      if (
        !['arrived', 'waiting', 'with_provider', 'lab', 'completed'].includes(
          visit.status,
        )
      )
        continue;
      visits++;
      const day = new Date(visit.scheduledAt.getTime() + 8 * 3600000)
        .toISOString()
        .slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + 1);
      departments
        .get(visit.discipline as 'medical' | 'dental' | 'laboratory')
        ?.add(visit.patientId);
    }
    const turnarounds = labs.flatMap((order) => {
      const finalizedAt = order.results[0]?.finalizedAt;
      return finalizedAt
        ? [(finalizedAt.getTime() - order.createdAt.getTime()) / 60000]
        : [];
    });
    assert.ok(
      turnarounds.every((minutes) => Number.isFinite(minutes) && minutes >= 0),
      'Laboratory timestamps must preserve ordering.',
    );
    const totals = {
      visits,
      noShows,
      pendingLabs: labs.filter((order) =>
        ['ordered', 'in_progress'].includes(order.status),
      ).length,
      averageLabMinutes: turnarounds.length
        ? Math.round(
            (turnarounds.reduce((sum, minutes) => sum + minutes, 0) /
              turnarounds.length) *
              10,
          ) / 10
        : null,
      newPatients,
    };
    const content = {
      from: range.from,
      to: range.to,
      totals,
      daily: [...daily].map(([date, count]) => ({ date, visits: count })),
      departments: [...departments].map(([discipline, patients]) => ({
        discipline,
        patients: patients.size,
      })),
    };
    assert.equal(
      content.daily.reduce((sum, day) => sum + day.visits, 0),
      visits,
    );
    return {
      ...content,
      generatedAt: new Date().toISOString(),
      fingerprint: createHash('sha256')
        .update(JSON.stringify(content))
        .digest('hex'),
    };
  }
  async read(staff: Principal, query: unknown): Promise<Report> {
    this.authorize(staff);
    const input = object(query, ['from', 'to']);
    const range = clinicRange(input.from, input.to);
    return this.db.$transaction((tx) => this.aggregate(tx, range), {
      isolationLevel: 'RepeatableRead',
    });
  }
  async export(
    staff: Principal,
    input: unknown,
  ): Promise<{ filename: string; csv: string; fingerprint: string }> {
    this.authorize(staff);
    const body = object(input, ['from', 'to', 'fingerprint']);
    const range = clinicRange(body.from, body.to);
    const fingerprint = text(body.fingerprint, 'fingerprint', true, 64)!;
    return this.db.$transaction(
      async (tx) => {
        const report = await this.aggregate(tx, range);
        if (report.fingerprint !== fingerprint)
          fail(
            409,
            'CONFLICT',
            'The report changed. Refresh the report before exporting.',
          );
        await recordAudit(tx, staff, {
          action: 'export',
          resourceType: `report:${range.from}:${range.to}`,
        });
        return {
          filename: `amlig-report-${range.from}-${range.to}.csv`,
          csv: reportCsv(report),
          fingerprint: report.fingerprint,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
