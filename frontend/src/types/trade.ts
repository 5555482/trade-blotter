export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'ACTIVE' | 'CANCELLED';
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
  action: string;
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

export interface AmendTradeInput {
  symbol?: string;
  quantity?: number;
  price?: number;
  side?: TradeSide;
  trader?: string;
  book?: string;
  counterparty?: string;
}
