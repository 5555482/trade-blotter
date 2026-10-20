import { Router } from 'express';
import { AuditService } from '../services/audit.service';
import { asyncHandler } from '../lib/async-handler';

export function createAuditRouter(auditService: AuditService): Router {
  const router = Router();

  router.get('/:tradeId', asyncHandler(async (req, res) => {
    res.json(await auditService.getHistory(req.params.tradeId as string));
  }));

  return router;
}
