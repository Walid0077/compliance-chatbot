import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client';

export function useDocuments(password) {
  const [documents, setDocuments] = useState([]);
  const [count, setCount] = useState(0);
  const [source, setSource] = useState(null);
  const [gcsBucket, setGcsBucket] = useState(null);
  const [gcsError, setGcsError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiGet('/api/documents', password);
      setDocuments(result.documents || []);
      setCount(result.count || 0);
      setSource(result.source || null);
      setGcsBucket(result.gcsBucket || null);
      setGcsError(result.gcsError || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  return { documents, count, source, gcsBucket, gcsError, loading, error, refresh: fetchDocuments };
}
