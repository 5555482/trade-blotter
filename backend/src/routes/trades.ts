import { Router } from 'express';
import { TradeService } from '../services/trade.service';
import { Broadcaster } from '../websocket/broadcaster';
import { createTradeSchema, amendTradeSchema } from '../validation/trade.schema';
import { WsEvent } from '../types';
import { asyncHandler } from '../lib/async-handler';

const TRADE_ID_RE = /^TRD-\d{6}$/;

function validateTradeId(id: string): boolean {
  return TRADE_ID_RE.test(id);
}

export function createTradeRouter(service: TradeService, broadcaster: Broadcaster): Router {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const page     = Math.max(1, parseInt(req.query['page']     as string) || 1);
    const pageSize = Math.min(10000, Math.max(1, parseInt(req.query['pageSize'] as string) || 100));
    res.json(await service.getAll(page, pageSize));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    if (!validateTradeId(req.params.id)) { res.status(400).json({ error: 'Invalid trade ID format' }); return; }
    res.json(await service.getById(req.params.id));
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
    if (!validateTradeId(req.params.id)) { res.status(400).json({ error: 'Invalid trade ID format' }); return; }
    const parsed = amendTradeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const trade = await service.amend(req.params.id, parsed.data);
    broadcaster.broadcast({ type: 'TRADE_AMENDED', payload: trade } satisfies WsEvent);
    res.json(trade);
  }));

  router.post('/:id/cancel', asyncHandler(async (req, res) => {
    if (!validateTradeId(req.params.id)) { res.status(400).json({ error: 'Invalid trade ID format' }); return; }
    const trade = await service.cancel(req.params.id);
    broadcaster.broadcast({ type: 'TRADE_CANCELLED', payload: trade } satisfies WsEvent);
    res.json(trade);
  }));

  return router;
}
