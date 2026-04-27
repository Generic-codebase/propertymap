import { useState, useEffect, useCallback } from 'react';

const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export function usePropertyData() {
  const [data, setData] = useState({ regions: [], cities: [], suburbs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [regions, cities, suburbs] = await Promise.all([
        fetch('/api/regions').then(r => r.json()),
        fetch('/api/cities').then(r => r.json()),
        fetch('/api/suburbs').then(r => r.json()),
      ]);
      setData({ regions, cities, suburbs });
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { data, loading, error, lastUpdated, refetch: fetchAll };
}
