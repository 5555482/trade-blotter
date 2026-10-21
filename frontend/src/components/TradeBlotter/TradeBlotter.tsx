import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Trade } from '../../types/trade';
import { colDefs } from './columnDefs';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { formatLargeNotional } from '../../utils/formatters';

interface Props {
  trades: Trade[];
  totalTrades: number;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  cancelTrade: (id: string) => Promise<Trade>;
  onAmend: (trade: Trade) => void;
  onCreate: () => void;
  onViewAudit: (trade: Trade) => void;
}

export const TradeBlotter = memo(function TradeBlotter({
  trades, totalTrades, isLoading, error, refetch, cancelTrade,
  onAmend, onCreate, onViewAudit,
}: Props) {
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const toast  = useToast();
  const gridRef = useRef<AgGridReact<Trade>>(null);

  const handleExportCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `trades_${new Date().toISOString().slice(0, 10)}.csv`,
    });
  }, []);

  const activeTrades  = useMemo(() => trades.filter(t => t.status === 'ACTIVE'), [trades]);
  const totalNotional = useMemo(
    () => activeTrades.reduce((sum, t) => sum + t.price * t.quantity, 0),
    [activeTrades],
  );

  const handleCancelConfirmed = useCallback(async () => {
    const id = pendingCancelId!;
    setPendingCancelId(null);
    try {
      await cancelTrade(id);
      toast('success', 'Trade cancelled', id);
    } catch (err) {
      toast('error', 'Cancel failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [pendingCancelId, cancelTrade, toast]);

  const handleCancelAbort = useCallback(() => setPendingCancelId(null), []);

  const actionColDef = useMemo(() => ({
    headerName: 'Actions',
    width: 210,
    pinned: 'right' as const,
    sortable: false,
    filter: false,
    resizable: false,
    cellRenderer: (params: { data: Trade }) => {
      const trade = params.data;
      if (!trade) return null;
      const cancelled = trade.status === 'CANCELLED';
      return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onAmend(trade)}
            disabled={cancelled}
            title="Amend trade"
          >
            Amend
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => setPendingCancelId(trade.id)}
            disabled={cancelled}
            title="Cancel trade"
          >
            Cancel
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => onViewAudit(trade)}
            title="View audit trail"
            style={{ color: '#6366f1', borderColor: '#c7d2fe' }}
          >
            Audit
          </button>
        </div>
      );
    },
  }), [onAmend, onViewAudit]);

  if (error) {
    return (
      <div className="blotter-card">
        <div className="empty-state">
          <div className="empty-state__icon">⚠</div>
          <div className="empty-state__title">Failed to load trades</div>
          <div className="empty-state__desc">{String(error)}</div>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="blotter-card">
        {isLoading && <div className="loading-shimmer" />}

        <div className="blotter-toolbar">
          <button className="btn btn-success" onClick={onCreate}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New Trade
          </button>
          <div className="blotter-toolbar__divider" />
          <button className="btn btn-ghost" onClick={refetch} title="Refresh data">
            ↻ Refresh
          </button>
          <button className="btn btn-ghost" onClick={handleExportCsv} title="Export current view to CSV">
            ↓ CSV
          </button>

          <div className="blotter-toolbar__spacer" />

          <div className="blotter-toolbar__meta">
            <span className="blotter-toolbar__meta-item">
              Active
              <span className="blotter-toolbar__meta-value">{activeTrades.length}</span>
            </span>
            <span className="blotter-toolbar__meta-item">
              Notional
              <span className="blotter-toolbar__meta-value">{formatLargeNotional(totalNotional)}</span>
            </span>
            <span className="blotter-toolbar__meta-item">
              Showing
              <span className="blotter-toolbar__meta-value">{trades.length} of {totalTrades}</span>
            </span>
          </div>
        </div>

        <div className="ag-theme-alpine" style={{ flex: 1 }}>
          {!isLoading && trades.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📋</div>
              <div className="empty-state__title">No trades yet</div>
              <div className="empty-state__desc">Click "New Trade" to add your first trade.</div>
            </div>
          ) : (
            <AgGridReact<Trade>
              ref={gridRef}
              rowData={trades}
              columnDefs={[...colDefs, actionColDef]}
              defaultColDef={{ sortable: true, resizable: true, floatingFilter: true }}
              getRowClass={(p) => p.data?.status === 'CANCELLED' ? 'ag-row-cancelled' : ''}
              getRowId={(p) => p.data.id}
              // Windowing / virtualisation
              rowBuffer={15}
              suppressColumnVirtualisation={false}
              suppressScrollOnNewData={true}
              debounceVerticalScrollbar={true}
              // Layout
              pagination
              paginationPageSize={50}
              rowHeight={34}
              headerHeight={34}
              floatingFiltersHeight={30}
              animateRows
            />
          )}
        </div>
      </div>

      {pendingCancelId && (
        <ConfirmDialog
          title="Cancel Trade"
          message={
            <>
              Are you sure you want to cancel{' '}
              <span className="confirm__id">{pendingCancelId}</span>?{' '}
              This action cannot be undone.
            </>
          }
          confirmLabel="Cancel Trade"
          cancelLabel="Keep"
          onConfirm={handleCancelConfirmed}
          onCancel={handleCancelAbort}
        />
      )}
    </>
  );
});
