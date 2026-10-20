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

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast dev, modern tooling, strict types |
| Table | AG Grid Community v31 | Virtualised rows, built-in sort / filter / pagination / CSV export |
| Server state | TanStack Query v5 | Mutation lifecycle hooks (`onMutate` / `onError` / `onSettled`) used for optimistic updates |
| Real-time | Native WebSocket (`ws` library) | Zero extra bundle weight vs Socket.IO; single message type is sufficient |
| Backend | Node.js + Express 4 | Minimal overhead, familiar structure |
| Validation | Zod | Type-safe request parsing; schema doubles as TypeScript type |
| ORM | Prisma | Strong TypeScript types, automatic migration tooling |
| Database | SQLite | Zero-infra, single file, append-only writes — sufficient for this scale |
| CI | GitHub Actions | Runs type-check + tests on every push and PR to `main` |

### Key Architectural Decisions

**Repository pattern + service layer**

The app separates data access (`repositories/`), business logic (`services/`), and HTTP routing (`routes/`). The Express app is created via a factory function `createApp(prisma, broadcaster)` so tests can inject an in-memory Prisma client without starting a real server — this is what makes the integration tests hermetic.

**WebSocket broadcaster decoupled from HTTP**

A `Broadcaster` class holds the live WS client set and broadcasts JSON events after every mutation. It is injected into the service layer so services never import `ws` directly, keeping them testable. The WS server shares the HTTP server's port via `server.on('upgrade', ...)`.

**Optimistic updates via TanStack Query**

Amend and cancel mutations apply changes to the cache immediately (`onMutate`), snapshot the previous state for rollback, and invalidate after the server confirms (`onSettled`). If the server rejects the mutation (`onError`) the snapshot is restored. This keeps the UI responsive without a separate loading indicator per row.

**Single WebSocket connection**

`useWebSocket` is called once at the `App` root and passes `applyWsEvent` down into `useTrades`. Earlier versions called it inside `useTrades`, which caused double connections under React Strict Mode. Decoupling the hook callers fixed this.

**Append-only audit trail**

Every `CREATE`, `AMEND`, and `CANCEL` writes a `TradeAudit` row with full `before` / `after` JSON snapshots. Audits are never updated or deleted. The UI diffs the snapshots to show only changed fields.

**ID counter seeded from DB on first write**

To prevent ID collisions after a process restart, the in-memory counter lazy-initialises from `MAX(id)` on the first `create`. New IDs continue from where the database left off instead of always starting at `TRD-100001`.

**React performance**

- `TradeBlotter`, `TradeForm`, `AuditPanel`, and `ConfirmDialog` are all wrapped in `React.memo`.
- All callback props passed to `TradeBlotter` use `useCallback` so memo comparison sees stable references.
- `TradeForm` and `AuditPanel` are code-split with `React.lazy` + `Suspense` — they are only downloaded when the user opens them.
- AG Grid row virtualisation is enabled (default) with `rowBuffer={15}` and `suppressScrollOnNewData`.

---

## Project Structure

