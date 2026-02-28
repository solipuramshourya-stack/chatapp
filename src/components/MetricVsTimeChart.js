import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function MetricVsTimeChart({ data, metricField = 'view_count' }) {
  const [enlarged, setEnlarged] = useState(false);
  const [showModal, setShowModal] = useState(false);

  if (!data?.length) return null;

  const chartData = data.map((d) => ({
    ...d,
    dateLabel: d.date ? new Date(d.date).toLocaleDateString(undefined, { month: 'short', year: '2-digit', day: 'numeric' }) : '',
  }));

  const handleDownload = () => {
    const svg = document.querySelector('.metric-vs-time-chart-wrap svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metric-vs-time-${metricField}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const content = (
    <div className={`metric-vs-time-chart-wrap${enlarged ? ' enlarged' : ''}`}>
      <p className="metric-vs-time-label">{metricField.replace(/_/g, ' ')} vs time</p>
      <ResponsiveContainer width="100%" height={enlarged ? 400 : 260}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15,15,35,0.95)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: '#e2e8f0',
              fontSize: '0.8rem',
            }}
            labelStyle={{ color: '#fff' }}
            formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : value, metricField]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#818cf8"
            strokeWidth={2}
            dot={{ fill: '#818cf8', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="metric-vs-time-actions">
        <button type="button" className="metric-vs-time-btn" onClick={() => setEnlarged(!enlarged)}>
          {enlarged ? 'Shrink' : 'Enlarge'}
        </button>
        <button type="button" className="metric-vs-time-btn" onClick={handleDownload}>
          Download
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div
        className="metric-vs-time-inline"
        role="button"
        tabIndex={0}
        onClick={() => setShowModal(true)}
        onKeyDown={(e) => e.key === 'Enter' && setShowModal(true)}
      >
        {content}
      </div>
      {showModal && (
        <div
          className="metric-vs-time-modal-overlay"
          onClick={() => setShowModal(false)}
          role="presentation"
        >
          <div className="metric-vs-time-modal" onClick={(e) => e.stopPropagation()}>
            <div className="metric-vs-time-modal-header">
              <span>{metricField.replace(/_/g, ' ')} vs time</span>
              <button type="button" onClick={handleDownload}>Download</button>
              <button type="button" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="metric-vs-time-modal-body">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                    tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,15,35,0.95)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      color: '#e2e8f0',
                      fontSize: '0.82rem',
                    }}
                    formatter={(value) => [typeof value === 'number' ? value.toLocaleString() : value, metricField]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={{ fill: '#818cf8', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
