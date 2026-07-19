import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  searchProducts,
  SearchSuggestion,
} from "@/lib/api";

export const useSearchWithDebounce = (
  query: string,
  delay: number = 300,
  minLength: number = 2
) => {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abort previous request
  const abortControllerRef = useRef<AbortController | null>(null);

  // Prevent stale responses
  const requestIdRef = useRef(0);

  const fetchSuggestions = useCallback(
    async (searchQuery: string) => {
      const query = searchQuery.trim();

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Validation
      if (query.length < minLength) {
        setSuggestions([]);
        setLoading(false);
        setError(null);
        return;
      }

      // New request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const results = await searchProducts({
          keyword: query,
          limit: 8,
          signal: controller.signal,
        });

        // Ignore old response
        if (requestId !== requestIdRef.current) {
          return;
        }

        setSuggestions(results);
      } catch (err) {
        // Ignore cancelled request
        if (
          axios.isCancel(err) ||
          (err instanceof Error && err.name === "CanceledError")
        ) {
          return;
        }

        if (requestId !== requestIdRef.current) {
          return;
        }

        setSuggestions([]);
        setError("Unable to load suggestions.");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [minLength]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchSuggestions(query);
    }, delay);

    return () => {
      clearTimeout(timer);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [query, delay, fetchSuggestions]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    suggestions,
    loading,
    error,
  };
};