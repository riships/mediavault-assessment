import { useCallback, useEffect, useRef, useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { statusLabel, statusSymbol } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
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

  // 300ms debounce buffer prevents keystroke flooding and rate limit exhaustion
  const { items, total, loading, loadingMore, hasMore, loadMore, error } = useAssets({
    q: debouncedQ.trim() || undefined,
    status,
    sort,
    limit: 48,
  });

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  async function applyBulkStatus(next: AssetStatus) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setNotice(null);
    try {
      // Batch chunked in client.ts (<= 50 IDs per request) to comply with server limits.
      const result = await bulkSetStatus(ids, next);
      setNotice(`${result.applied} updated, ${result.failed} failed.`);
      setSelectedIds(new Set());
    } catch (err) {
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
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
          </div>
        </aside>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          activeId={activeId}
          loading={loading}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onToggleSelect={toggleSelect}
          onOpen={setActiveId}
        />

        {activeId && (
          <AssetDetail
            id={activeId}
            onClose={() => setActiveId(null)}
            onSaved={(updated: Asset) => {
              setActiveId(updated.id);
            }}
          />
        )}
      </main>
    </div>
  );
}
