import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPatch } from '../api/client';

export function useEscalations(password, { status } = {}) {
  const [data, setData] = useState({ escalations: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEscalations = useCallback(async () => {
    try {
      setLoading(true);
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const result = await apiGet(`/api/escalations${qs}`, password);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [password, status]);

  useEffect(() => { fetchEscalations(); }, [fetchEscalations]);

  const updateStatus = useCallback(async (id, patch) => {
    const updated = await apiPatch(`/api/escalations/${id}`, patch, password);
    setData((d) => ({
      ...d,
      escalations: d.escalations.map((e) => (e.id === id ? updated : e)),
    }));
    return updated;
  }, [password]);

  return {
    escalations: data.escalations || [],
    stats: data.stats,
    loading,
    error,
    refresh: fetchEscalations,
    updateStatus,
  };
}
