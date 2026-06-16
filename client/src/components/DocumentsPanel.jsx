import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useDocuments } from '../hooks/useDocuments';
import './DocumentsPanel.css';

const STATUS_LABELS = {
  active: 'Active',
  superseded: 'Superseded',
  expired: 'Expired',
  draft: 'Draft',
};

export default function DocumentsPanel({ password }) {
  const { documents, loading, refresh, source, gcsBucket, gcsError } = useDocuments(password);
  const [domainFilter, setDomainFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const domains = useMemo(() => {
    const set = new Set();
    documents.forEach((d) => { if (d.regulatory_domain) set.add(d.regulatory_domain); });
    return Array.from(set).sort();
  }, [documents]);

  const statuses = useMemo(() => {
    const set = new Set();
    documents.forEach((d) => { if (d.status) set.add(d.status); });
    return Array.from(set).sort();
  }, [documents]);

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      if (domainFilter && d.regulatory_domain !== domainFilter) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      return true;
    });
  }, [documents, domainFilter, statusFilter]);

  return (
    <div className="chart-card documents-panel">
      <div className="chart-card-header">
        <div>
          <div className="chart-card-title">Documents</div>
          <div className="chart-card-sub">
            {source === 'gcs' && gcsBucket
              ? <>Live from <code>{gcsBucket}</code>. </>
              : 'Regulatory corpus + internal policies. '}
            {filtered.length} of {documents.length} shown.
          </div>
        </div>
        <div className="documents-controls">
          <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="">All domains</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          <button className="refresh-btn small" onClick={refresh}>↻</button>
        </div>
      </div>

      {gcsError && (
        <div className="gcs-error-banner">
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong>Cloud Storage listing failed.</strong> Showing local documents
            instead. Reason: <code>{gcsError.message}</code>
          </div>
        </div>
      )}

      {loading ? (
        <div className="chart-empty">
          <div className="spinner" />
          <span>Loading documents…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="chart-empty">
          <span style={{ fontSize: 32, opacity: 0.3 }}>📚</span>
          <span>{documents.length === 0
            ? 'No documents yet. Drop files into data/documents/ or run `npm run seed`.'
            : 'No documents match the current filters.'}
          </span>
        </div>
      ) : (
        <table className="documents-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Domain</th>
              <th>Version</th>
              <th>Status</th>
              <th>Effective</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((doc) => (
              <tr key={doc.filename}>
                <td className="filename">
                  <span className="doc-icon">{iconForType(doc.contentType)}</span>
                  <span title={doc.filename}>{doc.filename}</span>
                </td>
                <td>
                  {doc.regulatory_domain
                    ? <span className="badge badge-domain">{doc.regulatory_domain}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="muted">{doc.version || '—'}</td>
                <td>
                  <span className={`status status-doc-${doc.status || 'unknown'}`}>
                    {STATUS_LABELS[doc.status] || doc.status || 'unknown'}
                  </span>
                </td>
                <td className="muted">
                  {doc.effective_date ? format(new Date(doc.effective_date), 'MMM d, yyyy') : '—'}
                </td>
                <td className="muted ts">
                  {doc.upload_date ? format(new Date(doc.upload_date), 'MMM d, yyyy') : '—'}
                </td>
                <td className="actions">
                  <a className="doc-link" href={doc.url} target="_blank" rel="noopener noreferrer">
                    Open ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function iconForType(contentType = '') {
  if (contentType.includes('pdf')) return '📕';
  if (contentType.includes('word')) return '📘';
  if (contentType.includes('text/markdown')) return '📝';
  if (contentType.startsWith('text/')) return '📄';
  if (contentType.includes('csv')) return '📊';
  if (contentType.includes('json')) return '🧾';
  return '📁';
}
