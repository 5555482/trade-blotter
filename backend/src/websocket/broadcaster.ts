import { WebSocket } from 'ws';
import { WsEvent } from '../types';

export class Broadcaster {
  private clients = new Set<WebSocket>();

  register(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(event: WsEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
