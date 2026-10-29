import { Trade, TradeAudit, CreateTradeInput, AmendTradeInput, PagedTrades } from '../types/trade';

const BASE = '/api';

let _token: string | null = null;
export function setAuthToken(token: string | null) { _token = token; }

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    ...extra,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error((body as { error?: string }).error ?? 'Unknown error') as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const tradesApi = {
  getAll: (page = 1, pageSize = 100): Promise<PagedTrades> =>
    fetch(`${BASE}/trades?page=${page}&pageSize=${pageSize}`, { headers: authHeaders() })
      .then(handleResponse<PagedTrades>),

  getById: (id: string): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}`, { headers: authHeaders() }).then(handleResponse<Trade>),

  create: (input: CreateTradeInput): Promise<Trade> =>
    fetch(`${BASE}/trades`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }).then(handleResponse<Trade>),

  amend: (id: string, input: AmendTradeInput): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }).then(handleResponse<Trade>),

  cancel: (id: string): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}/cancel`, {
      method: 'POST',
      headers: authHeaders(),
    }).then(handleResponse<Trade>),

  getAudit: (tradeId: string): Promise<TradeAudit[]> =>
    fetch(`${BASE}/audit/${tradeId}`, { headers: authHeaders() })
      .then(handleResponse<TradeAudit[]>),
};
