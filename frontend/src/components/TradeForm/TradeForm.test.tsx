import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TradeForm } from './TradeForm';
import { ToastProvider } from '../../context/ToastContext';

const noop = vi.fn().mockResolvedValue(undefined);

function setup(props: Partial<React.ComponentProps<typeof TradeForm>> = {}) {
  const createTrade = vi.fn().mockResolvedValue({ id: 'TRD-100001' });
  const amendTrade  = vi.fn().mockResolvedValue({ id: 'TRD-100001' });
  const onClose     = vi.fn();

  render(
    <ToastProvider>
      <TradeForm
        onClose={onClose}
        createTrade={createTrade}
        amendTrade={amendTrade}
        isCreating={false}
        isAmending={false}
        {...props}
      />
    </ToastProvider>,
  );

  return { createTrade, amendTrade, onClose };
}

describe('TradeForm — new trade', () => {
  beforeEach(() => { noop.mockClear(); });

  it('renders "New Trade" heading when no trade prop is given', () => {
    setup();
    expect(screen.getByRole('heading', { name: /new trade/i })).toBeInTheDocument();
  });

  it('shows validation errors for all empty required fields on submit', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create Trade' }));

    await waitFor(() => {
      // Multiple "Required" errors should appear
      const errors = screen.getAllByText('Required');
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('shows "Must be positive" error when quantity is 0', async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('e.g. 1000'), { target: { value: '0' } });
    // Blur triggers per-field validation
    fireEvent.blur(screen.getByPlaceholderText('e.g. 1000'));
    await waitFor(() => {
      expect(screen.getByText('Must be positive')).toBeInTheDocument();
    });
  });

  it('does not call createTrade when the form is invalid', async () => {
    const { createTrade } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create Trade' }));
    await waitFor(() => screen.getAllByText('Required'));
    expect(createTrade).not.toHaveBeenCalled();
  });

  it('calls createTrade with correct values when form is fully filled', async () => {
    const { createTrade, onClose } = setup();

    // Symbol — first <select> in dialog
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'AAPL' } });
    // Side already defaults to BUY (index 1 = side select)
    fireEvent.change(screen.getByPlaceholderText('e.g. 1000'),  { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 145.50'), { target: { value: '145.50' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. JSMITH'), { target: { value: 'TUSER' } });
    fireEvent.change(selects[2], { target: { value: 'EQUITIES_UK' } });
    fireEvent.change(selects[3], { target: { value: 'Goldman Sachs' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Trade' }));

    await waitFor(() => expect(createTrade).toHaveBeenCalledTimes(1));
    const arg = createTrade.mock.calls[0][0];
    expect(arg.symbol).toBe('AAPL');
    expect(arg.quantity).toBe(500);
    expect(arg.price).toBe(145.5);
    expect(arg.trader).toBe('TUSER');
  });
});

describe('TradeForm — amend trade', () => {
  const existingTrade = {
    id: 'TRD-100001',
    symbol: 'AAPL',
    quantity: 500,
    price: 145.50,
    side: 'BUY' as const,
    trader: 'JSMITH',
    book: 'EQUITIES_UK',
    counterparty: 'Goldman Sachs',
    tradeTimestamp: '2026-10-01T09:00:00Z',
    status: 'ACTIVE' as const,
  };

  it('renders "Amend Trade" heading and shows trade ID', () => {
    setup({ trade: existingTrade });
    expect(screen.getByRole('heading', { name: /amend trade/i })).toBeInTheDocument();
    expect(screen.getByText('TRD-100001')).toBeInTheDocument();
  });

  it('calls onClose without calling amendTrade when no fields are changed', async () => {
    const { amendTrade, onClose } = setup({ trade: existingTrade });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(amendTrade).not.toHaveBeenCalled();
  });
});
