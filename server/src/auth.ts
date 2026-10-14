import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { Request } from 'express';
import { DatabaseService } from './database/database.service';
import { fail } from './errors';
import { Principal, Role } from './mirror-contract';
import type { Staff } from './generated/prisma/client';
import { invalid, object, text } from './validation';
import { serverMode } from './config';
export interface StaffRequest extends Request {
  staff: Principal;
  tokenHash: string;
}
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(expected, 'hex'),
  );
}
export function principal(staff: Staff): Principal {
  return {
    id: staff.id,
    displayName: staff.displayName,
    role: staff.role as Role,
    isHead: staff.isHead,
  };
}
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}
  async login(
    input: unknown,
  ): Promise<{ staff: Principal; token: string; expiresAt: string }> {
    if (serverMode() !== 'EDGE')
      fail(
        403,
        'EDGE_ONLY',
        'Staff operations are available only on the clinic server.',
      );
    const body = object(input, ['username', 'password']);
    const username = text(body.username, 'username', true, 80)!;
    if (
      typeof body.password !== 'string' ||
      body.password.length < 1 ||
      body.password.length > 256
    )
      invalid('password');
    const password = body.password;
    const staff = await this.db.staff.findUnique({ where: { username } });
    const fallback = '00000000000000000000000000000000:' + '0'.repeat(128);
    if (!verifyPassword(password, staff?.passwordHash ?? fallback) || !staff)
      fail(
        401,
        'INVALID_CREDENTIALS',
        'Username or password was not accepted.',
      );
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await this.db.session.create({
      data: { tokenHash: tokenHash(token), staffId: staff.id, expiresAt },
    });
    return {
      staff: principal(staff),
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }
  async authenticate(
    header: string | undefined,
  ): Promise<{ staff: Principal; tokenHash: string }> {
    if (serverMode() !== 'EDGE')
      fail(
        403,
        'EDGE_ONLY',
        'Staff operations are available only on the clinic server.',
      );
    if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header))
      fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const hashed = tokenHash(header.slice(7));
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashed },
      include: { staff: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now())
      fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    return { staff: principal(session.staff), tokenHash: hashed };
  }
  async logout(hash: string): Promise<{ loggedOut: true }> {
    await this.db.session.deleteMany({ where: { tokenHash: hash } });
    return { loggedOut: true };
  }
}
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    Object.assign(req, await this.auth.authenticate(req.headers.authorization));
    return true;
  }
}
