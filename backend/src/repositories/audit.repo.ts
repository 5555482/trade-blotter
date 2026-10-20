import { PrismaClient } from '@prisma/client';
import { Trade, TradeAudit, AuditAction } from '../types';

export class AuditRepository {
  constructor(private readonly db: PrismaClient) {}

  async append(tradeId: string, action: AuditAction, before: Trade | null, after: Trade): Promise<void> {
    await this.db.tradeAudit.create({
      data: {
        tradeId,
        action,
        before: before ? JSON.stringify(before) : null,
        after: JSON.stringify(after),
      },
    });
  }

  async findByTradeId(tradeId: string): Promise<TradeAudit[]> {
    const rows = await this.db.tradeAudit.findMany({
      where: { tradeId },
      orderBy: { changedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      tradeId: r.tradeId,
      action: r.action as AuditAction,
      before: r.before ? (JSON.parse(r.before) as Trade) : null,
      after: JSON.parse(r.after) as Trade,
      changedAt: r.changedAt.toISOString(),
    }));
  }
}
