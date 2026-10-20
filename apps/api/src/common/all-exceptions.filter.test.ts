import { BadRequestException, type ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@primestar/db';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppError } from './app-error';

function run(exception: unknown) {
  let sent: { status: number; body: Record<string, unknown> } | undefined;
  const response = {
    status: (status: number) => ({ json: (body: Record<string, unknown>) => (sent = { status, body }) }),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/x', requestId: 'req-123' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return sent!;
}

describe('AllExceptionsFilter', () => {
  it('returns AppError as { code, message, field, requestId }', () => {
    const { status, body } = run(AppError.conflict('A user with this email already exists.', 'email'));
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'CONFLICT', field: 'email', requestId: 'req-123' });
  });

  it('turns a validation failure into the first issue with its field path', () => {
    const result = z.object({ email: z.email('Enter a valid email address.') }).safeParse({ email: 'nope' });
    const { status, body } = run(new ZodValidationException(result.error!));
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Enter a valid email address.', field: 'email' });
  });

  it('maps Prisma unique and not-found errors', () => {
    const known = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });
    expect(run(known('P2002'))).toMatchObject({ status: 409, body: { code: 'CONFLICT' } });
    expect(run(known('P2025'))).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });

  it('gives rate limits and plain HTTP errors the standard shape', () => {
    expect(run(new HttpException('slow down', 429))).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } });
    expect(run(new BadRequestException('bad uuid'))).toMatchObject({ status: 400, body: { code: 'VALIDATION_FAILED', message: 'bad uuid' } });
  });

  it('never leaks the details of an unexpected error', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { status, body } = run(new Error('connection to db-prod.internal:5432 refused, password=hunter2'));
    expect(status).toBe(500);
    expect(body['code']).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toMatch(/hunter2|db-prod/);
    expect(body['requestId']).toBe('req-123');
  });
});
