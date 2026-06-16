import { useState } from 'react';
import { format } from 'date-fns';
import { useEscalations } from '../hooks/useEscalations';
import './EscalationQueue.css';

const STATUS_LABELS = {
  open: 'Open',
  in_review: 'In review',
  closed: 'Closed',
};

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'closed', label: 'Closed' },
  { value: '', label: 'All' },
];

export default function EscalationQueue({ password }) {
  const [filter, setFilter] = useState('open');
  const { escalations, stats, loading, refresh, updateStatus } = useEscalations(
    password,
    { status: filter || undefined }
  );

  async function handleAction(id, nextStatus, resolutionPrompt = null) {
    const patch = { status: nextStatus };
    if (resolutionPrompt) {
      const note = window.prompt(resolutionPrompt);
      if (note === null) return; // cancelled
      patch.note = note;
      patch.resolution = note;
      patch.closedBy = 'oversight';
    }
    try {
      await updateStatus(id, patch);
    } catch (err) {
      alert(`Failed to update escalation: ${err.message}`);
    }
  }

  return (
    <div className="chart-card escalation-queue">
      <div className="chart-card-header">
        <div>
          <div className="chart-card-title">Escalation queue</div>
          <div className="chart-card-sub">
            Auto-created from URGENT ESCALATION responses and manual entries
          </div>
        </div>
        <div className="escalation-controls">
          {FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              className={`filter-btn ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {f.value === 'open' && stats?.open ? ` (${stats.open})` : ''}
              {f.value === 'in_review' && stats?.inReview ? ` (${stats.inReview})` : ''}
              {f.value === 'closed' && stats?.closed ? ` (${stats.closed})` : ''}
            </button>
          ))}
          <button className="refresh-btn small" onClick={refresh}>↻</button>
        </div>
      </div>

      {loading ? (
        <div className="chart-empty">
          <div className="spinner" />
          <span>Loading escalations…</span>
        </div>
      ) : escalations.length === 0 ? (
        <div className="chart-empty">
          <span style={{ fontSize: 32, opacity: 0.3 }}>📋</span>
          <span>No escalations in this view</span>
        </div>
      ) : (
        <table className="escalation-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Trigger</th>
              <th>User query</th>
              <th>Destinations</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {escalations.map((e) => (
              <tr key={e.id}>
                <td className="ts">
                  {format(new Date(e.createdAt), 'MMM d, HH:mm')}
                </td>
                <td>
                  {e.trigger ? (
                    <span className="badge badge-trigger">{e.trigger}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="query" title={e.userQuery}>
                  {(e.userQuery || '').slice(0, 80)}
                  {(e.userQuery || '').length > 80 ? '…' : ''}
                </td>
                <td>
                  {(e.destinations || []).map((d) => (
                    <span key={d} className="badge badge-dest">{d}</span>
                  ))}
                </td>
                <td>
                  <span className={`status status-${e.status}`}>
                    {STATUS_LABELS[e.status] || e.status}
                  </span>
                </td>
                <td className="actions">
                  {e.status === 'open' && (
                    <button onClick={() => handleAction(e.id, 'in_review')}>
                      Start review
                    </button>
                  )}
                  {e.status !== 'closed' && (
                    <button
                      className="primary"
                      onClick={() =>
                        handleAction(e.id, 'closed', 'Resolution note (required):')
                      }
                    >
                      Close
                    </button>
                  )}
                  {e.status === 'closed' && e.resolution && (
                    <span className="resolution muted" title={e.resolution}>
                      ✓ {e.resolution.slice(0, 40)}
                      {e.resolution.length > 40 ? '…' : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
