import { ColDef } from 'ag-grid-community';
import { Trade } from '../../types/trade';
import { formatDate, formatPrice, formatQuantity, formatNotional } from '../../utils/formatters';

function badge(cls: string, label: string): HTMLElement {
  const el = document.createElement('span');
  el.className = `badge badge-${cls}`;
  el.textContent = label;
  return el;
}

export const colDefs: ColDef<Trade>[] = [
  {
    field: 'id',
    headerName: 'Trade ID',
    width: 128,
    pinned: 'left',
    filter: 'agTextColumnFilter',
    cellClass: 'col-mono',
  },
  {
    field: 'symbol',
    headerName: 'Symbol',
    width: 95,
    filter: 'agTextColumnFilter',
    cellStyle: { fontWeight: 600 },
  },
  {
    field: 'side',
    headerName: 'Side',
    width: 88,
    filter: 'agTextColumnFilter',
    cellRenderer: (params: { value: string }) =>
      badge(params.value === 'BUY' ? 'buy' : 'sell', params.value),
  },
  {
    field: 'quantity',
    headerName: 'Qty',
    width: 108,
    valueFormatter: (p) => formatQuantity(p.value as number),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
    cellClass: 'col-mono',
  },
  {
    field: 'price',
    headerName: 'Price',
    width: 110,
    valueFormatter: (p) => formatPrice(p.value as number),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
    cellClass: 'col-mono',
  },
  {
    headerName: 'Notional',
    width: 120,
    valueGetter: (p: { data?: Trade }) => (p.data ? p.data.price * p.data.quantity : 0),
    valueFormatter: (p: { value: number }) => formatNotional(p.value),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
    cellClass: 'col-mono',
  },
  { field: 'trader',       headerName: 'Trader',       width: 105, filter: 'agTextColumnFilter' },
  { field: 'book',         headerName: 'Book',         width: 138, filter: 'agTextColumnFilter' },
  { field: 'counterparty', headerName: 'Counterparty', width: 148, filter: 'agTextColumnFilter' },
  {
    field: 'tradeTimestamp',
    headerName: 'Timestamp',
    width: 170,
    valueFormatter: (p) => formatDate(p.value as string),
    sort: 'desc',
    cellClass: 'col-mono',
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 108,
    filter: 'agTextColumnFilter',
    cellRenderer: (params: { value: string }) =>
      badge(params.value === 'ACTIVE' ? 'active' : 'cancelled', params.value),
  },
];
