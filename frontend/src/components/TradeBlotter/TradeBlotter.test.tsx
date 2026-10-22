import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TradeBlotter } from './TradeBlotter';
import { ToastProvider } from '../../context/ToastContext';
import { Trade } from '../../types/trade';

vi.mock('ag-grid-react', () => ({ AgGridReact: vi.fn().mockReturnValue(null) }));
vi.mock('ag-grid-community/styles/ag-grid.css', () => ({}));
vi.mock('ag-grid-community/styles/ag-theme-alpine.css', () => ({}));

const activeTrade: Trade = {
  id: 'TRD-100001',
  symbol: 'AAPL',
  quantity: 1000,
  price: 150,
  side: 'BUY',
  trader: 'JSMITH',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-10-01T09:00:00Z',
  status: 'ACTIVE',
};

const cancelledTrade: Trade = { ...activeTrade, id: 'TRD-100002', status: 'CANCELLED' };

function setup(props: Partial<React.ComponentProps<typeof TradeBlotter>> = {}) {
  const onCreate    = vi.fn();
  const refetch     = vi.fn();
  const cancelTrade = vi.fn().mockResolvedValue(activeTrade);
  const onAmend     = vi.fn();
  const onViewAudit = vi.fn();

  const { container } = render(
    <ToastProvider>
      <TradeBlotter
        trades={[activeTrade]}
        totalTrades={1}
        isLoading={false}
        error={null}
        refetch={refetch}
        cancelTrade={cancelTrade}
        onAmend={onAmend}
        onCreate={onCreate}
        onViewAudit={onViewAudit}
        {...props}
      />
    </ToastProvider>,
  );

  return { onCreate, refetch, cancelTrade, onAmend, onViewAudit, container };
}

describe('TradeBlotter — toolbar', () => {
  it('calls onCreate when New Trade is clicked', () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByRole('button', { name: /new trade/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('calls refetch when Refresh is clicked', () => {
    const { refetch } = setup();
    fireEvent.click(screen.getByRole('button', { name: /↻ Refresh/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows Showing count in toolbar', () => {
    setup({ trades: [activeTrade], totalTrades: 50 });
    expect(screen.getByText('1 of 50')).toBeInTheDocument();
  });

  it('shows formatted notional for active trades', () => {
    // activeTrade: 1000 × $150 = $150,000 → $150K
    setup({ trades: [activeTrade, cancelledTrade], totalTrades: 2 });
    expect(screen.getByText('$150K')).toBeInTheDocument();
  });

  it('shows active trade count (excludes cancelled)', () => {
    setup({ trades: [activeTrade, cancelledTrade], totalTrades: 2 });
    // 1 active, 1 cancelled → active count = 1
    expect(screen.getByText('2 of 2')).toBeInTheDocument(); // Showing stat
    // Active value span contains '1'
    const activeValueEl = screen.getAllByText('1');
    expect(activeValueEl.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TradeBlotter — states', () => {
  it('shows error message and retry button when error is given', () => {
    setup({ error: new Error('Network error'), trades: [] });
    expect(screen.getByText('Failed to load trades')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls refetch when retry button is clicked in error state', () => {
    const { refetch } = setup({ error: new Error('fail'), trades: [] });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when there are no trades', () => {
    setup({ trades: [], totalTrades: 0 });
    expect(screen.getByText('No trades yet')).toBeInTheDocument();
  });

  it('renders loading shimmer while isLoading is true', () => {
    const { container } = setup({ isLoading: true });
    expect(container.querySelector('.loading-shimmer')).toBeInTheDocument();
  });

  it('does not show cancel confirm dialog on initial render', () => {
    setup();
    expect(screen.queryByText('Keep')).not.toBeInTheDocument();
  });
});
