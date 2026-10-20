import { Router, Request, Response, NextFunction } from 'express';
import { TradeService } from '../services/trade.service';
import { Broadcaster } from '../websocket/broadcaster';
import { createTradeSchema, amendTradeSchema } from '../validation/trade.schema';
import { WsEvent } from '../types';

export function createTradeRouter(service: TradeService, broadcaster: Broadcaster): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const trades = await service.getAll();
      res.json(trades);
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trade = await service.getById(req.params.id);
      res.json(trade);
    } catch (err) { next(err); }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createTradeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const trade = await service.create(parsed.data);
      const event: WsEvent = { type: 'TRADE_CREATED', payload: trade };
      broadcaster.broadcast(event);
      res.status(201).json(trade);
    } catch (err) { next(err); }
  });

  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = amendTradeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const trade = await service.amend(req.params.id, parsed.data);
      const event: WsEvent = { type: 'TRADE_AMENDED', payload: trade };
      broadcaster.broadcast(event);
      res.json(trade);
    } catch (err) { next(err); }
  });

  router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trade = await service.cancel(req.params.id);
      const event: WsEvent = { type: 'TRADE_CANCELLED', payload: trade };
      broadcaster.broadcast(event);
      res.json(trade);
    } catch (err) { next(err); }
  });

  return router;
}
