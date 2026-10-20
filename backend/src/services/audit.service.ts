import { AuditRepository } from '../repositories/audit.repo';
import { Trade, TradeAudit } from '../types';

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(action: string, before: Trade | null, after: Trade): Promise<void> {
    await this.repo.append(after.id, action, before, after);
  }

  async getHistory(tradeId: string): Promise<TradeAudit[]> {
    return this.repo.findByTradeId(tradeId);
  }
}
