/**
 * Brevo's transactional email API (POST /v3/smtp/email). Plain `fetch`, no SDK.
 * Errors say whether trying again could help: a 429, a 5xx or a network problem can pass, a 400 or 401
 * (bad sender, bad key, bad address) cannot, and retrying would only repeat the failure.
 */

export class BrevoError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'BrevoError';
  }
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface BrevoClient {
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
}

export interface BrevoOptions {
  apiKey: string;
  sender: { name: string; email: string };
  /** Replaced in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export function createBrevoClient(options: BrevoOptions): BrevoClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    async send(email) {
      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'api-key': options.apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender: options.sender,
            to: [{ email: email.to }],
            subject: email.subject,
            htmlContent: email.html,
            textContent: email.text,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // A timeout or a connection that never opened: nothing reached Brevo, so it is safe to retry.
        throw new BrevoError(`Could not reach Brevo: ${error instanceof Error ? error.message : String(error)}`, null, true);
      }

      let body: { messageId?: string; message?: string; code?: string } = {};
      try {
        body = (await response.json()) as typeof body;
      } catch {
        // An empty or non-JSON body; handled below.
      }

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const detail = body.message ?? body.code ?? response.statusText;
        throw new BrevoError(`Brevo answered ${response.status}: ${detail}`, response.status, retryable);
      }
      if (!body.messageId) throw new BrevoError('Brevo accepted the email but returned no message id.', response.status, false);
      return { messageId: body.messageId };
    },
  };
}
