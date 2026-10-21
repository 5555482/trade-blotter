export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'ACTIVE' | 'CANCELLED';
export type AuditAction = 'CREATE' | 'AMEND' | 'CANCEL';
export type WsEventType = 'TRADE_CREATED' | 'TRADE_AMENDED' | 'TRADE_CANCELLED';

export interface Trade {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: string;
  status: TradeStatus;
}

export interface TradeAudit {
  id: string;
  tradeId: string;
  action: AuditAction;
  before: Trade | null;
  after: Trade;
  changedAt: string;
}

export interface WsEvent {
  type: WsEventType;
  payload: Trade;
}

export interface CreateTradeInput {
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  book: string;
  counterparty: string;
}

export type AmendTradeInput = Partial<CreateTradeInput>;

export interface PagedTrades {
  data: Trade[];
  total: number;
  page: number;
  pageSize: number;
}
