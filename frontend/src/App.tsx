import { useState } from 'react';
import { Trade } from './types/trade';
import { TradeBlotter } from './components/TradeBlotter/TradeBlotter';
import { TradeForm } from './components/TradeForm/TradeForm';
import { AuditPanel } from './components/AuditPanel/AuditPanel';

export function App() {
  const [formTrade, setFormTrade] = useState<Trade | undefined | null>(null);
  const [auditTrade, setAuditTrade] = useState<Trade | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ background: '#1e293b', color: '#f8fafc', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Trade Blotter</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Equity Trades</span>
      </header>
      <main style={{ flex: 1, padding: 16, overflow: 'hidden' }}>
        <TradeBlotter
          onAmend={(trade) => setFormTrade(trade)}
          onCreate={() => setFormTrade(undefined)}
          onViewAudit={(trade) => setAuditTrade(trade)}
        />
      </main>
      {formTrade !== null && (
        <TradeForm
          trade={formTrade ?? undefined}
          onClose={() => setFormTrade(null)}
        />
      )}
      {auditTrade && (
        <AuditPanel trade={auditTrade} onClose={() => setAuditTrade(null)} />
      )}
    </div>
  );
}
