import { useState } from 'react';
import { Trade } from './types/trade';
import { useTrades } from './hooks/useTrades';
import { useWebSocket } from './hooks/useWebSocket';
import { ToastProvider } from './context/ToastContext';
import { TradeBlotter } from './components/TradeBlotter/TradeBlotter';
import { TradeForm } from './components/TradeForm/TradeForm';
import { AuditPanel } from './components/AuditPanel/AuditPanel';
import { formatLargeNotional } from './utils/formatters';

function AppInner() {
  const [formTrade,  setFormTrade]  = useState<Trade | undefined | null>(null);
  const [auditTrade, setAuditTrade] = useState<Trade | null>(null);

  const {
    trades, isLoading, error, refetch,
    applyWsEvent, createTrade, amendTrade, cancelTrade,
    isCreating, isAmending,
  } = useTrades();

  const { connected } = useWebSocket(applyWsEvent);

  const activeTrades  = trades.filter(t => t.status === 'ACTIVE');
  const totalNotional = activeTrades.reduce((sum, t) => sum + t.price * t.quantity, 0);

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
            <span className="app-header__stat-value">{trades.length}</span>
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
          isLoading={isLoading}
          error={error}
          refetch={refetch}
          cancelTrade={cancelTrade}
          onAmend={(trade) => setFormTrade(trade)}
          onCreate={() => setFormTrade(undefined)}
          onViewAudit={(trade) => setAuditTrade(trade)}
        />
      </main>

      {formTrade !== null && (
        <TradeForm
          trade={formTrade ?? undefined}
          onClose={() => setFormTrade(null)}
          createTrade={createTrade}
          amendTrade={amendTrade}
          isCreating={isCreating}
          isAmending={isAmending}
        />
      )}

      {auditTrade && (
        <AuditPanel trade={auditTrade} onClose={() => setAuditTrade(null)} />
      )}
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
