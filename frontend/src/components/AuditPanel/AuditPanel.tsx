import { memo } from 'react';
import { Trade } from '../../types/trade';
import { useAuditHistory } from '../../hooks/useAuditHistory';
import { Modal } from '../Modal/Modal';
import { formatDate } from '../../utils/formatters';

interface Props {
  trade: Trade;
  onClose: () => void;
}

export const AuditPanel = memo(function AuditPanel({ trade, onClose }: Props) {
  const { data: history = [], isLoading: loading, error: queryError } = useAuditHistory(trade.id);
  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  return (
    <Modal onClose={onClose} labelId="audit-title">
      <div className="audit-panel">
        <div className="audit-panel__header">
          <div>
            <h2 id="audit-title" className="audit-panel__title">Audit Trail</h2>
            <div className="audit-panel__id">{trade.id}</div>
          </div>
          <button className="modal__close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="audit-panel__body">
          {loading && (
            <div>
              <div className="loading-shimmer" style={{ marginBottom: 16 }} />
              <div style={{ textAlign: 'center', color: 'var(--t-muted)', fontSize: 13 }}>Loading audit history…</div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 13px', background: 'var(--c-error-bg)',
              border: '1px solid #fecaca', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--c-error)',
            }}>
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-state__icon">🔍</div>
              <div className="empty-state__title">No audit history</div>
              <div className="empty-state__desc">Events will appear here as changes are made.</div>
            </div>
          )}

          {!loading && history.length > 0 && (
            <div className="timeline">
              {history.map(entry => (
                <div key={entry.id} className={`timeline-entry timeline-entry--${entry.action}`}>
                  <div className="timeline-card">
                    <div className="timeline-card__header">
                      <span className={`timeline-action timeline-action--${entry.action}`}>
                        {entry.action}
                      </span>
                      <span className="timeline-time">{formatDate(entry.changedAt)}</span>
                    </div>

                    {entry.before && (
                      <div className="diff-list">
                        {diffFields(entry.before, entry.after).map(({ field, from, to }) => (
                          <div key={field} className="diff-row">
                            <span className="diff-field">{field}</span>
                            <span className="diff-from">{String(from)}</span>
                            <span className="diff-arrow">→</span>
                            <span className="diff-to">{String(to)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!entry.before && (
                      <div style={{ fontSize: 11, color: 'var(--t-muted)' }}>
                        Trade created with {Object.keys(entry.after).length} fields
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
});

function diffFields(before: Trade, after: Trade): { field: string; from: unknown; to: unknown }[] {
  return (Object.keys(after) as (keyof Trade)[])
    .filter(k => k !== 'tradeTimestamp' && k !== 'id' && before[k] !== after[k])
    .map(k => ({ field: k, from: before[k], to: after[k] }));
}
