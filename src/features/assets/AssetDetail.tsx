import { useEffect, useRef, useState } from 'react';
import { ApiError, getAsset, thumbnailUrl, updateAsset } from '@/api/client';
import { formatBytes, formatDate, formatDuration, statusLabel, statusSymbol } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  id: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

function DetailThumbnail({ asset }: { asset: Asset }) {
  const [imgFailed, setImgFailed] = useState(!asset.hasThumbnail);

  useEffect(() => {
    setImgFailed(!asset.hasThumbnail);
  }, [asset.id, asset.hasThumbnail]);

  if (imgFailed) {
    return (
      <div className="panel__thumb panel__thumb-placeholder" aria-label="Thumbnail unavailable">
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
    );
  }

  return (
    <img
      className="panel__thumb"
      src={thumbnailUrl(asset.id)}
      alt=""
      onError={() => setImgFailed(true)}
    />
  );
}

/**
 * Detail panel with focus management, Escape key support,
 * conflict detection (409), and fresh version reload.
 */
export function AssetDetail({ id, onClose, onSaved }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the drawer on open, and close on Escape
  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setAsset(null);
    setError(null);
    getAsset(id)
      .then(setAsset)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, [id]);

  async function setStatus(status: AssetStatus) {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAsset(asset.id, asset.version, { status });
      setAsset(updated);
      onSaved(updated);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Version conflict: This asset was modified in another session. Reloading latest version…');
        try {
          const fresh = await getAsset(id);
          setAsset(fresh);
          onSaved(fresh);
        } catch {
          // Keep conflict message
        }
        return;
      }
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="panel" role="dialog" aria-label="Asset detail" aria-modal="true">
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button ref={closeButtonRef} onClick={onClose} aria-label="Close detail panel">
          Close
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!asset && !error && (
        <div className="panel-loader" role="status" aria-live="polite">
          <div className="spinner" />
          <span className="muted">Loading asset details…</span>
        </div>
      )}

      {asset && (
        <div className="panel__body">
          <DetailThumbnail asset={asset} />
          <h3>{asset.name}</h3>
          <dl className="facts">
            <dt>Id</dt>
            <dd>
              <code>{asset.id}</code>
            </dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          <p className="panel__section-title">Change status</p>
          <div className="status-button-group">
            {STATUSES.map((status) => {
              const isCurrent = status === asset.status;
              return (
                <button
                  key={status}
                  type="button"
                  className={`status-btn status-btn--${status}${isCurrent ? ' is-current' : ''}`}
                  disabled={saving || isCurrent}
                  onClick={() => setStatus(status)}
                >
                  <span className="status-btn__symbol">{statusSymbol(status)}</span>
                  <span>{statusLabel(status)}</span>
                  {isCurrent && <span className="status-btn__badge">Current</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
