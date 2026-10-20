import { Trade, TradeAudit, CreateTradeInput, AmendTradeInput } from '../types/trade';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error ?? 'Unknown error') as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const tradesApi = {
  getAll: (): Promise<Trade[]> =>
    fetch(`${BASE}/trades`).then(handleResponse<Trade[]>),

  getById: (id: string): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}`).then(handleResponse<Trade>),

  create: (input: CreateTradeInput): Promise<Trade> =>
    fetch(`${BASE}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handleResponse<Trade>),

  amend: (id: string, input: AmendTradeInput): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handleResponse<Trade>),

  cancel: (id: string): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}/cancel`, { method: 'POST' }).then(handleResponse<Trade>),

  getAudit: (tradeId: string): Promise<TradeAudit[]> =>
    fetch(`${BASE}/audit/${tradeId}`).then(handleResponse<TradeAudit[]>),
};
