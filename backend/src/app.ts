import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { TradeRepository } from './repositories/trade.repo';
import { AuditRepository } from './repositories/audit.repo';
import { TradeService } from './services/trade.service';
import { AuditService } from './services/audit.service';
import { Broadcaster } from './websocket/broadcaster';
import { createTradeRouter } from './routes/trades';
import { createAuditRouter } from './routes/audit';

export function createApp(prisma: PrismaClient, broadcaster: Broadcaster): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  });

  if (process.env.NODE_ENV !== 'test') {
    app.use('/api/', rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    }));
  }

  const tradeRepo = new TradeRepository(prisma);
  const auditRepo = new AuditRepository(prisma);
  const auditService = new AuditService(auditRepo);
  const tradeService = new TradeService(tradeRepo, auditService);

  app.use('/api/trades', createTradeRouter(tradeService, broadcaster));
  app.use('/api/audit', createAuditRouter(auditService));

  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode ?? 500;
    // Only surface the message for intentional HTTP errors; hide internals on unexpected 500s
    const message = status < 500 ? err.message : 'Internal server error';
    res.status(status).json({ error: message });
  });

  return app;
}
