import { ColDef } from 'ag-grid-community';
import { Trade } from '../../types/trade';
import { formatDate, formatPrice, formatQuantity } from '../../utils/formatters';

export const colDefs: ColDef<Trade>[] = [
  { field: 'id', headerName: 'Trade ID', width: 130, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'symbol', headerName: 'Symbol', width: 100, filter: 'agTextColumnFilter' },
  {
    field: 'side', headerName: 'Side', width: 90,
    cellStyle: (params) => ({
      color: params.value === 'BUY' ? '#16a34a' : '#dc2626',
      fontWeight: 600,
    }),
    filter: 'agTextColumnFilter',
  },
  {
    field: 'quantity', headerName: 'Quantity', width: 120,
    valueFormatter: (p) => formatQuantity(p.value as number),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
  },
  {
    field: 'price', headerName: 'Price', width: 100,
    valueFormatter: (p) => formatPrice(p.value as number),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
  },
  { field: 'trader', headerName: 'Trader', width: 110, filter: 'agTextColumnFilter' },
  { field: 'book', headerName: 'Book', width: 140, filter: 'agTextColumnFilter' },
  { field: 'counterparty', headerName: 'Counterparty', width: 150, filter: 'agTextColumnFilter' },
  {
    field: 'tradeTimestamp', headerName: 'Timestamp', width: 180,
    valueFormatter: (p) => formatDate(p.value as string),
    sort: 'desc',
  },
  {
    field: 'status', headerName: 'Status', width: 110,
    cellStyle: (params) => ({
      color: params.value === 'ACTIVE' ? '#16a34a' : '#6b7280',
    }),
    filter: 'agTextColumnFilter',
  },
];
