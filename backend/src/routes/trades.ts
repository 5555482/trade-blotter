import { Router } from 'express';
import { TradeService } from '../services/trade.service';
import { Broadcaster } from '../websocket/broadcaster';
import { createTradeSchema, amendTradeSchema } from '../validation/trade.schema';
import { WsEvent } from '../types';
import { asyncHandler } from '../lib/async-handler';

export function createTradeRouter(service: TradeService, broadcaster: Broadcaster): Router {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await service.getAll());
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await service.getById(req.params.id as string));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = createTradeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const trade = await service.create(parsed.data);
    broadcaster.broadcast({ type: 'TRADE_CREATED', payload: trade } satisfies WsEvent);
    res.status(201).json(trade);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const parsed = amendTradeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const trade = await service.amend(req.params.id as string, parsed.data);
    broadcaster.broadcast({ type: 'TRADE_AMENDED', payload: trade } satisfies WsEvent);
    res.json(trade);
  }));

  router.post('/:id/cancel', asyncHandler(async (req, res) => {
    const trade = await service.cancel(req.params.id as string);
    broadcaster.broadcast({ type: 'TRADE_CANCELLED', payload: trade } satisfies WsEvent);
    res.json(trade);
  }));

  return router;
}
