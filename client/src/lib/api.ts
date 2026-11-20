const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

// In-memory session token (fallback for cross-origin dev requests alongside HttpOnly cookie).
// Never persisted to localStorage or sessionStorage to prevent XSS token exfiltration.
let inMemorySessionToken: string | null = null;

export function getInMemoryToken(): string | null {
  return inMemorySessionToken;
}

export function setInMemoryToken(token: string | null): void {
  inMemorySessionToken = token;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly referenceId?: string;
  public readonly retryAfterSeconds?: number;
  public readonly isColdStartPossible?: boolean;

  constructor(params: {
    message: string;
    status: number;
    code?: string;
    referenceId?: string;
    retryAfterSeconds?: number;
    isColdStartPossible?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code || `HTTP_${params.status}`;
    this.referenceId = params.referenceId;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.isColdStartPossible = params.isColdStartPossible;
  }
}

const HTTP_STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: 'The submitted request contains malformed or incomplete parameters.',
  401: 'Your institutional session has expired or requires authentication.',
  403: 'Access denied. Your current role does not permit this operation.',
  404: 'The requested academic record or resource could not be found.',
  409: 'A state conflict occurred. This record has already been registered or published.',
  410: 'The requested resource is no longer available.',
  413: 'The submitted payload exceeds the maximum permitted size.',
  415: 'Unsupported media format. Requests must be encoded as JSON.',
  422: 'Validation failed. Please review the highlighted form fields.',
  429: 'Too many requests. Please wait before retrying this operation.',
  500: 'An unexpected server error occurred. Please retry or contact system administration.',
  502: 'Temporary upstream gateway error while communicating with the verification service (Render backend may be spinning up).',
  503: 'The examination registry service is temporarily unavailable or warming up.',
  504: 'The request timed out while waiting for the server to respond (Render free-tier cold start may take ~30-40 seconds).',
};

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const {
    timeoutMs = 35000, // 35s to comfortably accommodate Render free-tier cold starts
    retries = options.method && options.method !== 'GET' ? 0 : 1, // Auto-retry GET requests once on cold start
    ...fetchOptions
  } = options;

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= retries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(fetchOptions.headers || {});
    headers.set('X-Requested-With', 'MarkSure-Client');

    if (!headers.has('Content-Type') && fetchOptions.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (inMemorySessionToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
    }

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include', // Sends HttpOnly marksure_sid session cookie
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const status = response.status;
        const isColdStart = status === 502 || status === 503 || status === 504;

        // If this is a cold-start error and we have retries left, wait briefly and retry
        if (isColdStart && attempt <= retries) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        const fallbackMsg =
          HTTP_STATUS_FALLBACK_MESSAGES[status] ||
          `Request failed with HTTP status ${status}.`;

        throw new ApiError({
          message: data.error || fallbackMsg,
          status,
          code: data.code || `HTTP_${status}`,
          referenceId: data.reference_id,
          retryAfterSeconds: data.retry_after_seconds,
          isColdStartPossible: isColdStart,
        });
      }

      return data as T;
    } catch (err: any) {
      if (err instanceof ApiError) {
        throw err;
      }

      const isAbort = err?.name === 'AbortError';
      if (isAbort && attempt <= retries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      lastError = err;
      if (isAbort) {
        throw new ApiError({
          message:
            'The request timed out. If the MarkSure backend service was idle on Render, it is completing a cold start. Please click Retry in a few seconds.',
          status: 504,
          code: 'GATEWAY_TIMEOUT',
          isColdStartPossible: true,
        });
      }

      // If network disconnected or Render cold start dropped connection
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      throw new ApiError({
        message:
          'Network connection unavailable or server is waking up. Verify that the MarkSure backend is reachable.',
        status: 503,
        code: 'NETWORK_DISCONNECTED',
        isColdStartPossible: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}
