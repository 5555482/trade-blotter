import { PrismaClient } from '@prisma/client';
import { Trade, CreateTradeInput, AmendTradeInput, TradeSide, TradeStatus } from '../types';

function toTradeDTO(raw: {
  id: string; symbol: string; quantity: number; price: number;
  side: string; trader: string; book: string; counterparty: string;
  tradeTimestamp: Date; status: string;
}): Trade {
  return {
    id: raw.id,
    symbol: raw.symbol,
    quantity: raw.quantity,
    price: raw.price,
    side: raw.side as TradeSide,
    trader: raw.trader,
    book: raw.book,
    counterparty: raw.counterparty,
    tradeTimestamp: raw.tradeTimestamp.toISOString(),
    status: raw.status as TradeStatus,
  };
}

let idCounter = 100001;

function generateId(): string {
  return `TRD-${String(idCounter++).padStart(6, '0')}`;
}

export class TradeRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAll(): Promise<Trade[]> {
    const rows = await this.db.trade.findMany({ orderBy: { tradeTimestamp: 'desc' } });
    return rows.map(toTradeDTO);
  }

  async findById(id: string): Promise<Trade | null> {
    const row = await this.db.trade.findUnique({ where: { id } });
    return row ? toTradeDTO(row) : null;
  }

  async create(input: CreateTradeInput): Promise<Trade> {
    const row = await this.db.trade.create({
      data: {
        id: generateId(),
        ...input,
        tradeTimestamp: new Date(),
        status: 'ACTIVE',
      },
    });
    return toTradeDTO(row);
  }

  async update(id: string, data: Partial<AmendTradeInput & { status: TradeStatus }>): Promise<Trade> {
    const row = await this.db.trade.update({ where: { id }, data });
    return toTradeDTO(row);
  }
}
