import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Debounced search hook
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Pagination state hook
 */
export function usePagination(pageSize = 10) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.ceil(total / pageSize);

  const reset = useCallback(() => setPage(1), []);

  return { page, setPage, total, setTotal, totalPages, pageSize, reset };
}

/**
 * Async operation state hook (for save/delete operations)
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(true);
    try {
      return await fn();
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, run };
}

/**
 * Polling hook for periodic data refresh
 */
export function usePolling(callback: () => void, intervalMs: number) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const tick = () => savedCallback.current();
    tick(); // initial call
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
