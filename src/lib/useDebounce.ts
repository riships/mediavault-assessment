import { useEffect, useState } from 'react';

/**
 * Hook that returns a debounced version of the provided value.
 * Delays updating the debounced value until after the specified delay has passed
 * since the last time the source value changed.
 *
 * @param value The value to debounce.
 * @param delayMs Delay in milliseconds (default 300ms).
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}