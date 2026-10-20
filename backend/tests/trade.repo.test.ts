import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TradeRepository } from '../src/repositories/trade.repo';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

let repo: TradeRepository;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM "TradeAudit"');
  await prisma.$executeRawUnsafe('DELETE FROM "Trade"');
  repo = new TradeRepository(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('TradeRepository', () => {
  it('creates a trade and returns it', async () => {
    const trade = await repo.create({
      symbol: 'AAPL',
      quantity: 500,
      price: 227.45,
      side: 'BUY',
      trader: 'JSMITH',
      book: 'EQUITIES_UK',
      counterparty: 'Goldman Sachs',
    });
    expect(trade.symbol).toBe('AAPL');
    expect(trade.status).toBe('ACTIVE');
    expect(trade.id).toMatch(/^TRD-/);
  });

  it('findAll returns all trades', async () => {
    await repo.create({ symbol: 'MSFT', quantity: 100, price: 300, side: 'SELL', trader: 'ABROWN', book: 'EQUITIES_US', counterparty: 'JP Morgan' });
    await repo.create({ symbol: 'TSLA', quantity: 200, price: 350, side: 'BUY', trader: 'MJONES', book: 'TECH_GROWTH', counterparty: 'UBS' });
    const all = await repo.findAll();
    expect(all.length).toBe(2);
  });

  it('update amends a trade field', async () => {
    const created = await repo.create({ symbol: 'AAPL', quantity: 500, price: 227.45, side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs' });
    const updated = await repo.update(created.id, { quantity: 1000 });
    expect(updated.quantity).toBe(1000);
  });

  it('update can cancel a trade', async () => {
    const created = await repo.create({ symbol: 'AAPL', quantity: 500, price: 227.45, side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs' });
    const cancelled = await repo.update(created.id, { status: 'CANCELLED' });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('findById returns null for unknown id', async () => {
    const result = await repo.findById('TRD-999999');
    expect(result).toBeNull();
  });
});
