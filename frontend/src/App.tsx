import { lazy, Suspense, useState, useCallback, useMemo } from 'react';
import { Trade } from './types/trade';
import { useTrades } from './hooks/useTrades';
import { useWebSocket } from './hooks/useWebSocket';
import { ToastProvider } from './context/ToastContext';
import { TradeBlotter } from './components/TradeBlotter/TradeBlotter';
import { formatLargeNotional } from './utils/formatters';

// Lazy-load modals — they're never needed on initial render
const TradeForm = lazy(() =>
  import('./components/TradeForm/TradeForm').then(m => ({ default: m.TradeForm }))
);
const AuditPanel = lazy(() =>
  import('./components/AuditPanel/AuditPanel').then(m => ({ default: m.AuditPanel }))
);

function ModalSpinner() {
  return (
    <div className="overlay">
      <div style={{
        width: 32, height: 32,
        border: '3px solid rgba(255,255,255,.15)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin .7s linear infinite',
      }} />
    </div>
  );
}

function AppInner() {
  const [formTrade,  setFormTrade]  = useState<Trade | undefined | null>(null);
  const [auditTrade, setAuditTrade] = useState<Trade | null>(null);

  const {
    trades, totalTrades, isLoading, error, refetch,
    applyWsEvent, createTrade, amendTrade, cancelTrade,
    isCreating, isAmending,
  } = useTrades();

  const { connected } = useWebSocket(applyWsEvent);

  // Memoised stats — recomputed only when trades array changes
  const activeTrades  = useMemo(() => trades.filter(t => t.status === 'ACTIVE'), [trades]);
  const totalNotional = useMemo(
    () => activeTrades.reduce((sum, t) => sum + t.price * t.quantity, 0),
    [activeTrades],
  );

  // Stable callbacks — memo(TradeBlotter) won't re-render when modals open/close
  const handleAmend     = useCallback((trade: Trade) => setFormTrade(trade), []);
  const handleCreate    = useCallback(() => setFormTrade(undefined), []);
  const handleViewAudit = useCallback((trade: Trade) => setAuditTrade(trade), []);
  const handleCloseForm  = useCallback(() => setFormTrade(null), []);
  const handleCloseAudit = useCallback(() => setAuditTrade(null), []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo">📊</div>
          <div>
            <div className="app-header__title">Trade Blotter</div>
            <div className="app-header__subtitle">Equity Desk</div>
          </div>
        </div>

        <div className="app-header__sep" />

        <div className="app-header__stats">
          <div className="app-header__stat">
            <span className="app-header__stat-label">Active</span>
            <span className="app-header__stat-value app-header__stat-value--green">
              {activeTrades.length}
            </span>
          </div>
          <div className="app-header__stat">
            <span className="app-header__stat-label">Total</span>
            <span className="app-header__stat-value">{totalTrades}</span>
          </div>
          <div className="app-header__stat">
            <span className="app-header__stat-label">Notional</span>
            <span className="app-header__stat-value app-header__stat-value--blue">
              {formatLargeNotional(totalNotional)}
            </span>
          </div>
        </div>

        <div className={`ws-pill ws-pill--${connected ? 'live' : 'offline'}`}>
          <span className="ws-pill__dot" />
          <span className="ws-pill__text">{connected ? 'Live' : 'Reconnecting…'}</span>
        </div>
      </header>

      <main className="app-main">
        <TradeBlotter
          trades={trades}
          totalTrades={totalTrades}
          isLoading={isLoading}
          error={error}
          refetch={refetch}
          cancelTrade={cancelTrade}
          onAmend={handleAmend}
          onCreate={handleCreate}
          onViewAudit={handleViewAudit}
        />
      </main>

      <Suspense fallback={<ModalSpinner />}>
        {formTrade !== null && (
          <TradeForm
            trade={formTrade ?? undefined}
            onClose={handleCloseForm}
            createTrade={createTrade}
            amendTrade={amendTrade}
            isCreating={isCreating}
            isAmending={isAmending}
          />
        )}
        {auditTrade && (
          <AuditPanel trade={auditTrade} onClose={handleCloseAudit} />
        )}
      </Suspense>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
