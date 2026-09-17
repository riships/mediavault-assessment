import React, { useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  isActive: boolean;
  tabIndex?: number;
  ariaPosInSet?: number;
  ariaSetSize?: number;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  onOpen: (id: string) => void;
}

/**
 * Custom equality check ensuring that toggling selection on one card
 * re-renders strictly that single card and none of the other cards.
 */
function areCardPropsEqual(prev: AssetCardProps, next: AssetCardProps): boolean {
  return (
    prev.asset === next.asset &&
    prev.isSelected === next.isSelected &&
    prev.isActive === next.isActive &&
    prev.tabIndex === next.tabIndex &&
    prev.ariaPosInSet === next.ariaPosInSet &&
    prev.ariaSetSize === next.ariaSetSize &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onOpen === next.onOpen
  );
}

export const AssetCard = React.memo(function AssetCard({
  asset,
  isSelected,
  isActive,
  tabIndex = -1,
  ariaPosInSet,
  ariaSetSize,
  onToggleSelect,
  onOpen,
}: AssetCardProps) {
  const [imgError, setImgError] = useState(false);

  // If asset has no thumbnail flag or image failed with 404, render stable placeholder
  const showPlaceholder = !asset.hasThumbnail || imgError;

  return (
    <div
      data-asset-id={asset.id}
      className={
        'card' +
        (isSelected ? ' card--selected' : '') +
        (isActive ? ' card--active' : '')
      }
      role="gridcell"
      tabIndex={tabIndex}
      aria-selected={isSelected}
      aria-posinset={ariaPosInSet}
      aria-setsize={ariaSetSize}
      onClick={(e) => {
        if (e.shiftKey) {
          e.preventDefault();
          onToggleSelect(asset.id, true);
        } else if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onToggleSelect(asset.id, false);
        } else {
          onOpen(asset.id);
        }
      }}
    >
      <div className="card__thumb-wrapper" aria-hidden="true">
        {showPlaceholder ? (
          <div className="card__placeholder" aria-hidden="true">
            <svg
              className="card__placeholder-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <span className="card__placeholder-text">No preview</span>
          </div>
        ) : (
          <img
            className="card__thumb"
            src={thumbnailUrl(asset.id)}
            alt=""
            loading="lazy"
            aria-hidden="true"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      <div className="card__body">
        <p className="card__name" title={asset.name}>
          {asset.name}
        </p>
        <p className="muted">
          {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
        </p>
        <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
      </div>

      <input
        type="checkbox"
        className="card__check"
        checked={isSelected}
        tabIndex={-1} // Handled via card Space toggle to keep single roving tab stop per card
        aria-label={`Select ${asset.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(asset.id, e.shiftKey);
        }}
        onChange={() => { }}
      />
    </div>
  );
}, areCardPropsEqual);
