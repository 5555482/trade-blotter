import { TradeRepository } from '../repositories/trade.repo';
import { AuditService } from './audit.service';
import { Trade, CreateTradeInput, AmendTradeInput } from '../types';

function httpError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export class TradeService {
  constructor(
    private readonly repo: TradeRepository,
    private readonly audit: AuditService,
  ) {}

  async getAll(): Promise<Trade[]> {
    return this.repo.findAll();
  }

  async getById(id: string): Promise<Trade> {
    const trade = await this.repo.findById(id);
    if (!trade) throw httpError(`Trade ${id} not found`, 404);
    return trade;
  }

  async create(input: CreateTradeInput): Promise<Trade> {
    const trade = await this.repo.create(input);
    await this.audit.record('CREATE', null, trade);
    return trade;
  }

  async amend(id: string, input: AmendTradeInput): Promise<Trade> {
    const before = await this.getById(id);
    if (before.status === 'CANCELLED') {
      throw httpError(`Trade ${id} is cancelled and cannot be amended`, 409);
    }
    const after = await this.repo.update(id, input);
    await this.audit.record('AMEND', before, after);
    return after;
  }

  async cancel(id: string): Promise<Trade> {
    const before = await this.getById(id);
    if (before.status === 'CANCELLED') {
      throw httpError(`Trade ${id} is already cancelled`, 409);
    }
    const after = await this.repo.update(id, { status: 'CANCELLED' });
    await this.audit.record('CANCEL', before, after);
    return after;
  }
}
