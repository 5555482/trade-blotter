import { useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { GridReadyEvent, GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Trade } from '../../types/trade';
import { useTrades } from '../../hooks/useTrades';
import { colDefs } from './columnDefs';

interface Props {
  onAmend: (trade: Trade) => void;
  onCreate: () => void;
  onViewAudit: (trade: Trade) => void;
}

export function TradeBlotter({ onAmend, onCreate, onViewAudit }: Props) {
  const { trades, isLoading, error, refetch, cancelTrade, connected } = useTrades();
  const gridApiRef = useRef<GridApi | null>(null);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    gridApiRef.current = e.api;
  }, []);

  const actionColDef = {
    headerName: 'Actions',
    width: 220,
    pinned: 'right' as const,
    sortable: false,
    filter: false,
    cellRenderer: (params: { data: Trade }) => {
      const trade = params.data;
      if (!trade) return null;
      return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}>
          <button
            onClick={() => onAmend(trade)}
            disabled={trade.status === 'CANCELLED'}
            style={btnStyle(trade.status === 'CANCELLED')}
          >
            Amend
          </button>
          <button
            onClick={() => cancelTrade(trade.id).catch((err: Error) => alert(err.message))}
            disabled={trade.status === 'CANCELLED'}
            style={btnStyle(trade.status === 'CANCELLED', '#dc2626')}
          >
            Cancel
          </button>
          <button onClick={() => onViewAudit(trade)} style={btnStyle(false, '#6366f1')}>
            Audit
          </button>
        </div>
      );
    },
  };

  if (error) return <div style={{ color: 'red', padding: 16 }}>Failed to load trades: {String(error)}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>
        <button onClick={onCreate} style={btnStyle(false, '#16a34a')}>+ New Trade</button>
        <button onClick={() => refetch()} style={btnStyle(false)}>Refresh</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: connected ? '#16a34a' : '#dc2626' }}>
          {connected ? '● Live' : '○ Reconnecting...'}
        </span>
      </div>
      <div className="ag-theme-alpine" style={{ flex: 1 }}>
        {isLoading ? (
          <div style={{ padding: 16 }}>Loading...</div>
        ) : (
          <AgGridReact
            rowData={trades}
            columnDefs={[...colDefs, actionColDef]}
            onGridReady={onGridReady}
            defaultColDef={{ sortable: true, resizable: true, floatingFilter: true }}
            pagination
            paginationPageSize={50}
            rowHeight={36}
            animateRows
            getRowId={(p) => p.data.id}
          />
        )}
      </div>
    </div>
  );
}

function btnStyle(disabled: boolean, color = '#3b82f6'): React.CSSProperties {
  return {
    padding: '2px 8px', fontSize: 12, borderRadius: 4, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#e5e7eb' : color, color: disabled ? '#9ca3af' : '#fff',
  };
}
