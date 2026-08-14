export type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function requestV2<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);
  const envelope = isRecord(body) ? body : null;
  const message =
    envelope && typeof envelope.message === 'string'
      ? envelope.message
      : `Yêu cầu thất bại (${response.status})`;

  if (!response.ok || envelope?.success === false) throw new Error(message);

  if (envelope && 'data' in envelope && envelope.data !== undefined) {
    return envelope.data as T;
  }

  if (body === null) throw new Error('Máy chủ không trả về dữ liệu hợp lệ.');
  return body as T;
}

export function newIdempotencyKey(prefix: string) {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export type PendingIdempotencyRequest = {
  fingerprint: string;
  key: string;
} | null;

/**
 * Reuses one key for an unchanged payload across lost responses/retries and
 * rotates when the user materially edits that operation.
 */
export function pendingIdempotencyKey(
  ref: { current: PendingIdempotencyRequest },
  prefix: string,
  payload: unknown,
) {
  const fingerprint = JSON.stringify([prefix, payload]);
  if (ref.current?.fingerprint !== fingerprint) {
    ref.current = { fingerprint, key: newIdempotencyKey(prefix) };
  }
  return ref.current.key;
}

export function businessDateToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function localDateTimeInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
