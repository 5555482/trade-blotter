import { Router, Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit.service';

export function createAuditRouter(auditService: AuditService): Router {
  const router = Router();

  router.get('/:tradeId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await auditService.getHistory(req.params.tradeId);
      res.json(history);
    } catch (err) { next(err); }
  });

  return router;
}
