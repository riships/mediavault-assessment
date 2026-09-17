import { useCallback, useEffect, useRef, useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { ErrorBoundary } from '@/lib/ErrorBoundary';
import { statusLabel, statusSymbol } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

/**
 * Parse URL search parameters on initial load to restore view state.
 */
function getInitialUrlParams() {
  if (typeof window === 'undefined') {
    return {
      q: '',
      status: [] as AssetStatus[],
      sort: 'updatedAt:desc' as NonNullable<AssetQuery['sort']>,
    };
  }
  const sp = new URLSearchParams(window.location.search);
  const q = sp.get('q') ?? '';
  const rawStatuses = sp.getAll('status').flatMap((s) => s.split(',')).filter(Boolean);
  const validStatuses = rawStatuses.filter((s): s is AssetStatus =>
    STATUSES.includes(s as AssetStatus),
  );
  const sortParam = sp.get('sort') as NonNullable<AssetQuery['sort']>;
  const validSort = SORTS.some((s) => s.value === sortParam) ? sortParam : 'updatedAt:desc';
  return { q, status: validStatuses, sort: validSort };
}

export function App() {
  const initialParams = useRef(getInitialUrlParams()).current;
  const [searchInput, setSearchInput] = useState(initialParams.q);
  const debouncedQ = useDebounce(searchInput, 300);
  const [status, setStatus] = useState<AssetStatus[]>(initialParams.status);
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>(initialParams.sort);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryableConflicts, setRetryableConflicts] = useState<{
    ids: string[];
    status: AssetStatus;
  } | null>(null);

  const anchorIdRef = useRef<string | null>(null);
  const baseSelectionRef = useRef<Set<string>>(new Set());
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(false);

  // 300ms debounce buffer prevents keystroke flooding and rate limit exhaustion
  const {
    items,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload,
    error,
    applyOptimisticStatus,
    updateAssetInList,
  } = useAssets({
    q: debouncedQ.trim() || undefined,
    status,
    sort,
    limit: 48,
  });

  // Reset range anchor and base selection when query, status, or sorting changes
  useEffect(() => {
    anchorIdRef.current = null;
    baseSelectionRef.current = new Set();
  }, [debouncedQ, status, sort]);

  // Track transition from offline to online and notify user of sync
  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      setNotice('Connection restored. Latest assets loaded.');
      wasOfflineRef.current = false;
    } else if (!isOnline) {
      wasOfflineRef.current = true;
    }
  }, [isOnline]);

  // Synchronize state to URL using replaceState (avoids creating 1 history entry per keystroke)
  useEffect(() => {
    const sp = new URLSearchParams();
    if (debouncedQ.trim()) sp.set('q', debouncedQ.trim());
    if (status.length > 0) sp.set('status', status.join(','));
    if (sort !== 'updatedAt:desc') sp.set('sort', sort);

    const queryStr = sp.toString();
    const targetUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
    const currentSearch = window.location.search ? window.location.search.slice(1) : '';
    if (currentSearch !== queryStr) {
      window.history.replaceState(null, '', targetUrl);
    }
  }, [debouncedQ, status, sort]);

  // Support browser Back/Forward buttons via popstate
  useEffect(() => {
    const handlePopState = () => {
      const { q, status: newStatus, sort: newSort } = getInitialUrlParams();
      setSearchInput(q);
      setStatus(newStatus);
      setSort(newSort);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handler for opening an asset detail panel; also sets range anchor
  const handleOpenAsset = useCallback((id: string) => {
    setActiveId(id);
    anchorIdRef.current = id;
  }, []);

  // Range selection (click and Shift+Click) with anchor retention and range expansion/contraction
  const toggleSelect = useCallback(
    (id: string, shiftKey?: boolean) => {
      setSelectedIds((prev) => {
        const currentIdx = items.findIndex((a) => a.id === id);
        if (currentIdx === -1) return prev;

        // Clear accidental browser text selection during rapid shift-clicks
        if (shiftKey && window.getSelection) {
          window.getSelection()?.removeAllRanges();
        }

        // Determine effective anchor: explicitly stored anchor -> active asset -> first selected asset in items
        const rawAnchor = anchorIdRef.current ?? activeId;
        const anchorIdx = rawAnchor ? items.findIndex((a) => a.id === rawAnchor) : -1;

        if (shiftKey && anchorIdx !== -1) {
          // Range selection: start from base snapshot (before shift was pressed) and add range
          const next = new Set(baseSelectionRef.current);
          const start = Math.min(anchorIdx, currentIdx);
          const end = Math.max(anchorIdx, currentIdx);
          for (let i = start; i <= end; i++) {
            const item = items[i];
            if (item) next.add(item.id);
          }
          // Preserve the original anchor pivot so subsequent Shift+Clicks expand/contract correctly
          return next;
        }

        // Regular click/toggle: toggle target item, establish it as the new pivot anchor
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        anchorIdRef.current = id;
        baseSelectionRef.current = new Set(next);
        return next;
      });
    },
    [items, activeId],
  );

  const selectAllLoaded = useCallback(() => {
    setSelectedIds(new Set(items.map((a) => a.id)));
    baseSelectionRef.current = new Set(items.map((a) => a.id));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    baseSelectionRef.current = new Set();
    anchorIdRef.current = null;
  }, []);

  // Optimistic bulk update with selective rollback on 207 Multi-Status
  async function applyBulkStatus(next: AssetStatus, targetIds?: string[]) {
    if (!isOnline) {
      setNotice('You are currently offline. Changes cannot be saved until connection returns.');
      return;
    }
    const ids = targetIds ?? [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    setRetryableConflicts(null);

    // Optimistically update grid state and obtain selective rollback callback
    const rollback = applyOptimisticStatus(ids, next);
    setSelectedIds(new Set());
    baseSelectionRef.current = new Set();
    anchorIdRef.current = null;

    try {
      // Chunked in client.ts (<= 50 IDs per request) with bounded concurrency = 3
      const result = await bulkSetStatus(ids, next, 3);
      const failed = result.results.filter((r) => !r.ok);

      if (failed.length > 0) {
        // Roll back ONLY the failed IDs; keep the successful updates
        const failedIds = failed.map((r) => r.id);
        rollback(failedIds);

        const legalHolds = failed.filter((r) => r.code === 'legal_hold').length;
        const conflicts = failed.filter((r) => r.code === 'conflict');

        const reasons: string[] = [];
        if (legalHolds > 0) reasons.push(`${legalHolds} on legal hold (cannot be modified)`);
        if (conflicts.length > 0) reasons.push(`${conflicts.length} write conflict(s)`);

        setNotice(
          `${result.applied} updated. ${failed.length} failed (${reasons.join(', ')}).`,
        );

        // Offer 1-click retry for recoverable conflicts (legal holds will never succeed on retry)
        if (conflicts.length > 0) {
          setRetryableConflicts({
            ids: conflicts.map((r) => r.id),
            status: next,
          });
        }
      } else {
        setNotice(`All ${result.applied} assets successfully updated to ${statusLabel(next).toLowerCase()}.`);
      }
    } catch (err) {
      // Outright network failure: rollback all
      rollback(ids);
      setNotice(err instanceof Error ? err.message : 'Bulk update failed');
    }
  }

  function toggleStatusFilter(value: AssetStatus) {
    setStatus((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }

  return (
    <div className="app">
      {!isOnline && (
        <aside className="offline-banner" role="status" aria-live="assertive">
          <svg
            className="offline-banner__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>You are currently offline. Changes cannot be saved until connection is restored.</span>
        </aside>
      )}
      <header className="topbar">
        <div className="topbar__brand">
          <div className="topbar__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div className="topbar__titles">
            <h1 className="topbar__title">MediaVault</h1>
            <span className="topbar__count">
              {loading && items.length === 0 ? 'Loading…' : `${total.toLocaleString()} assets`}
            </span>
          </div>
        </div>

        <div className="search-bar">
          <svg
            className="search-bar__icon"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="12.5" y1="12.5" x2="17" y2="17" />
          </svg>
          <input
            type="search"
            className="search-bar__input"
            placeholder="Search by name, tag, kind…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="search-bar__clear"
              aria-label="Clear search text"
              onClick={() => setSearchInput('')}
            >
              ×
            </button>
          )}
        </div>

        <div className="topbar__controls">
          <div className="status-pills" role="toolbar" aria-label="Filter by status">
            {STATUSES.map((s) => {
              const isActive = status.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  className={`filter-pill filter-pill--${s}${isActive ? ' is-active' : ''}`}
                  onClick={() => toggleStatusFilter(s)}
                  aria-pressed={isActive}
                >
                  <span className="filter-pill__symbol">{statusSymbol(s)}</span>
                  <span>{statusLabel(s)}</span>
                </button>
              );
            })}
          </div>

          <div className="sort-wrapper">
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as NonNullable<AssetQuery['sort']>)}
              aria-label="Sort assets"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {selectedIds.size > 0 && (
        <aside className="bulk-bar" role="region" aria-label="Bulk actions">
          <div className="bulk-bar__info">
            <span className="bulk-bar__badge">{selectedIds.size}</span>
            <span className="bulk-bar__label">
              {selectedIds.size === 1 ? 'asset selected' : 'assets selected'}
            </span>
            <button
              type="button"
              className="bulk-btn bulk-btn--select-all"
              onClick={selectAllLoaded}
            >
              Select all loaded ({items.length})
            </button>
          </div>

          <div className="bulk-bar__actions">
            <span className="bulk-bar__actions-hint">Mark as:</span>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`bulk-btn bulk-btn--${s}`}
                onClick={() => applyBulkStatus(s)}
              >
                <span className="bulk-btn__symbol">{statusSymbol(s)}</span>
                <span>{statusLabel(s)}</span>
              </button>
            ))}
            <div className="bulk-bar__divider" aria-hidden="true" />
            <button
              type="button"
              className="bulk-btn bulk-btn--clear"
              onClick={clearSelection}
            >
              Clear selection
            </button>
          </div>
        </aside>
      )}

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          {retryableConflicts && (
            <button
              type="button"
              className="notice__retry-btn"
              onClick={() =>
                applyBulkStatus(retryableConflicts.status, retryableConflicts.ids)
              }
            >
              Retry {retryableConflicts.ids.length} conflict(s)
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      <main className="content">
        <ErrorBoundary
          className="error-boundary--contained"
          title="Grid failed to render"
        >
          <AssetGrid
            assets={items}
            selectedIds={selectedIds}
            activeId={activeId}
            loading={loading}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onToggleSelect={toggleSelect}
            onOpen={handleOpenAsset}
          />
        </ErrorBoundary>

        {activeId && (
          <ErrorBoundary
            resetKeys={[activeId]}
            onReset={() => setActiveId(null)}
            fallback={(err, reset) => (
              <aside className="panel" role="dialog" aria-label="Asset detail error" aria-modal="true">
                <div className="panel__head">
                  <h2>Asset detail</h2>
                  <button type="button" onClick={() => setActiveId(null)} aria-label="Close detail panel">
                    Close
                  </button>
                </div>
                <div className="panel__body" style={{ padding: '24px' }}>
                  <p className="error" role="alert">
                    Failed to display asset details: {err.message || 'Unexpected error'}
                  </p>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={reset}>
                      Try again
                    </button>
                    <button type="button" onClick={() => setActiveId(null)}>
                      Close panel
                    </button>
                  </div>
                </div>
              </aside>
            )}
          >
            <AssetDetail
              id={activeId}
              onClose={() => setActiveId(null)}
              onSaved={(updated: Asset) => {
                setActiveId(updated.id);
                updateAssetInList(updated);
              }}
            />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
