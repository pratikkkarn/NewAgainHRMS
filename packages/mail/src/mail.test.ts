import { describe, expect, it, vi } from 'vitest';
import { BrevoError, createBrevoClient, type BrevoClient } from './brevo';
import { MailDrain, type DrainQueue } from './drain';
import { isReservedAddress, MAIL_QUEUE, processMailJob, runMailBatch, type MailDeps } from './processor';
import { escapeHtml, renderEmail, TemplateError } from './templates';

// ─── fakes ────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  to: string;
  template: string;
  subject: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  dedupeKey: string;
  brevoMessageId: string | null;
  attempts: number;
  error: string | null;
  sentAt: Date | null;
}

/** Just enough of `prisma.emailLog` for the processor, kept in memory. */
function fakeDb() {
  const rows = new Map<string, Row>();
  let seq = 0;
  const emailLog = {
    upsert: async ({ where, create, update }: { where: { dedupeKey: string }; create: Partial<Row>; update: Partial<Row> }) => {
      const existing = rows.get(where.dedupeKey);
      if (existing) return Object.assign(existing, update);
      const row = { id: `row-${++seq}`, subject: null, brevoMessageId: null, attempts: 0, error: null, sentAt: null, ...create } as Row;
      rows.set(row.dedupeKey, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = [...rows.values()].find((r) => r.id === where.id)!;
      return Object.assign(row, data);
    },
  };
  return { rows, prisma: { emailLog } as unknown as MailDeps['prisma'] };
}

const okBrevo = (): BrevoClient & { sent: unknown[] } => {
  const sent: unknown[] = [];
  return { sent, send: async (email) => (sent.push(email), { messageId: `<msg-${sent.length}@brevo>` }) };
};

const failingBrevo = (error: Error): BrevoClient => ({ send: async () => Promise.reject(error) });

const invite = (to = 'real.person@gmail.com', name = 'Priya Sundaram') => ({
  to,
  template: 'user-invite',
  params: { name, link: 'http://localhost:3000/?invite=abc123', expiresInDays: 7, invitedBy: 'Rajesh Sharma' },
});

// ─── templates ────────────────────────────────────────────────────────────

describe('templates', () => {
  it('renders the invite with the link in both the HTML and the plain text', () => {
    const mail = renderEmail('user-invite', invite().params);
    expect(mail.subject).toBe("You're invited to Prime Star HRMS");
    expect(mail.html).toContain('href="http://localhost:3000/?invite=abc123"');
    expect(mail.text).toContain('http://localhost:3000/?invite=abc123');
    expect(mail.text).toContain('Rajesh Sharma has invited you');
    expect(mail.text).toContain('expires in 7 days');
  });

  it('renders the reset and the email-changed notice without leftover HTML in the text', () => {
    const reset = renderEmail('password-reset', { name: 'Ana', link: 'https://app.example.org/?reset=zz', expiresInMinutes: 60 });
    expect(reset.text).toContain('expires in 60 minutes');
    const changed = renderEmail('email-changed', { name: 'Ana', newEmail: 'new@firm.com' });
    expect(changed.text).toContain('changed to new@firm.com');
    expect(changed.text).not.toMatch(/<\/?strong>/);
    expect(changed.html).toContain('<strong>new@firm.com</strong>');
  });

  it('escapes names so a person cannot put markup into an email', () => {
    const evil = '<img src=x onerror=alert(1)> "quote" & \'single\'';
    const mail = renderEmail('user-invite', { ...invite().params, name: evil, invitedBy: evil });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img');
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    // The text version is plain text, so there the characters are shown as they are.
    expect(mail.text).toContain('<img src=x onerror=alert(1)>');
  });

  it('escapes the link inside the href', () => {
    const mail = renderEmail('password-reset', { name: 'A', link: 'https://x.test/?a=1&b="2"', expiresInMinutes: 5 });
    // The quotes become &quot;, so the link cannot close the href attribute and add its own.
    expect(mail.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
    expect(mail.html).not.toContain('b="2"');
  });

  it('refuses unknown templates, missing parameters and non-web links', () => {
    expect(() => renderEmail('nope', {})).toThrow(TemplateError);
    expect(() => renderEmail('user-invite', { name: 'A' })).toThrow(/bad parameters/);
    expect(() => renderEmail('user-invite', { ...invite().params, link: 'javascript:alert(1)' })).toThrow(TemplateError);
    expect(() => renderEmail('user-invite', { ...invite().params, link: 'ftp://host/file' })).toThrow(/http/);
  });

  it('keeps the subject on one line', () => {
    expect(renderEmail('user-invite', invite().params).subject).not.toMatch(/[\r\n]/);
  });
});

// ─── Brevo client ─────────────────────────────────────────────────────────

describe('Brevo client', () => {
  const make = (fetchImpl: typeof fetch) => createBrevoClient({ apiKey: 'k', sender: { name: 'PS', email: 'ps@x.com' }, fetchImpl });
  const reply = (status: number, body: object) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const message = { to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' };

  it('sends the sender, recipient, subject and both bodies with the API key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = make((async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(JSON.stringify({ messageId: '<m1>' }), { status: 201 }))) as unknown as typeof fetch);
    expect(await client.send(message)).toEqual({ messageId: '<m1>' });
    expect(calls[0]!.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((calls[0]!.init.headers as Record<string, string>)['api-key']).toBe('k');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      sender: { name: 'PS', email: 'ps@x.com' },
      to: [{ email: 'a@b.com' }],
      subject: 's',
      htmlContent: '<p>h</p>',
      textContent: 't',
    });
  });

  it('treats 429, 5xx and a dead connection as worth retrying', async () => {
    for (const status of [408, 429, 500, 503]) {
      await expect(make(reply(status, { message: 'busy' })).send(message)).rejects.toMatchObject({ retryable: true, status });
    }
    const down = make((async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch);
    await expect(down.send(message)).rejects.toMatchObject({ retryable: true, status: null });
  });

  it('treats a bad address, sender or key as final, and explains why', async () => {
    for (const status of [400, 401, 403]) {
      await expect(make(reply(status, { message: 'sender not valid' })).send(message)).rejects.toMatchObject({ retryable: false, status });
    }
    await expect(make(reply(400, { message: 'sender not valid' })).send(message)).rejects.toThrow(/400: sender not valid/);
  });

  it('refuses an "ok" answer with no message id', async () => {
    await expect(make(reply(201, {})).send(message)).rejects.toMatchObject({ retryable: false });
  });
});

// ─── one job ──────────────────────────────────────────────────────────────

describe('processMailJob', () => {
  it('sends the email and records the message id', async () => {
    const { rows, prisma } = fakeDb();
    const brevo = okBrevo();
    expect(await processMailJob({ prisma, brevo }, { id: 'j1', data: invite() })).toBe('sent');
    expect(brevo.sent).toHaveLength(1);
    expect(rows.get('j1')).toMatchObject({ status: 'SENT', brevoMessageId: '<msg-1@brevo>', attempts: 1, error: null });
    expect(rows.get('j1')!.sentAt).toBeInstanceOf(Date);
  });

  it('never sends the same job twice, even when it is run again', async () => {
    const { prisma } = fakeDb();
    const brevo = okBrevo();
    await processMailJob({ prisma, brevo }, { id: 'j1', data: invite() });
    expect(await processMailJob({ prisma, brevo }, { id: 'j1', data: invite() })).toBe('sent');
    expect(brevo.sent).toHaveLength(1);
  });

  it('skips test addresses instead of bouncing real mail off them', async () => {
    expect(isReservedAddress('hr.head@primestar.test')).toBe(true);
    expect(isReservedAddress('a@example.com')).toBe(true);
    expect(isReservedAddress('a@mail.example.org')).toBe(true);
    expect(isReservedAddress('someone@gmail.com')).toBe(false);
    expect(isReservedAddress('x@contest.com')).toBe(false);

    const { rows, prisma } = fakeDb();
    const brevo = okBrevo();
    expect(await processMailJob({ prisma, brevo }, { id: 'j1', data: invite('hr.head@primestar.test') })).toBe('skipped');
    expect(brevo.sent).toHaveLength(0);
    expect(rows.get('j1')).toMatchObject({ status: 'SKIPPED' });
    expect(rows.get('j1')!.error).toMatch(/reserved/);
  });

  it('skips, and says so, when no Brevo key is set', async () => {
    const { rows, prisma } = fakeDb();
    expect(await processMailJob({ prisma, brevo: null }, { id: 'j1', data: invite() })).toBe('skipped');
    expect(rows.get('j1')!.error).toMatch(/No Brevo API key/);
  });

  it('retries a failure that could pass, and counts the attempts', async () => {
    const { rows, prisma } = fakeDb();
    const deps = { prisma, brevo: failingBrevo(new BrevoError('Brevo answered 503: busy', 503, true)) };
    expect(await processMailJob(deps, { id: 'j1', data: invite() })).toBe('retry');
    expect(rows.get('j1')).toMatchObject({ status: 'QUEUED', attempts: 1 });
    expect(await processMailJob(deps, { id: 'j1', data: invite() })).toBe('retry');
    expect(rows.get('j1')!.attempts).toBe(2);
  });

  it('gives up after the last attempt and records why', async () => {
    const { rows, prisma } = fakeDb();
    const deps = { prisma, brevo: failingBrevo(new BrevoError('Brevo answered 503: busy', 503, true)), maxAttempts: 2 };
    await processMailJob(deps, { id: 'j1', data: invite() });
    expect(await processMailJob(deps, { id: 'j1', data: invite() })).toBe('failed');
    expect(rows.get('j1')).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(rows.get('j1')!.error).toMatch(/503/);
  });

  it('fails at once, without retrying, on an address or sender Brevo refuses', async () => {
    const { rows, prisma } = fakeDb();
    const deps = { prisma, brevo: failingBrevo(new BrevoError('Brevo answered 400: sender not valid', 400, false)) };
    expect(await processMailJob(deps, { id: 'j1', data: invite() })).toBe('failed');
    expect(rows.get('j1')).toMatchObject({ status: 'FAILED', attempts: 1 });
    // A finally-failed job is not tried again, even if the queue hands it over once more.
    const brevo = okBrevo();
    expect(await processMailJob({ prisma, brevo }, { id: 'j1', data: invite() })).toBe('failed');
    expect(brevo.sent).toHaveLength(0);
  });

  it('records a bad template as failed without calling Brevo', async () => {
    const { rows, prisma } = fakeDb();
    const brevo = okBrevo();
    const job = { id: 'j1', data: { to: 'a@b.com', template: 'nope', params: {} } };
    expect(await processMailJob({ prisma, brevo }, job)).toBe('failed');
    expect(rows.get('j1')!.error).toMatch(/Unknown email template/);
    expect(brevo.sent).toHaveLength(0);
  });

  it('refuses a payload that is not a mail job', async () => {
    const { rows, prisma } = fakeDb();
    expect(await processMailJob({ prisma, brevo: okBrevo() }, { id: 'j1', data: { to: 'not-an-email' } })).toBe('failed');
    expect(rows.size).toBe(0);
  });
});

// ─── a batch ──────────────────────────────────────────────────────────────

function fakeQueue() {
  const completed: string[] = [];
  const failed: string[] = [];
  return {
    completed,
    failed,
    complete: async (_name: string, ids: string[]) => void completed.push(...ids),
    fail: async (_name: string, id: string) => void failed.push(id),
  };
}

describe('runMailBatch', () => {
  it('settles each job on its own: one bad address does not fail the rest', async () => {
    const { prisma } = fakeDb();
    const queue = fakeQueue();
    const brevo: BrevoClient = {
      send: async (email) => {
        if (email.to === 'bad@nowhere.com') throw new BrevoError('Brevo answered 400: invalid address', 400, false);
        if (email.to === 'slow@gmail.com') throw new BrevoError('Brevo answered 503: busy', 503, true);
        return { messageId: '<ok>' };
      },
    };
    const jobs = [
      { id: 'a', data: invite('one@gmail.com') },
      { id: 'b', data: invite('bad@nowhere.com') },
      { id: 'c', data: invite('slow@gmail.com') },
      { id: 'd', data: invite('hr@primestar.test') },
      { id: 'e', data: invite('two@gmail.com') },
    ];
    const result = await runMailBatch({ prisma, brevo }, queue, jobs);
    expect(result).toEqual({ sent: 2, skipped: 1, failed: 1, retried: 1 });
    // Finished jobs (sent, skipped, finally failed) are completed; only the retryable one is failed for another try.
    expect(queue.completed.sort()).toEqual(['a', 'b', 'd', 'e']);
    expect(queue.failed).toEqual(['c']);
  });

  it('sends in parallel but never more than the limit at once', async () => {
    const { prisma } = fakeDb();
    let active = 0;
    let peak = 0;
    const brevo: BrevoClient = {
      send: async () => {
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active--;
        return { messageId: '<ok>' };
      },
    };
    const jobs = Array.from({ length: 12 }, (_, i) => ({ id: `j${i}`, data: invite(`p${i}@gmail.com`) }));
    const result = await runMailBatch({ prisma, brevo }, fakeQueue(), jobs, 5);
    expect(result.sent).toBe(12);
    expect(peak).toBe(5);
  });

  it('retries a job when something unexpected happens, such as the database being down', async () => {
    const queue = fakeQueue();
    const prisma = { emailLog: { upsert: async () => Promise.reject(new Error('connection refused')) } } as unknown as MailDeps['prisma'];
    const result = await runMailBatch({ prisma, brevo: okBrevo() }, queue, [{ id: 'a', data: invite() }]);
    expect(result.retried).toBe(1);
    expect(queue.failed).toEqual(['a']);
  });

  it('handles an empty batch', async () => {
    expect(await runMailBatch({ prisma: fakeDb().prisma, brevo: okBrevo() }, fakeQueue(), [])).toEqual({ sent: 0, skipped: 0, failed: 0, retried: 0 });
  });
});

// ─── the drain ────────────────────────────────────────────────────────────

function fakeDrainQueue(initial: { id: string; data: unknown }[]) {
  const waiting = [...initial];
  /** Jobs failed for a retry sit here until their retry delay has passed, as in pg-boss. */
  const delayed: { id: string; data: unknown }[] = [];
  const base = fakeQueue();
  const queue: DrainQueue & { completed: string[]; failed: string[]; fetches: number } = {
    ...base,
    fetches: 0,
    fetch: async (_name, { batchSize }) => {
      queue.fetches++;
      return waiting.splice(0, batchSize);
    },
    getQueueSize: async () => waiting.length + delayed.length,
  };
  return { queue, waiting, delayed };
}

describe('MailDrain', () => {
  it('works through the whole queue in batches, then stops', async () => {
    const { prisma } = fakeDb();
    const jobs = Array.from({ length: 25 }, (_, i) => ({ id: `j${i}`, data: invite(`p${i}@gmail.com`) }));
    const { queue } = fakeDrainQueue(jobs);
    const drain = new MailDrain({ queue, deps: { prisma, brevo: okBrevo() }, batchSize: 10 });
    await drain.drain();
    expect(queue.completed).toHaveLength(25);
    expect(queue.fetches).toBe(4); // 10 + 10 + 5, then one empty fetch
    drain.stop();
  });

  it('does nothing, and costs one fetch, when the queue is empty', async () => {
    const { queue } = fakeDrainQueue([]);
    const drain = new MailDrain({ queue, deps: { prisma: fakeDb().prisma, brevo: okBrevo() } });
    await drain.drain();
    expect(queue.fetches).toBe(1);
    drain.stop();
  });

  it('picks up work queued while it was running', async () => {
    const { prisma } = fakeDb();
    const { queue, waiting } = fakeDrainQueue([{ id: 'first', data: invite('a@gmail.com') }]);
    const slowBrevo: BrevoClient = {
      send: async () => {
        // A new email arrives while the first one is being sent.
        if (waiting.length === 0 && queue.completed.length === 0) waiting.push({ id: 'late', data: invite('b@gmail.com') });
        return { messageId: '<ok>' };
      },
    };
    const drain = new MailDrain({ queue, deps: { prisma, brevo: slowBrevo } });
    const run = drain.drain();
    await drain.drain(); // a second kick while the first run is busy only asks it to look again
    await run;
    expect(queue.completed.sort()).toEqual(['first', 'late']);
    drain.stop();
  });

  it('comes back for jobs that are waiting for a retry, and stops once they are done', async () => {
    vi.useFakeTimers();
    try {
      const { prisma } = fakeDb();
      let flaky = true;
      const brevo: BrevoClient = {
        send: async () => {
          if (flaky) throw new BrevoError('Brevo answered 503: busy', 503, true);
          return { messageId: '<ok>' };
        },
      };
      const { queue, waiting, delayed } = fakeDrainQueue([{ id: 'a', data: invite() }]);
      // A failed job goes back to the queue, but only after its retry delay, as in pg-boss.
      queue.fail = async (_name, id) => void delayed.push({ id, data: invite() });
      const drain = new MailDrain({ queue, deps: { prisma, brevo }, retryCheckMs: 1000 });

      await drain.drain();
      expect(queue.completed).toEqual([]);
      expect(delayed).toHaveLength(1);
      flaky = false;
      await vi.advanceTimersByTimeAsync(500);
      waiting.push(...delayed.splice(0)); // the retry delay has now passed
      await vi.advanceTimersByTimeAsync(600);
      expect(queue.completed).toEqual(['a']);
      const fetchesAfter = queue.fetches;
      await vi.advanceTimersByTimeAsync(5000);
      expect(queue.fetches).toBe(fetchesAfter); // nothing waiting, so no more checks
      drain.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops for good when asked', async () => {
    const { queue } = fakeDrainQueue([{ id: 'a', data: invite() }]);
    const drain = new MailDrain({ queue, deps: { prisma: fakeDb().prisma, brevo: okBrevo() } });
    drain.stop();
    await drain.drain();
    expect(queue.fetches).toBe(0);
  });

  it('uses the mail queue name', () => {
    expect(MAIL_QUEUE).toBe('mail.send');
  });
});
