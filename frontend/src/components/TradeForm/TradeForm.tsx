import { useState } from 'react';
import { Trade, CreateTradeInput, AmendTradeInput, TradeSide } from '../../types/trade';
import { useTrades } from '../../hooks/useTrades';

interface Props {
  trade?: Trade;
  onClose: () => void;
}

const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BABA'];
const BOOKS = ['EQUITIES_UK', 'EQUITIES_US', 'TECH_GROWTH', 'EMERGING_MKTS', 'FIXED_INCOME'];
const COUNTERPARTIES = ['Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Barclays', 'Deutsche Bank', 'UBS', 'Citi'];

type FormErrors = Partial<Record<string, string>>;

function validate(values: Partial<CreateTradeInput>): FormErrors {
  const errors: FormErrors = {};
  if (!values.symbol) errors.symbol = 'Symbol is required';
  if (!values.quantity || values.quantity <= 0) errors.quantity = 'Quantity must be positive';
  if (!values.price || values.price <= 0) errors.price = 'Price must be positive';
  if (!values.side) errors.side = 'Side is required';
  if (!values.trader?.trim()) errors.trader = 'Trader is required';
  if (!values.book) errors.book = 'Book is required';
  if (!values.counterparty) errors.counterparty = 'Counterparty is required';
  return errors;
}

export function TradeForm({ trade, onClose }: Props) {
  const { createTrade, amendTrade, isCreating, isAmending } = useTrades();
  const isEdit = !!trade;

  const [values, setValues] = useState<Partial<CreateTradeInput>>({
    symbol: trade?.symbol ?? '',
    quantity: trade?.quantity,
    price: trade?.price,
    side: trade?.side ?? 'BUY',
    trader: trade?.trader ?? '',
    book: trade?.book ?? '',
    counterparty: trade?.counterparty ?? '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (key: keyof CreateTradeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = isEdit ? {} : validate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    try {
      if (isEdit) {
        const changes: AmendTradeInput = {};
        if (values.symbol !== trade.symbol) changes.symbol = values.symbol;
        if (values.quantity !== trade.quantity) changes.quantity = values.quantity;
        if (values.price !== trade.price) changes.price = values.price;
        if (values.side !== trade.side) changes.side = values.side as TradeSide;
        if (values.trader !== trade.trader) changes.trader = values.trader;
        if (values.book !== trade.book) changes.book = values.book;
        if (values.counterparty !== trade.counterparty) changes.counterparty = values.counterparty;
        if (Object.keys(changes).length === 0) { onClose(); return; }
        await amendTrade({ id: trade.id, input: changes });
      } else {
        await createTrade(values as CreateTradeInput);
      }
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>{isEdit ? `Amend ${trade.id}` : 'New Trade'}</h2>
        <form onSubmit={handleSubmit}>
          <Field label="Symbol" error={errors.symbol}>
            <select value={values.symbol} onChange={set('symbol')} style={inputStyle}>
              <option value="">Select...</option>
              {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Side" error={errors.side}>
            <select value={values.side} onChange={set('side')} style={inputStyle}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </Field>
          <Field label="Quantity" error={errors.quantity}>
            <input type="number" min={1} value={values.quantity ?? ''} onChange={set('quantity')} style={inputStyle} />
          </Field>
          <Field label="Price" error={errors.price}>
            <input type="number" min={0.01} step={0.01} value={values.price ?? ''} onChange={set('price')} style={inputStyle} />
          </Field>
          <Field label="Trader" error={errors.trader}>
            <input value={values.trader ?? ''} onChange={set('trader')} style={inputStyle} placeholder="e.g. JSMITH" />
          </Field>
          <Field label="Book" error={errors.book}>
            <select value={values.book} onChange={set('book')} style={inputStyle}>
              <option value="">Select...</option>
              {BOOKS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Counterparty" error={errors.counterparty}>
            <select value={values.counterparty} onChange={set('counterparty')} style={inputStyle}>
              <option value="">Select...</option>
              {COUNTERPARTIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          {submitError && <p style={{ color: '#dc2626', fontSize: 13 }}>{submitError}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={isCreating || isAmending} style={{ ...btnBase, background: '#3b82f6', color: '#fff' }}>
              {isCreating || isAmending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{label}</label>
      {children}
      {error && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 420,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', border: '1px solid #d1d5db',
  borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
};
const btnBase: React.CSSProperties = {
  padding: '8px 16px', border: 'none', borderRadius: 4,
  cursor: 'pointer', fontSize: 14, fontWeight: 500,
};
