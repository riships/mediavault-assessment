import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 409, 422]);
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function delayWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function formatErrorMessage(status: number, code: string, detail?: string): string {
  if (status === 0 || code === 'offline') {
    return 'You are currently offline. Please check your network connection.';
  }
  if (status === 429) {
    return 'The server is temporarily busy. Please wait a moment before trying again.';
  }
  if (status === 503) {
    return 'The search service is temporarily warming up. Please try again shortly.';
  }
  if (status === 409) {
    return 'Version conflict: This asset was modified in another session.';
  }
  if (status === 400 && code === 'stale_cursor') {
    return 'Your search session has refreshed. Please try your search again.';
  }
  if (detail && !detail.includes('in the last 10 seconds')) {
    return detail;
  }
  return `Server request failed with status ${status}.`;
}

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex]!);
    }
  });

  await Promise.all(workers);
  return results;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // If browser is offline, reject immediately to stop hammering
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ApiError(0, 'offline', formatErrorMessage(0, 'offline'));
    }

    // Do not proceed or retry if request was aborted by caller
    if (init?.signal?.aborted) {
      throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    try {
      const res = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });

      if (res.ok) {
        return (await res.json()) as Promise<T>;
      }

      // Check structural non-retryable status codes (400, 409, 422, etc.)
      if (NON_RETRYABLE_STATUSES.has(res.status)) {
        let detail = res.statusText;
        let code = 'unknown';
        try {
          const body = await res.json();
          detail = body?.error?.message ?? detail;
          code = body?.error?.code ?? code;
        } catch {
          /* response was not JSON */
        }
        throw new ApiError(res.status, code, formatErrorMessage(res.status, code, detail));
      }

      // Check transient status codes (429, 503, etc.)
      if (TRANSIENT_STATUSES.has(res.status)) {
        const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
        if (attempt < MAX_RETRIES) {
          const jitter = Math.floor(Math.random() * 200) + 50;
          const backoff =
            retryAfterMs !== null
              ? retryAfterMs + jitter
              : Math.min(300 * Math.pow(2, attempt) + jitter, 8000);

          await delayWithSignal(backoff, init?.signal);
          continue;
        }

        // Cap reached: throw actionable ApiError
        let detail = res.statusText;
        let code = 'unknown';
        try {
          const body = await res.json();
          detail = body?.error?.message ?? detail;
          code = body?.error?.code ?? code;
        } catch {
          /* response was not JSON */
        }
        throw new ApiError(
          res.status,
          code,
          formatErrorMessage(res.status, code, detail),
          retryAfterMs ?? undefined,
        );
      }

      // Other unexpected status codes
      let detail = res.statusText;
      let code = 'unknown';
      try {
        const body = await res.json();
        detail = body?.error?.message ?? detail;
        code = body?.error?.code ?? code;
      } catch {
        /* response was not JSON */
      }
      throw new ApiError(res.status, code, formatErrorMessage(res.status, code, detail));
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError') ||
        init?.signal?.aborted
      ) {
        throw err;
      }

      if (err instanceof ApiError) {
        throw err;
      }

      // Network error (e.g. TypeError from fetch failed / offline dropped)
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new ApiError(0, 'offline', formatErrorMessage(0, 'offline'));
      }

      if (attempt < MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * 200) + 50;
        const backoff = Math.min(300 * Math.pow(2, attempt) + jitter, 8000);
        await delayWithSignal(backoff, init?.signal);
        continue;
      }

      throw new ApiError(
        0,
        'network_error',
        'Network error. Please check your connection and try again.',
      );
    }
  }

  throw new ApiError(0, 'unknown', 'Request failed after maximum retry attempts.');
}

export function listAssets(query: AssetQuery, init?: RequestInit): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, init);
}

export function getAsset(id: string, init?: RequestInit): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, init);
}

export function getAssetsByIds(ids: string[]): Promise<{ items: Asset[]; missing: string[] }> {
  return request(`/api/assets/batch?ids=${ids.join(',')}`);
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
  });
}

export async function bulkSetStatus(
  ids: string[],
  status: Asset['status'],
  concurrency = 3,
): Promise<BulkResult> {
  if (ids.length === 0) {
    return { results: [], applied: 0, failed: 0 };
  }

  const BATCH_SIZE = 50;
  if (ids.length <= BATCH_SIZE) {
    return request<BulkResult>('/api/assets/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
  }

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  const responses = await runWithConcurrency(chunks, concurrency, (batch) =>
    request<BulkResult>('/api/assets/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids: batch, status }),
    }),
  );

  return responses.reduce<BulkResult>(
    (acc, curr) => ({
      results: [...acc.results, ...curr.results],
      applied: acc.applied + curr.applied,
      failed: acc.failed + curr.failed,
    }),
    { results: [], applied: 0, failed: 0 },
  );
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
