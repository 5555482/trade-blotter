import { memo, useEffect, useState } from 'react';
import { Trade, CreateTradeInput, AmendTradeInput, TradeSide } from '../../types/trade';
import { useToast } from '../../context/ToastContext';

interface Props {
  trade?: Trade;
  onClose: () => void;
  createTrade: (input: CreateTradeInput) => Promise<Trade>;
  amendTrade: (args: { id: string; input: AmendTradeInput }) => Promise<Trade>;
  isCreating: boolean;
  isAmending: boolean;
}

const SYMBOLS       = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BABA'];
const BOOKS         = ['EQUITIES_UK', 'EQUITIES_US', 'TECH_GROWTH', 'EMERGING_MKTS', 'FIXED_INCOME'];
const COUNTERPARTIES = ['Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Barclays', 'Deutsche Bank', 'UBS', 'Citi'];

type FormErrors = Partial<Record<string, string>>;

function validate(v: Partial<CreateTradeInput>): FormErrors {
  const e: FormErrors = {};
  if (!v.symbol)             e.symbol       = 'Required';
  if (!v.quantity || v.quantity <= 0)  e.quantity = 'Must be positive';
  if (!v.price    || v.price    <= 0)  e.price    = 'Must be positive';
  if (!v.side)               e.side         = 'Required';
  if (!v.trader?.trim())     e.trader       = 'Required';
  if (!v.book)               e.book         = 'Required';
  if (!v.counterparty)       e.counterparty = 'Required';
  return e;
}

export const TradeForm = memo(function TradeForm({ trade, onClose, createTrade, amendTrade, isCreating, isAmending }: Props) {
  const isEdit  = !!trade;
  const isBusy  = isCreating || isAmending;
  const toast   = useToast();

  const [values, setValues] = useState<Partial<CreateTradeInput>>({
    symbol:       trade?.symbol       ?? '',
    quantity:     trade?.quantity,
    price:        trade?.price,
    side:         trade?.side         ?? 'BUY',
    trader:       trade?.trader       ?? '',
    book:         trade?.book         ?? '',
    counterparty: trade?.counterparty ?? '',
  });
  const [errors,      setErrors]      = useState<FormErrors>({});
  const [touched,     setTouched]     = useState<Partial<Record<string, boolean>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isBusy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isBusy]);

  const set = (key: keyof CreateTradeInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.type === 'number' ? parseFloat(e.target.value) || undefined : e.target.value;
      setValues(prev => ({ ...prev, [key]: val }));
      if (touched[key]) {
        const errs = validate({ ...values, [key]: val });
        setErrors(prev => ({ ...prev, [key]: errs[key] }));
      }
    };

  const blur = (key: string) => () => {
    setTouched(prev => ({ ...prev, [key]: true }));
    if (!isEdit) {
      const errs = validate(values);
      setErrors(prev => ({ ...prev, [key]: errs[key] }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit) {
      const errs = validate(values);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        setTouched(Object.fromEntries(Object.keys(errs).map(k => [k, true])));
        return;
      }
    }

    try {
      setSubmitError(null);
      if (isEdit) {
        const changes: AmendTradeInput = {};
        if (values.symbol       !== trade.symbol)       changes.symbol       = values.symbol;
        if (values.quantity     !== trade.quantity)     changes.quantity     = values.quantity;
        if (values.price        !== trade.price)        changes.price        = values.price;
        if (values.side         !== trade.side)         changes.side         = values.side as TradeSide;
        if (values.trader       !== trade.trader)       changes.trader       = values.trader;
        if (values.book         !== trade.book)         changes.book         = values.book;
        if (values.counterparty !== trade.counterparty) changes.counterparty = values.counterparty;
        if (Object.keys(changes).length === 0) { onClose(); return; }
        await amendTrade({ id: trade.id, input: changes });
        toast('success', 'Trade amended', trade.id);
      } else {
        const created = await createTrade(values as CreateTradeInput);
        toast('success', 'Trade created', created.id);
      }
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const fieldError = (key: string) => touched[key] && errors[key];

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-title"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose(); }}
    >
      <div className="modal">
        <div className="modal__header">
          <div>
            <h2 id="form-title" className="modal__title">
              {isEdit ? 'Amend Trade' : 'New Trade'}
            </h2>
            {isEdit && <div className="modal__subtitle">{trade.id}</div>}
          </div>
          <button className="modal__close-btn" onClick={onClose} disabled={isBusy} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body">
            <div className="form-section-label">Instrument</div>
            <div className="form-row">
              <Field label="Symbol" required error={fieldError('symbol')}>
                <select
                  className={`form-control${fieldError('symbol') ? ' form-control--err' : ''}`}
                  value={values.symbol}
                  onChange={set('symbol')}
                  onBlur={blur('symbol')}
                  autoFocus
                >
                  <option value="">Select symbol…</option>
                  {SYMBOLS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>

              <Field label="Side" required error={fieldError('side')}>
                <select
                  className={`form-control${fieldError('side') ? ' form-control--err' : ''}`}
                  value={values.side}
                  onChange={set('side')}
                  onBlur={blur('side')}
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </Field>
            </div>

            <div className="form-row">
              <Field label="Quantity" required error={fieldError('quantity')}>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={`form-control${fieldError('quantity') ? ' form-control--err' : ''}`}
                  value={values.quantity ?? ''}
                  onChange={set('quantity')}
                  onBlur={blur('quantity')}
                  placeholder="e.g. 1000"
                />
              </Field>

              <Field label="Price (USD)" required error={fieldError('price')}>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className={`form-control${fieldError('price') ? ' form-control--err' : ''}`}
                  value={values.price ?? ''}
                  onChange={set('price')}
                  onBlur={blur('price')}
                  placeholder="e.g. 145.50"
                />
              </Field>
            </div>

            <div className="form-section-label">Parties</div>
            <Field label="Trader ID" required error={fieldError('trader')}>
              <input
                className={`form-control${fieldError('trader') ? ' form-control--err' : ''}`}
                value={values.trader ?? ''}
                onChange={set('trader')}
                onBlur={blur('trader')}
                placeholder="e.g. JSMITH"
                maxLength={20}
              />
            </Field>

            <div className="form-row">
              <Field label="Book" required error={fieldError('book')}>
                <select
                  className={`form-control${fieldError('book') ? ' form-control--err' : ''}`}
                  value={values.book}
                  onChange={set('book')}
                  onBlur={blur('book')}
                >
                  <option value="">Select book…</option>
                  {BOOKS.map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>

              <Field label="Counterparty" required error={fieldError('counterparty')}>
                <select
                  className={`form-control${fieldError('counterparty') ? ' form-control--err' : ''}`}
                  value={values.counterparty}
                  onChange={set('counterparty')}
                  onBlur={blur('counterparty')}
                >
                  <option value="">Select party…</option>
                  {COUNTERPARTIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            {submitError && (
              <div style={{
                marginTop: 12, padding: '9px 12px',
                background: 'var(--c-error-bg)', border: '1px solid #fecaca',
                borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--c-error)',
              }}>
                {submitError}
              </div>
            )}
          </div>

          <div className="modal__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isBusy}>
              Discard
            </button>
            <button type="submit" className="btn btn-primary" disabled={isBusy}>
              {isBusy ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin .7s linear infinite', fontSize: 12 }}>⟳</span>
                  {isEdit ? 'Saving…' : 'Creating…'}
                </>
              ) : (
                isEdit ? 'Save Changes' : 'Create Trade'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string | false | undefined; children: React.ReactNode }) {
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' form-label--req' : ''}`}>{label}</label>
      {children}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
