# Trade Blotter

A full-stack equity trade blotter with real-time updates, built as a take-home engineering exercise.

## Architecture

```
Browser (React + AG Grid)
    │  REST (fetch)          WebSocket
    ▼                            ▼
Express API ──── Prisma ──── SQLite
    │
    └── ws (same HTTP port) ──── Broadcaster ──── all clients
```

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast dev, modern tooling |
| Table | AG Grid Community | Virtualised rows, built-in sort/filter/pagination |
| Server state | TanStack Query | Clean loading/error state, cache |
| Real-time | Native WebSocket (`ws`) | Zero extra bundle weight vs Socket.IO |
| Backend | Node.js + Express 4 | Minimal overhead, clear structure |
| Validation | Zod | Type-safe request parsing |
| ORM | Prisma | Strong TypeScript types, migration tooling |
| Database | SQLite | Zero-infra, single file, sufficient for this scale |

### Trade-offs

| Decision | Trade-off |
|---|---|
| SQLite over PostgreSQL | No concurrent writes across processes — fine for a single-server take-home |
| `ws` over Socket.IO | No rooms/namespaces if needed later — would be a swap to Socket.IO |
| Inline styles | No design system — not production-appropriate but keeps scope focused |
| Module-level `idCounter` in repo | Not persistent across restarts — IDs continue from 100001 each boot, so seed IDs may collide if seed is deleted and re-run manually |

### Assumptions

- Single-region, single-process deployment
- Trade IDs are always server-generated
- Cancellation is terminal — cancelled trades cannot be amended or re-activated
- Seed runs once on startup; idempotent (checks `COUNT(*)` before inserting)
- The audit trail records every CREATE, AMEND, and CANCEL with a full before/after snapshot

## Installation

### Prerequisites

- Node.js ≥ 20
- npm ≥ 9
- (Optional) Docker + Docker Compose

### Local (no Docker)

```bash
# 1. Backend
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Docker

```bash
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

## Running Tests

```bash
# Backend (unit + integration)
cd backend && npm test

# Frontend (unit)
cd frontend && npm test
```

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/trades` | List all trades (newest first) |
| `GET` | `/api/trades/:id` | Get single trade |
| `POST` | `/api/trades` | Create trade |
| `PATCH` | `/api/trades/:id` | Amend trade (partial update) |
| `POST` | `/api/trades/:id/cancel` | Cancel trade |
| `GET` | `/api/audit/:tradeId` | Get audit history for a trade |

### WebSocket

Connect to `ws://localhost:3001/ws`. Receive events on every mutation:

```typescript
{ type: "TRADE_CREATED" | "TRADE_AMENDED" | "TRADE_CANCELLED", payload: Trade }
```

## Project Structure

```
trade-blotter/
├── backend/
│   ├── src/
│   │   ├── index.ts          # HTTP + WS server bootstrap
│   │   ├── app.ts            # Express app factory (injected prisma + broadcaster)
│   │   ├── types/index.ts    # Domain types shared across backend
│   │   ├── repositories/     # Prisma data access (trade.repo, audit.repo)
│   │   ├── services/         # Business logic (trade.service, audit.service)
│   │   ├── routes/           # Express route handlers (trades, audit)
│   │   ├── validation/       # Zod schemas
│   │   ├── websocket/        # Broadcaster (WS client registry)
│   │   └── seed/             # Random trade data generator
│   └── tests/                # Vitest unit + integration tests
├── frontend/
│   └── src/
│       ├── types/trade.ts    # Frontend trade types
│       ├── api/trades.ts     # REST client
│       ├── hooks/            # useWebSocket, useTrades
│       └── components/       # TradeBlotter, TradeForm, AuditPanel
├── database/                 # SQLite file written here at runtime
├── docker-compose.yml
└── README.md
```
