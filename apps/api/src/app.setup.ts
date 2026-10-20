import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { requestId } from './common/request-id';

/**
 * Everything between the network and the Nest modules. Used by `main.ts` and by the integration
 * tests, so the tests run exactly the setup that production runs.
 */
export function configureApp(app: NestExpressApplication, trustProxyHops: number): void {
  // Vercel rewrites /api/* to this service, so the browser sees one origin and no CORS is needed.
  app.setGlobalPrefix('api');
  // Proxies sit in front of the API, so the real client IP (for rate limits and logs) is in X-Forwarded-For.
  app.set('trust proxy', trustProxyHops);
  app.use(requestId);
  // Tokens and one-time links must never be cached by a browser or proxy.
  app.use('/api/auth', (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(helmet());
  app.use(cookieParser());
}
