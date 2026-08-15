"use client";

import * as React from "react";

export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      try {
        const next = await fetcherRef.current();
        if (alive) {
          setData(next);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "failed to load");
          setLoading(false);
        }
      }
    }

    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return { data, error, loading, refresh: () => void (fetcherRef.current().then(setData).catch(() => undefined)) };
}
