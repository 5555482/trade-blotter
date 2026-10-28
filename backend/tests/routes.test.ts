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

let authHeader: string;

beforeAll(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM "TradeAudit"');
  await prisma.$executeRawUnsafe('DELETE FROM "Trade"');

  // Obtain a JWT for the test admin user
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'password' });
  authHeader = `Bearer ${res.body.token as string}`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /health', () => {
  it('returns status ok and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when no token is sent to a protected route', async () => {
    const res = await request(app).get('/api/trades');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/trades', () => {
  it('returns paginated response shape', async () => {
    const res = await request(app).get('/api/trades').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('pageSize', 100);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('respects ?pageSize query param', async () => {
    await request(app).post('/api/trades').set('Authorization', authHeader).send({
      symbol: 'AAPL', quantity: 100, price: 150, side: 'BUY',
      trader: 'TUSER', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs',
    });
    const res = await request(app).get('/api/trades?pageSize=1').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pageSize).toBe(1);
  });
});

describe('POST /api/trades', () => {
  it('creates a trade with valid body', async () => {
    const res = await request(app).post('/api/trades').set('Authorization', authHeader).send({
      symbol: 'AAPL', quantity: 500, price: 227.45,
      side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs',
    });
    expect(res.status).toBe(201);
    expect(res.body.symbol).toBe('AAPL');
    expect(res.body.status).toBe('ACTIVE');
  });

  it('returns 400 with invalid body', async () => {
    const res = await request(app).post('/api/trades').set('Authorization', authHeader).send({ symbol: 'AAPL' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/trades/:id/cancel', () => {
  it('cancels an active trade', async () => {
    const created = await request(app).post('/api/trades').set('Authorization', authHeader).send({
      symbol: 'MSFT', quantity: 100, price: 300, side: 'SELL',
      trader: 'ABROWN', book: 'EQUITIES_US', counterparty: 'JP Morgan',
    });
    const res = await request(app)
      .post(`/api/trades/${created.body.id}/cancel`)
      .set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('returns 409 when cancelling already-cancelled trade', async () => {
    const created = await request(app).post('/api/trades').set('Authorization', authHeader).send({
      symbol: 'TSLA', quantity: 200, price: 350, side: 'BUY',
      trader: 'MJONES', book: 'TECH_GROWTH', counterparty: 'UBS',
    });
    await request(app).post(`/api/trades/${created.body.id}/cancel`).set('Authorization', authHeader);
    const res = await request(app)
      .post(`/api/trades/${created.body.id}/cancel`)
      .set('Authorization', authHeader);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/trades/:id', () => {
  it('amends an active trade', async () => {
    const created = await request(app).post('/api/trades').set('Authorization', authHeader).send({
      symbol: 'NVDA', quantity: 300, price: 450, side: 'BUY',
      trader: 'SDAVIS', book: 'TECH_GROWTH', counterparty: 'Barclays',
    });
    const res = await request(app)
      .patch(`/api/trades/${created.body.id}`)
      .set('Authorization', authHeader)
      .send({ quantity: 600 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(600);
  });

  it('returns 409 when amending a cancelled trade', async () => {
    const created = await request(app).post('/api/trades').set('Authorization', authHeader).send({
      symbol: 'META', quantity: 150, price: 520, side: 'SELL',
      trader: 'LTAYLOR', book: 'EQUITIES_US', counterparty: 'Citi',
    });
    await request(app).post(`/api/trades/${created.body.id}/cancel`).set('Authorization', authHeader);
    const res = await request(app)
      .patch(`/api/trades/${created.body.id}`)
      .set('Authorization', authHeader)
      .send({ quantity: 200 });
    expect(res.status).toBe(409);
  });
});
