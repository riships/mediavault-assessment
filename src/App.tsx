import { useCallback, useState } from 'react';
import { bulkSetStatus } from '@/api/client';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { useAssets } from '@/features/assets/useAssets';
import { statusLabel } from '@/lib/format';
import { useDebounce } from '@/lib/useDebounce';
import type { Asset, AssetStatus, AssetQuery } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

export function App() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedQ = useDebounce(searchInput, 300);
  const [status, setStatus] = useState<AssetStatus[]>([]);
  const [sort, setSort] = useState<NonNullable<AssetQuery['sort']>>('updatedAt:desc');
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
        <div className="topbar__title">
          <h1>MediaVault</h1>
          <span className="count">
            {loading ? '…' : `${total.toLocaleString()} assets`}
          </span>
        </div>

        <div className="search">
          <input
            type="search"
            placeholder="Search by name, tag, kind…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="filters">
          <div className="status-pills">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`pill pill--${s}` + (status.includes(s) ? ' is-active' : '')}
                onClick={() => toggleStatusFilter(s)}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as NonNullable<AssetQuery['sort']>)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {selectedIds.size > 0 && (
        <aside className="bulk-bar">
          <span>{selectedIds.size} selected</span>
          <div className="bulk-bar__actions">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => applyBulkStatus(s)}>
                Mark {statusLabel(s)}
              </button>
            ))}
            <button className="btn-subtle" onClick={() => setSelectedIds(new Set())}>
              Clear
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
