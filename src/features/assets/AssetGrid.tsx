import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetCard } from './AssetCard';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onResetFilters?: () => void;
  onLoadMore?: () => void;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

const MIN_CARD_WIDTH = 220;
const GAP = 12;
const HORIZONTAL_PADDING = 32; // 16px left + 16px right
const CARD_BODY_HEIGHT = 98;
const OVERSCAN_ROWS = 2;

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onResetFilters,
  onLoadMore,
  onToggleSelect,
  onOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  const [containerHeight, setContainerHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [scrollTop, setScrollTop] = useState(0);

  // ResizeObserver to track container dimensions accurately
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Compute column and row geometry
  const availableWidth = Math.max(MIN_CARD_WIDTH, containerWidth - HORIZONTAL_PADDING);
  const columns = Math.max(1, Math.floor((availableWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
  const columnWidth = (availableWidth - (columns - 1) * GAP) / columns;
  // 16:10 aspect ratio thumbnail + card body
  const cardHeight = Math.round(columnWidth * (10 / 16) + CARD_BODY_HEIGHT);
  const rowHeight = cardHeight + GAP;

  const totalRows = Math.ceil(assets.length / columns);
  const totalVirtualHeight = totalRows * rowHeight;

  // Windowed virtual row indices
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN_ROWS);

  const startIndex = startRow * columns;
  const endIndex = Math.min(assets.length, endRow * columns);
  const visibleAssets = assets.slice(startIndex, endIndex);

  // Reset scroll to top only when the query or filters change (first asset changes)
  const firstAssetId = assets[0]?.id;
  const prevFirstAssetIdRef = useRef<string | undefined>(firstAssetId);
  useEffect(() => {
    if (prevFirstAssetIdRef.current !== firstAssetId) {
      prevFirstAssetIdRef.current = firstAssetId;
      if (containerRef.current && prevFirstAssetIdRef.current !== undefined) {
        containerRef.current.scrollTop = 0;
        setScrollTop(0);
      }
    }
  }, [firstAssetId]);

  // Handle scroll and trigger loadMore when near the bottom
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const currentScrollTop = target.scrollTop;
      setScrollTop(currentScrollTop);

      if (hasMore && !loadingMore && onLoadMore) {
        const distanceToBottom = target.scrollHeight - (currentScrollTop + target.clientHeight);
        if (distanceToBottom < rowHeight * 4) {
          onLoadMore();
        }
      }
    },
    [hasMore, loadingMore, onLoadMore, rowHeight],
  );

  if (loading && assets.length === 0) {
    return (
      <div className="content-loader">
        <div className="spinner spinner--lg" />
        <span className="content-loader__title">Loading assets…</span>
        <span className="muted">Fetching asset library from API</span>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <h3>No assets found</h3>
        <p className="muted">No assets matched your search query or status filters.</p>
        {onResetFilters && (
          <button type="button" className="empty__reset-btn" onClick={onResetFilters}>
            Clear search and filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="grid grid--virtual"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {loading && (
        <div className="grid__loading-indicator">
          <div className="spinner spinner--sm spinner--white" />
          <span>Updating…</span>
        </div>
      )}

      <div
        className="grid__spacer"
        style={{
          height: `${totalVirtualHeight}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          className="grid__visible-window"
          style={{
            transform: `translateY(${startRow * rowHeight}px)`,
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${GAP}px`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleAssets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isSelected={selectedIds.has(asset.id)}
              isActive={activeId === asset.id}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>

      {loadingMore && (
        <div className="grid__loading-more">
          <div className="spinner spinner--sm spinner--white" />
          <span>Loading more assets…</span>
        </div>
      )}
    </div>
  );
}
