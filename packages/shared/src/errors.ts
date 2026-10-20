import { z } from 'zod';

/**
 * One error shape for the whole API, so the frontend can show the message next to a field
 * and branch on the code.
 */
export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_NOT_ACTIVE',
  'PASSWORD_CHANGE_REQUIRED',
  'TOKEN_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'STALE_VERSION',
  'BUSINESS_RULE',
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  field: z.string().optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
