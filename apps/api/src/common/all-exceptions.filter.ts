import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@primestar/db';
import type { ApiError } from '@primestar/shared';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { AppError, STATUS_TO_CODE } from './app-error';

interface ZodIssueLike {
  path: (string | number)[];
  message: string;
}

/**
 * Every error leaves the API as `{ code, message, field?, requestId }`.
 * Unexpected errors are logged with their stack and returned as a generic message,
 * so internals never reach the browser.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const { status, body } = this.toResponse(exception, request);
    response.status(status).json({ ...body, requestId: request.requestId });
  }

  private toResponse(exception: unknown, request: Request): { status: number; body: Omit<ApiError, 'requestId'> } {
    if (exception instanceof AppError) {
      return { status: exception.getStatus(), body: { code: exception.code, message: exception.message, field: exception.field } };
    }

    if (exception instanceof ZodValidationException) {
      const issues = ((exception.getZodError() as { issues?: ZodIssueLike[] }).issues ?? []) as ZodIssueLike[];
      const first = issues[0];
      return {
        status: 400,
        body: {
          code: 'VALIDATION_FAILED',
          message: first?.message ?? 'The request is not valid.',
          field: first?.path.length ? first.path.join('.') : undefined,
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { status: 409, body: { code: 'CONFLICT', message: 'That value is already in use.' } };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { code: 'NOT_FOUND', message: 'Record not found.' } };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status] ?? 'INTERNAL';
      const message =
        status === 429 ? 'Too many requests. Try again shortly.' : status === 404 ? 'Not found.' : this.messageOf(exception);
      return { status, body: { code, message } };
    }

    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return { status: 500, body: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } };
  }

  private messageOf(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: string | string[] }).message;
    return Array.isArray(message) ? (message[0] ?? exception.message) : (message ?? exception.message);
  }
}
