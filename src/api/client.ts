import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    let code = 'unknown';
    try {
      const body = await res.json();
      detail = body?.error?.message ?? detail;
      code = body?.error?.code ?? code;
    } catch {
      /* response was not JSON */
    }
    throw new ApiError(res.status, code, `${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function listAssets(query: AssetQuery, init?: RequestInit): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, init);
}

export function getAsset(id: string): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`);
}

export function getAssetsByIds(ids: string[]): Promise<{ items: Asset[]; missing: string[] }> {
  // Note: the endpoint rejects more than 25 ids per call.
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
