import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Gives every request an ID that appears in the response header, the error body and the logs. */
export function requestId(request: Request & { requestId?: string }, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  // Only trust a short, plain incoming ID, so it can't be used to forge log lines.
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  request.requestId = id;
  response.setHeader('x-request-id', id);
  next();
}
