import { useState } from 'react';
import { Trade } from './types/trade';
import { useTrades } from './hooks/useTrades';
import { useWebSocket } from './hooks/useWebSocket';
import { TradeBlotter } from './components/TradeBlotter/TradeBlotter';
import { TradeForm } from './components/TradeForm/TradeForm';
import { AuditPanel } from './components/AuditPanel/AuditPanel';

export function App() {
  const [formTrade, setFormTrade] = useState<Trade | undefined | null>(null);
  const [auditTrade, setAuditTrade] = useState<Trade | null>(null);

  const {
    trades, isLoading, error, refetch,
    applyWsEvent, createTrade, amendTrade, cancelTrade,
    isCreating, isAmending,
  } = useTrades();

  const { connected } = useWebSocket(applyWsEvent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ background: '#1e293b', color: '#f8fafc', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Trade Blotter</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Equity Trades</span>
      </header>
      <main style={{ flex: 1, padding: 16, overflow: 'hidden' }}>
        <TradeBlotter
          trades={trades}
          isLoading={isLoading}
          error={error}
          refetch={refetch}
          cancelTrade={cancelTrade}
          connected={connected}
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
