import { useDashboard } from '../hooks/useDashboard';
import EscalationQueue from '../components/EscalationQueue';
import DocumentsPanel from '../components/DocumentsPanel';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { format } from 'date-fns';
import './DashboardPage.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Tooltip, Legend, Filler
);

const DECISION_COLORS = {
  pass: '#10d97e',
  emergency: '#ef4444',
  refusal: '#f59e0b',
  out_of_scope: '#8b5cf6',
  unknown: '#4a5568',
};

const SENSITIVITY_COLORS = {
  HIGH: '#ef4444',
  STANDARD: '#38bdf8',
  'N/A': '#4a5568',
};

const DECISION_LABELS = {
  pass: 'Pass through',
  emergency: 'Emergency halt',
  refusal: 'Refusal',
  out_of_scope: 'Out of scope',
  unknown: 'Unknown',
};

function StatCard({ icon, iconClass, value, label, sub }) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon ${iconClass}`}>{icon}</div>
      <div className="stat-card-body">
        <span className="stat-card-value">{value ?? '—'}</span>
        <span className="stat-card-label">{label}</span>
        {sub && <span className="stat-card-trend">{sub}</span>}
      </div>
    </div>
  );
}

function pickDecisionPie(distribution = []) {
  const labels = distribution.map((d) => DECISION_LABELS[d.key] || d.key);
  const colors = distribution.map((d) => DECISION_COLORS[d.key] || '#6366f1');
  return {
    labels,
    datasets: [{
      data: distribution.map((d) => d.count),
      backgroundColor: colors,
      borderColor: '#0e1320',
      borderWidth: 2,
    }],
  };
}

function pickSensitivityBar(distribution = []) {
  const order = ['HIGH', 'STANDARD', 'N/A'];
  const sorted = order
    .map((k) => distribution.find((d) => d.key === k))
    .filter(Boolean);
  return {
    labels: sorted.map((d) => d.key),
    datasets: [{
      label: 'Inquiries',
      data: sorted.map((d) => d.count),
      backgroundColor: sorted.map((d) => SENSITIVITY_COLORS[d.key] || '#6366f1'),
      borderRadius: 6,
      borderSkipped: false,
      barThickness: 48,
    }],
  };
}

export default function DashboardPage({ password }) {
  const { data, loading, refresh } = useDashboard(password);

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">
          <div className="spinner" /> Loading analytics…
        </div>
      </div>
    );
  }

  const hasData = data && data.totalSessions > 0;

  // Source-coverage trend chart. coverage is 0..1; render as a percent.
  const trendLabels = (data?.sourceCoverageTrend || []).map((d) =>
    format(new Date(d.date + 'T00:00:00'), 'MMM d')
  );
  const trendValues = (data?.sourceCoverageTrend || []).map((d) =>
    parseFloat((d.coverage * 100).toFixed(1))
  );

  const lineData = {
    labels: trendLabels,
    datasets: [{
      label: 'Source coverage %',
      data: trendValues,
      fill: true,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.1)',
      tension: 0.4,
      pointBackgroundColor: '#6366f1',
      pointRadius: 4,
      pointHoverRadius: 6,
    }],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#141928',
        borderColor: 'rgba(99,102,241,0.3)',
        borderWidth: 1,
        titleColor: '#f0f2ff',
        bodyColor: '#8892b0',
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y}% of replies cited at least one source`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#4a5568', font: { size: 11 } },
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#4a5568',
          font: { size: 11 },
          callback: (v) => `${v}%`,
        },
      },
    },
  };

  const sourceCoveragePct = data?.sourceCoverage != null
    ? `${Math.round(data.sourceCoverage * 100)}%`
    : '—';
  const haltRatePct = data?.haltRate != null
    ? `${Math.round(data.haltRate * 100)}%`
    : '—';

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Analytics Dashboard</div>
          <div className="dashboard-subtitle">GrahamAI performance &amp; insights</div>
        </div>
        <button className="refresh-btn" onClick={refresh}>↻ Refresh</button>
      </div>

      {!hasData && (
        <div className="no-data-banner">
          <span style={{ fontSize: 24 }}>💡</span>
          <span>
            <strong>No data yet.</strong> Start conversations in the Chat tab — analytics will populate here automatically.
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="stat-cards">
        <StatCard
          icon="💬" iconClass="purple"
          value={data?.totalSessions ?? 0}
          label="Total Sessions"
        />
        <StatCard
          icon="📨" iconClass="blue"
          value={data?.totalMessages ?? 0}
          label="Total Messages"
        />
        <StatCard
          icon="📎" iconClass="green"
          value={sourceCoveragePct}
          label="Source Coverage"
          sub="Replies grounded in a citation"
        />
        <StatCard
          icon="🛑" iconClass="amber"
          value={haltRatePct}
          label="Halt Rate"
          sub="Intake gate stopped these"
        />
        <StatCard
          icon="🚨" iconClass="red"
          value={data?.totalEscalated ?? 0}
          label="Auto-Escalated"
          sub="URGENT ESCALATION fires"
        />
      </div>

      {/* Charts */}
      <div className="charts-grid">
        {/* Confidence Trend */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">Source Coverage Trend</div>
              <div className="chart-card-sub">% of replies citing at least one source, by day</div>
            </div>
          </div>
          {trendLabels.length > 0 ? (
            <div className="chart-wrap">
              <Line data={lineData} options={lineOptions} />
            </div>
          ) : (
            <div className="chart-empty">
              <span style={{ fontSize: 32, opacity: 0.3 }}>📈</span>
              <span>No trend data yet</span>
            </div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">Intake Gate Decisions</div>
              <div className="chart-card-sub">Step 0 outcomes (pass / refusal / emergency / out-of-scope)</div>
            </div>
          </div>
          {(data?.decisionDistribution || []).length > 0 ? (
            <div className="chart-wrap">
              <Doughnut
                data={pickDecisionPie(data.decisionDistribution)}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '60%',
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { color: '#8892b0', font: { size: 11 }, padding: 12, boxWidth: 12 },
                    },
                    tooltip: {
                      backgroundColor: '#141928',
                      borderColor: 'rgba(99,102,241,0.3)',
                      borderWidth: 1,
                      titleColor: '#f0f2ff',
                      bodyColor: '#8892b0',
                    },
                  },
                }}
              />
            </div>
          ) : (
            <div className="chart-empty">
              <span style={{ fontSize: 32, opacity: 0.3 }}>🛡️</span>
              <span>No intake-gate data yet</span>
            </div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">Sensitivity Routing</div>
              <div className="chart-card-sub">Step 2 outcomes for passes (HIGH vs STANDARD)</div>
            </div>
          </div>
          {(data?.sensitivityDistribution || []).length > 0 ? (
            <div className="chart-wrap">
              <Bar
                data={pickSensitivityBar(data.sensitivityDistribution)}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: '#141928',
                      borderColor: 'rgba(99,102,241,0.3)',
                      borderWidth: 1,
                      titleColor: '#f0f2ff',
                      bodyColor: '#8892b0',
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { color: '#8892b0', font: { size: 12 } },
                    },
                    y: {
                      grid: { color: 'rgba(255,255,255,0.04)' },
                      ticks: { color: '#4a5568', font: { size: 11 }, precision: 0 },
                      beginAtZero: true,
                    },
                  },
                }}
              />
            </div>
          ) : (
            <div className="chart-empty">
              <span style={{ fontSize: 32, opacity: 0.3 }}>⚖️</span>
              <span>No sensitivity data yet</span>
            </div>
          )}
        </div>
      </div>

      {/* Escalation Queue */}
      <EscalationQueue password={password} />

      {/* Documents */}
      <DocumentsPanel password={password} />
    </div>
  );
}
