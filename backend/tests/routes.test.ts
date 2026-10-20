import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';
import { Broadcaster } from '../src/websocket/broadcaster';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

const broadcaster = new Broadcaster();
const app = createApp(prisma, broadcaster);

beforeAll(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM "TradeAudit"');
  await prisma.$executeRawUnsafe('DELETE FROM "Trade"');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/trades', () => {
  it('creates a trade with valid body', async () => {
    const res = await request(app).post('/api/trades').send({
      symbol: 'AAPL', quantity: 500, price: 227.45,
      side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs',
    });
    expect(res.status).toBe(201);
    expect(res.body.symbol).toBe('AAPL');
    expect(res.body.status).toBe('ACTIVE');
  });

  it('returns 400 with invalid body', async () => {
    const res = await request(app).post('/api/trades').send({ symbol: 'AAPL' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/trades/:id/cancel', () => {
  it('cancels an active trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'MSFT', quantity: 100, price: 300, side: 'SELL',
      trader: 'ABROWN', book: 'EQUITIES_US', counterparty: 'JP Morgan',
    });
    const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('returns 409 when cancelling already-cancelled trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'TSLA', quantity: 200, price: 350, side: 'BUY',
      trader: 'MJONES', book: 'TECH_GROWTH', counterparty: 'UBS',
    });
    await request(app).post(`/api/trades/${created.body.id}/cancel`);
    const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/trades/:id', () => {
  it('amends an active trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'NVDA', quantity: 300, price: 450, side: 'BUY',
      trader: 'SDAVIS', book: 'TECH_GROWTH', counterparty: 'Barclays',
    });
    const res = await request(app).patch(`/api/trades/${created.body.id}`).send({ quantity: 600 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(600);
  });

  it('returns 409 when amending a cancelled trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'META', quantity: 150, price: 520, side: 'SELL',
      trader: 'LTAYLOR', book: 'EQUITIES_US', counterparty: 'Citi',
    });
    await request(app).post(`/api/trades/${created.body.id}/cancel`);
    const res = await request(app).patch(`/api/trades/${created.body.id}`).send({ quantity: 200 });
    expect(res.status).toBe(409);
  });
});
