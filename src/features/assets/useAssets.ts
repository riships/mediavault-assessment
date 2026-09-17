import { useCallback, useEffect, useRef, useState } from 'react';
import { listAssets } from '@/api/client';
import type { Asset, AssetQuery } from '@/lib/types';

interface State {
  items: Asset[];
  total: number;
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export function useAssets(query: Omit<AssetQuery, 'cursor'>) {
  const [state, setState] = useState<State>({
    items: [],
    total: 0,
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  });

  const queryKey = JSON.stringify(query);
  const activeControllerRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  nextCursorRef.current = state.nextCursor;
  const isLoadingMoreRef = useRef(false);

  // When query parameters change, reset pagination and fetch page 1
  useEffect(() => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    setState((s) => ({
      ...s,
      loading: true,
      loadingMore: false,
      error: null,
    }));

    listAssets(query, { signal: controller.signal })
      .then((page) => {
        setState({
          items: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }
        setState((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          error: err instanceof Error ? err.message : 'Something went wrong',
        }));
      });

    return () => {
      controller.abort();
    };
  }, [queryKey]);

  // Load next page using cursor pagination
  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || isLoadingMoreRef.current || state.loading) {
      return;
    }

    isLoadingMoreRef.current = true;
    setState((s) => ({ ...s, loadingMore: true }));

    try {
      const page = await listAssets({ ...query, cursor });
      setState((s) => ({
        ...s,
        items: [...s.items, ...page.items],
        total: page.total,
        nextCursor: page.nextCursor,
        loadingMore: false,
      }));
    } catch (err: unknown) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      setState((s) => ({
        ...s,
        loadingMore: false,
        error: err instanceof Error ? err.message : 'Failed to load more assets',
      }));
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [queryKey, state.loading]);

  return {
    ...state,
    hasMore: Boolean(state.nextCursor),
    loadMore,
  };
}