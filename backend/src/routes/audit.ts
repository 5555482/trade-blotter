import { Router } from 'express';
import { AuditService } from '../services/audit.service';
import { asyncHandler } from '../lib/async-handler';

const TRADE_ID_RE = /^TRD-\d{6}$/;

export function createAuditRouter(auditService: AuditService): Router {
  const router = Router();

  router.get('/:tradeId', asyncHandler(async (req, res) => {
    if (!TRADE_ID_RE.test(req.params.tradeId)) { res.status(400).json({ error: 'Invalid trade ID format' }); return; }
    res.json(await auditService.getHistory(req.params.tradeId));
  }));

  return router;
}
