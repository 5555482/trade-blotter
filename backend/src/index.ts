import 'dotenv/config';
import http from 'http';
import { WebSocketServer } from 'ws';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { Broadcaster } from './websocket/broadcaster';
import { seed } from './seed/seed';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main(): Promise<void> {
  await seed(prisma);

  const broadcaster = new Broadcaster();
  const app = createApp(prisma, broadcaster);
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => broadcaster.register(ws));

  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
