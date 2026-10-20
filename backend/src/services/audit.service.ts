import { AuditRepository } from '../repositories/audit.repo';
import { Trade, TradeAudit, AuditAction } from '../types';

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(action: AuditAction, before: Trade | null, after: Trade): Promise<void> {
    await this.repo.append(after.id, action, before, after);
  }

  async getHistory(tradeId: string): Promise<TradeAudit[]> {
    return this.repo.findByTradeId(tradeId);
  }
}
