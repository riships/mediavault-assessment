import React, { useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  isActive: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

export const AssetCard = React.memo(function AssetCard({
  asset,
  isSelected,
  isActive,
  onToggleSelect,
  onOpen,
}: AssetCardProps) {
  const [imgError, setImgError] = useState(false);

  // If asset has no thumbnail flag or image failed with 404, render stable placeholder
  const showPlaceholder = !asset.hasThumbnail || imgError;

  return (
    <div
      className={
        'card' +
        (isSelected ? ' card--selected' : '') +
        (isActive ? ' card--active' : '')
      }
      onClick={() => onOpen(asset.id)}
    >
      <div className="card__thumb-wrapper">
        {showPlaceholder ? (
          <div className="card__placeholder">
            <svg
              className="card__placeholder-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
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
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(asset.id)}
      />
    </div>
  );
});
