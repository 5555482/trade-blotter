import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeService } from '../src/services/trade.service';
import { Trade } from '../src/types';

const mockActiveTrade: Trade = {
  id: 'TRD-100001', symbol: 'AAPL', quantity: 500, price: 227.45,
  side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs', tradeTimestamp: '2026-10-01T09:15:00Z', status: 'ACTIVE',
};

const mockCancelledTrade: Trade = { ...mockActiveTrade, status: 'CANCELLED' };

const mockRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockAudit = {
  record: vi.fn(),
  getHistory: vi.fn(),
};

let service: TradeService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new TradeService(mockRepo as any, mockAudit as any);
});

describe('TradeService.cancel', () => {
  it('cancels an active trade', async () => {
    mockRepo.findById.mockResolvedValue(mockActiveTrade);
    mockRepo.update.mockResolvedValue(mockCancelledTrade);
    const result = await service.cancel('TRD-100001');
    expect(result.status).toBe('CANCELLED');
    expect(mockAudit.record).toHaveBeenCalledWith('CANCEL', mockActiveTrade, mockCancelledTrade);
  });

  it('throws 409 when cancelling an already-cancelled trade', async () => {
    mockRepo.findById.mockResolvedValue(mockCancelledTrade);
    await expect(service.cancel('TRD-100001')).rejects.toMatchObject({
      message: expect.stringContaining('already cancelled'),
      statusCode: 409,
    });
  });

  it('throws 404 when trade does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.cancel('TRD-999999')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('TradeService.amend', () => {
  it('amends an active trade', async () => {
    const amended = { ...mockActiveTrade, quantity: 1000 };
    mockRepo.findById.mockResolvedValue(mockActiveTrade);
    mockRepo.update.mockResolvedValue(amended);
    const result = await service.amend('TRD-100001', { quantity: 1000 });
    expect(result.quantity).toBe(1000);
    expect(mockAudit.record).toHaveBeenCalledWith('AMEND', mockActiveTrade, amended);
  });

  it('throws 409 when amending a cancelled trade', async () => {
    mockRepo.findById.mockResolvedValue(mockCancelledTrade);
    await expect(service.amend('TRD-100001', { quantity: 1000 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('TradeService.create', () => {
  it('creates a new trade and records audit', async () => {
    mockRepo.create.mockResolvedValue(mockActiveTrade);
    const result = await service.create({
      symbol: 'AAPL', quantity: 500, price: 227.45, side: 'BUY',
      trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs',
    });
    expect(result.symbol).toBe('AAPL');
    expect(mockAudit.record).toHaveBeenCalledWith('CREATE', null, mockActiveTrade);
  });
});