```
trade-blotter/
├── .github/
│   └── workflows/
│       └── ci.yml              # backend (type-check + tests) + frontend (type-check + build)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Trade + TradeAudit models
│   │   └── migrations/         # Auto-generated SQL migrations
│   ├── src/
│   │   ├── index.ts            # HTTP + WebSocket server bootstrap
│   │   ├── app.ts              # Express app factory — injectable prisma + broadcaster
│   │   ├── types/index.ts      # Domain types (Trade, TradeAudit)
│   │   ├── lib/
│   │   │   └── async-handler.ts# Wraps async route handlers; forwards errors to Express
│   │   ├── repositories/
│   │   │   ├── trade.repo.ts   # Prisma data access; lazy ID counter
│   │   │   └── audit.repo.ts   # Append-only audit writes and reads
│   │   ├── services/
│   │   │   ├── trade.service.ts# Business rules; broadcasts WS events
│   │   │   └── audit.service.ts# Audit history retrieval
│   │   ├── routes/
│   │   │   ├── trades.ts       # GET /api/trades, POST, PATCH /:id, POST /:id/cancel
│   │   │   └── audit.ts        # GET /api/audit/:tradeId
│   │   ├── validation/
│   │   │   └── trade.schema.ts # Zod schemas for create / amend
│   │   ├── websocket/
│   │   │   └── broadcaster.ts  # WS client registry; broadcast(event)
│   │   └── seed/
│   │       └── seed.ts         # 200 random trades; idempotent (checks COUNT first)
│   └── tests/
│       ├── trade.service.test.ts
│       ├── trade.repo.test.ts
│       └── routes.test.ts      # Supertest integration tests against real SQLite
├── frontend/
│   └── src/
│       ├── main.tsx            # ReactDOM.createRoot + ErrorBoundary
│       ├── App.tsx             # Root: useTrades + useWebSocket + lazy modals
│       ├── types/trade.ts      # Frontend-side Trade, TradeAudit, WsEvent types
│       ├── api/trades.ts       # fetch wrappers for all REST endpoints
│       ├── context/
│       │   └── ToastContext.tsx # Toast provider + useToast hook
│       ├── hooks/
│       │   ├── useTrades.ts    # TanStack Query: queries + optimistic mutations
│       │   └── useWebSocket.ts # WS connection with exponential reconnect
│       ├── components/
│       │   ├── TradeBlotter/   # AG Grid table, toolbar, CSV export, confirm dialog
│       │   ├── TradeForm/      # Create / amend modal with per-field validation
│       │   ├── AuditPanel/     # Timeline view of audit history for a trade
│       │   └── ConfirmDialog/  # Reusable destructive-action confirmation dialog
│       └── utils/
│           └── formatters.ts   # formatPrice, formatNotional, formatLargeNotional, formatDate
├── database/                   # SQLite file written here at runtime (Docker volume mount)
├── docker-compose.yml          # backend:3001 + frontend (nginx):80 → port 3000
└── README.md
```

---

## Installation

### Prerequisites

- **Node.js ≥ 20** and **npm ≥ 9**
- (Optional) **Docker + Docker Compose** for the containerised setup

### 1 — Clone

```bash
git clone <repo-url>
cd trade-blotter
```

### 2 — Backend

```bash
cd backend
cp .env.example .env        # sets DATABASE_URL=file:./database/trades.db
npm install
npm run db:migrate           # runs Prisma migrations, creates trades.db
```

Optional: seed with 200 random trades:

```bash
npm run db:seed
```

### 3 — Frontend

```bash
cd frontend
npm install
```

---

## Running the Application

### Local development (two terminals)

**Terminal 1 — backend**

```bash
cd backend
npm run dev        # tsx watch, hot-reload on port 3001
```

**Terminal 2 — frontend**

```bash
cd frontend
npm run dev        # Vite dev server on port 5173
```

Open **http://localhost:5173**.

The frontend proxies `/api` and `/ws` to `localhost:3001` via Vite's dev-server proxy in `vite.config.ts`.

### Docker (single command)

```bash
docker-compose up --build
```

- Backend (Express): port **3001** inside the container
- Frontend (nginx): exposed on **http://localhost:3000**
- The SQLite database file is bind-mounted at `./database/trades.db` so data survives container restarts

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/trades` | All trades, newest first |
| `POST` | `/api/trades` | Create a trade |
| `PATCH` | `/api/trades/:id` | Amend a trade (partial update — only provided fields are changed) |
| `POST` | `/api/trades/:id/cancel` | Cancel a trade (terminal; cannot be reversed) |
| `GET` | `/api/audit/:tradeId` | Audit history for a trade, newest first |

### WebSocket

Connect to `ws://localhost:3001/ws`. The server pushes an event after every mutation:

```typescript
{ type: "TRADE_CREATED" | "TRADE_AMENDED" | "TRADE_CANCELLED", payload: Trade }
```

