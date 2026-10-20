import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@primestar/shared';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_NOT_ACTIVE: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  TOKEN_INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_VERSION: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** The one way services report an expected failure. The exception filter turns it into `{ code, message, field? }`. */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super({ code, message, field }, STATUS[code]);
  }

  /** A business rule from `packages/shared` said no. */
  static rule(message: string): AppError {
    return new AppError('BUSINESS_RULE', message);
  }

  static notFound(what: string): AppError {
    return new AppError('NOT_FOUND', `${what} not found.`);
  }

  static forbidden(message = 'You do not have permission to do that.'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static conflict(message: string, field?: string): AppError {
    return new AppError('CONFLICT', message, field);
  }
}

export const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE',
  429: 'RATE_LIMITED',
};
