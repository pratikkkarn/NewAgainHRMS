// The one place that talks to the backend. Everything else calls `api()`.
//
// Login uses Bearer tokens for now: the access token (15 minutes) lives in memory, and the refresh token
// (7 days) in localStorage so a page reload keeps you signed in. When the project has a custom domain the
// tokens move to httpOnly cookies; only this file and the login response change.

/** `VITE_USE_API=true` runs against the backend API. Default is mock sample data. */
export const USE_API = import.meta.env.VITE_USE_API === 'true';

const BASE = '/api';
const REFRESH_KEY = 'primestar_refresh_token';

/** The standard error body every API failure has: `{ code, message, field?, requestId }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let accessToken: string | null = null;
let sessionLostHandler: (() => void) | null = null;
let refreshInFlight: Promise<LoginPayload | null> | null = null;

/** Payload of login, accept-invite and refresh. `user` is the signed-in person with their permissions. */
export interface LoginPayload extends TokenPair {
  user: unknown;
}

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null; // storage can be blocked (private window); the session then lasts until the page closes
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

export function setTokens(tokens: TokenPair): void {
  accessToken = tokens.accessToken;
  writeRefreshToken(tokens.refreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  writeRefreshToken(null);
}

export const hasStoredSession = (): boolean => readRefreshToken() !== null;

/** Called when a refresh fails, meaning the user has to sign in again. */
export function onSessionLost(handler: (() => void) | null): void {
  sessionLostHandler = handler;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Send no token and never try to refresh (login, forgot password, links). */
  anonymous?: boolean;
  /** Use this token instead of the stored one, without any refresh (for clean-up after accepting an invite). */
  token?: string;
}

async function send<T>(method: string, path: string, options: RequestOptions, token: string | null): Promise<T> {
  const query = options.query
    ? '?' +
      Object.entries(options.query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    : '';

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}${query}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body; handled below.
  }
  if (!response.ok) {
    const body = (payload ?? {}) as { code?: string; message?: string; field?: string; requestId?: string };
    throw new ApiRequestError(
      response.status,
      body.code ?? 'INTERNAL',
      body.message ?? 'Something went wrong. Please try again.',
      body.field,
      body.requestId,
    );
  }
  return payload as T;
}

async function doRefresh(): Promise<LoginPayload | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  try {
    const result = await send<LoginPayload>('POST', '/auth/refresh', { body: { refreshToken } }, null);
    setTokens(result);
    return result;
  } catch (error) {
    // Only a refusal means the session is over; a network blip should not sign anyone out.
    if (error instanceof ApiRequestError && error.status !== 0 && error.status < 500) clearTokens();
    return null;
  }
}

/**
 * Swaps the stored refresh token for a new pair. Shared by everything that needs it at the same moment, so
 * five parallel requests that all hit an expired token cause one refresh, not five. Another tab may have
 * rotated the token meanwhile, so it is read from storage every time. Returns null if the session is gone.
 */
export function refreshSession(): Promise<LoginPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function api<T = void>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
  if (options.anonymous || options.token) return send<T>(method, path, options, options.token ?? null);

  try {
    return await send<T>(method, path, options, accessToken);
  } catch (error) {
    const expired = error instanceof ApiRequestError && error.status === 401 && error.code === 'UNAUTHENTICATED';
    if (!expired) throw error;
    // The access token ran out: refresh once and retry once.
    const refreshed = await refreshSession();
    if (!refreshed) {
      accessToken = null;
      sessionLostHandler?.();
      throw error;
    }
    return send<T>(method, path, options, accessToken);
  }
}