All connected clients receive the event so every open browser tab stays in sync without polling.

---

## Running Tests

### Backend (unit + integration — 17 tests)

```bash
cd backend

# Create a dedicated test database (keeps tests isolated from dev data)
DATABASE_URL="file:./test.db" npx prisma migrate deploy

# Run the full suite
npm test                   # npx vitest run
```

The suite covers:

- **`trade.service.test.ts`** — unit tests for create, amend, cancel, and status-guard logic
- **`trade.repo.test.ts`** — repository layer: ID generation, lazy counter initialisation, persistence
- **`routes.test.ts`** — integration tests via Supertest hitting a real SQLite database through the full Express app

### Frontend

```bash
cd frontend
npm test     # npx vitest run
```

### CI

GitHub Actions runs both jobs on every push and pull request to `main`:

- **backend job**: `npm ci` → `prisma generate` → `tsc --noEmit` → `prisma migrate deploy` → `vitest run`
- **frontend job**: `npm ci` → `tsc --noEmit` → `vite build`

---

## Assumptions Made

1. **Single-region, single-process deployment.** There is no distributed coordination — the in-memory ID counter and WS broadcaster both assume one running server process.

2. **Trade IDs are always server-generated.** Clients never specify an ID; the server assigns `TRD-XXXXXX` sequentially.

3. **Cancellation is a terminal state.** A cancelled trade cannot be amended or re-activated. This matches standard financial trade-lifecycle semantics.

4. **SQLite is sufficient for the exercise scope.** The exercise does not require multi-process concurrent writes or horizontal scaling. SQLite's serialised write model is an advantage here — no race conditions on the ID counter.

5. **The seed is idempotent but not repeatable.** It checks `COUNT(*)` before inserting and aborts if any trades already exist. Re-running after a partial seed requires clearing the database manually.

6. **Audit records are immutable.** The schema has no `UPDATE` or `DELETE` path for `TradeAudit` rows. This is intentional — an audit trail that can be edited provides no integrity guarantee.

7. **WebSocket reconnects are the client's responsibility.** `useWebSocket` implements exponential back-off (1 s → 2 s → 4 s … capped at 30 s). The server does not buffer missed events; on reconnect TanStack Query refetches the full trade list via `invalidateQueries`.

8. **No authentication or authorisation.** The API is completely open. Adding auth would be the immediate next step before any production deployment.

---

## Trade-offs Accepted

| Decision | What was gained | What was given up |
|---|---|---|
| **SQLite over PostgreSQL** | Zero infrastructure; trivially portable | No concurrent writes across processes — not viable for a multi-server deployment |
| **`ws` over Socket.IO** | ~80 KB less in the bundle; no extra abstraction | No built-in rooms, namespaces, or acknowledgements — these would need manual implementation |
| **Module-level ID counter** | Simple, fast, no extra DB read per insert | Counter resets to `MAX(id) + 1` on restart; if seed data is deleted and re-inserted the counter re-initialises from whatever remains |
| **Append-only audit without archiving** | Perfect audit integrity; simple query | The `TradeAudit` table grows without bound; pruning/archiving would need a separate migration strategy |
| **AG Grid Community (not Enterprise)** | Free, no licence required | Server-side row model, advanced clipboard, Excel export, and row grouping are Enterprise-only |
| **Optimistic create not implemented** | Kept complexity focused on meaningful cases | A create mutation is not optimistic — the server-assigned ID is unknown until the response arrives, so the row appears after the round-trip |
| **No authentication** | Kept scope focused for the exercise | The API is completely open; not safe to expose publicly without adding an auth layer |
| **CSS custom properties without a component library** | Full control; no external CSS dependency | More CSS to maintain; accessible components (focus management, ARIA live regions) implemented manually — only ConfirmDialog and modals have keyboard handling |
| **`React.lazy` for modals only** | Smaller initial bundle; TradeForm and AuditPanel load on demand | Main bundle still includes the blotter and all AG Grid code; route-based splitting would reduce it further |
