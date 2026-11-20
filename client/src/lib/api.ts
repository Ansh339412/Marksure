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

  constructor(params: {
    message: string;
    status: number;
    code?: string;
    referenceId?: string;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code || `HTTP_${params.status}`;
    this.referenceId = params.referenceId;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

const HTTP_STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: 'The submitted request contains malformed or incomplete parameters.',
  401: 'Your institutional session has expired or requires authentication.',
  403: 'Access denied. Your current role does not permit this operation.',
  404: 'The requested academic record or resource could not be found.',
  409: 'A state conflict occurred. This record has already been published or modified.',
  410: 'The requested resource is no longer available.',
  413: 'The submitted payload exceeds the maximum permitted size.',
  415: 'Unsupported media format. Requests must be encoded as JSON.',
  422: 'Validation failed. Please review the highlighted form fields.',
  429: 'Too many requests. Please wait before retrying this operation.',
  500: 'An unexpected server error occurred. Please retry or contact system administration.',
  502: 'Temporary upstream gateway error while communicating with the verification service.',
  503: 'The examination registry service is temporarily unavailable.',
  504: 'The request timed out while waiting for the server to respond.',
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 15000, ...fetchOptions } = options;
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
      const fallbackMsg =
        HTTP_STATUS_FALLBACK_MESSAGES[status] ||
        `Request failed with HTTP status ${status}.`;

      throw new ApiError({
        message: data.error || fallbackMsg,
        status,
        code: data.code || `HTTP_${status}`,
        referenceId: data.reference_id,
        retryAfterSeconds: data.retry_after_seconds,
      });
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err?.name === 'AbortError') {
      throw new ApiError({
        message: HTTP_STATUS_FALLBACK_MESSAGES[504],
        status: 504,
        code: 'GATEWAY_TIMEOUT',
      });
    }
    throw new ApiError({
      message:
        'Network connection unavailable. Verify that the MarkSure examination service is reachable.',
      status: 503,
      code: 'NETWORK_DISCONNECTED',
    });
  } finally {
    clearTimeout(timer);
  }
}
