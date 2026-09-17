/**
 * In-memory cache of asset IDs whose thumbnails returned 404 or failed to load.
 * Prevents virtualized grids from repeatedly re-requesting failed images
 * as cards mount and unmount during scroll.
 */
const failedThumbnailIds = new Set<string>();

export function markThumbnailFailed(id: string): void {
  failedThumbnailIds.add(id);
}

export function isThumbnailFailed(id: string): boolean {
  return failedThumbnailIds.has(id);
}

export function clearThumbnailCache(): void {
  failedThumbnailIds.clear();
}
