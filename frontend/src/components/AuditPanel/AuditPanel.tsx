import { useEffect, useState } from 'react';
import { Trade, TradeAudit } from '../../types/trade';
import { tradesApi } from '../../api/trades';
import { formatDate } from '../../utils/formatters';

interface Props {
  trade: Trade | null;
  onClose: () => void;
}

export function AuditPanel({ trade, onClose }: Props) {
  const [history, setHistory] = useState<TradeAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trade) return;
    setLoading(true);
    setError(null);
    tradesApi.getAudit(trade.id)
      .then(setHistory)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [trade]);

  if (!trade) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Audit: {trade.id}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        {!loading && history.length === 0 && <p style={{ color: '#6b7280' }}>No audit history.</p>}
        {history.map((entry) => (
          <div key={entry.id} style={entryStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: actionColor(entry.action) }}>{entry.action}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(entry.changedAt)}</span>
            </div>
            {entry.before && (
              <div style={{ fontSize: 12 }}>
                <strong>Changes:</strong>
                {diffFields(entry.before, entry.after).map(({ field, from, to }) => (
                  <div key={field} style={{ marginLeft: 8 }}>
                    {field}: <span style={{ color: '#dc2626' }}>{String(from)}</span>
                    {' → '}
                    <span style={{ color: '#16a34a' }}>{String(to)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function diffFields(before: Trade, after: Trade): { field: string; from: unknown; to: unknown }[] {
  return (Object.keys(after) as (keyof Trade)[])
    .filter((k) => k !== 'tradeTimestamp' && before[k] !== after[k])
    .map((k) => ({ field: k, from: before[k], to: after[k] }));
}

function actionColor(action: string): string {
  if (action === 'CREATE') return '#16a34a';
  if (action === 'CANCEL') return '#dc2626';
  return '#2563eb';
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const panelStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 500,
  maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const entryStyle: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 8, borderRadius: 6,
  background: '#f9fafb', border: '1px solid #e5e7eb',
};
