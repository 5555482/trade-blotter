# Trade Blotter — System Design Document

---

## 1. Functional Requirements

### Core features (must-have)

| # | Requirement |
|---|---|
| FR-1 | Users must authenticate before accessing the system |
| FR-2 | Authenticated users can **create** a new equity trade (symbol, quantity, price, side, trader, book, counterparty) |
| FR-3 | Authenticated users can **amend** an active trade (any field, partial update) |
| FR-4 | Authenticated users can **cancel** a trade — this is terminal and irreversible |
| FR-5 | The blotter displays all trades in a paginated, sortable, filterable grid |
| FR-6 | Every mutation (create / amend / cancel) is recorded in an **append-only audit trail** with full before/after snapshots |
| FR-7 | The audit trail for any trade is viewable in the UI |
| FR-8 | All connected clients see trade changes **in real time** without refreshing the page |
| FR-9 | Users can export the current visible trade list to **CSV** |

### Out of scope (this version)

- Multi-user roles / RBAC (all authenticated users have the same permissions)
- Order management / execution
- P&L calculation
- Market data / pricing feeds
- Multi-asset classes (FX, rates, commodities)

---

## 2. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Grid must render 200+ rows without jank; initial page load < 2 s on fast connection |
| **Real-time latency** | Trade updates should appear on all connected clients within < 500 ms of a mutation |
| **Availability** | Single-process deployment; no HA requirement at this scale |
| **Security** | All API routes (except login) require a valid JWT; security headers on every response; no raw SQL |
| **Auditability** | Every state change must produce an immutable audit record; audit records are never updated or deleted |
| **Correctness** | A cancelled trade can never be amended or re-cancelled (enforced at service layer, not just UI) |
| **Scalability** | Handles a single trading desk (~50 concurrent users, ~10k trades/day); not designed for global scale |
| **Observability** | `/health` endpoint returns uptime; structured error responses for all failures |
| **Portability** | Runs locally with `npm run dev`; ships as Docker Compose for demo/staging |

---

## 3. Capacity Estimation

> These numbers justify technology choices, not production SLAs.

- **Users:** ~50 concurrent traders on one desk
- **Trades per day:** ~10,000 creates + amendments
- **Trade row size:** ~500 bytes JSON → 10k trades = ~5 MB in memory (fits easily in TanStack Query cache)
- **Audit rows:** ~3× trade mutations = ~30k rows/day; each row ~2 KB (JSON snapshots) = ~60 MB/day
- **WebSocket connections:** 50 users × 1–2 tabs = ~100 persistent connections
- **Write throughput:** ~1 trade/second peak → SQLite handles this comfortably (serialised writes, no contention)

---

## 4. High-Level Design

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client (Browser)                                                    │
│                                                                      │
│  LoginPage → AuthGate → App                                          │
│    │                      │                                          │
│    │  AuthContext          ├── TradeBlotter (AG Grid)                │
│    │  (JWT in memory)      ├── TradeForm    (create / amend modal)   │
│    │                       ├── AuditPanel   (audit timeline modal)   │
│    │                       └── ConfirmDialog (cancel confirmation)   │
│    │                                                                 │
│    │  TanStack Query cache: ['trades'] / ['audit', id]               │
│    │  useWebSocket → applyWsEvent → patch cache                      │
└────┼──────────────────────────────────────────────────────┬──────────┘
     │  HTTPS REST (Authorization: Bearer <JWT>)            │  WSS
     ▼                                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Express API  (Node.js, single process)                              │
│                                                                      │
│  Middleware chain (every request):                                   │
│    helmet → cors → express.json → rate-limit → requireAuth → Zod    │
│                                                                      │
│  Routes:                                                             │
│    POST   /api/auth/login          (public)                          │
│    GET    /api/trades              (protected)                       │
│    POST   /api/trades              (protected)                       │
│    PATCH  /api/trades/:id          (protected)                       │
│    POST   /api/trades/:id/cancel   (protected)                       │
│    GET    /api/audit/:tradeId      (protected)                       │
│    GET    /health                  (public)                          │
│                                                                      │
│  Service layer:  TradeService  ←→  AuditService                     │
│  Repository layer: TradeRepository  ←→  AuditRepository             │
│                                                                      │
│  Broadcaster (WS client registry)                                    │
│    → broadcasts JSON event after every mutation                      │
└──────────────────────────────────────┬───────────────────────────────┘
                                       │  Prisma ORM (parameterised SQL)
                                       ▼
                            ┌─────────────────────┐
                            │  SQLite             │
                            │  Trade table        │
                            │  TradeAudit table   │
                            └─────────────────────┘
```

### Component responsibilities

| Component | Responsibility |
|---|---|
| **AuthContext** | Stores JWT in React memory; exposes `login` / `logout`; syncs token to API module via `setAuthToken()` |
| **TanStack Query** | Caches server state; handles loading/error/stale; optimistic updates on amend |
| **useWebSocket** | Maintains single WS connection with exponential backoff; calls `applyWsEvent` on push |
| **requireAuth** | Verifies Bearer JWT on every protected route; returns 401 on failure |
| **TradeService** | Enforces business rules (409 guards); orchestrates repo + audit writes |
| **Broadcaster** | Holds `Set<WebSocket>`; cleans up on `ws.close`; pushes event JSON to all live clients |
| **TradeRepository** | CRUD via Prisma; converts raw DB rows to `Trade` domain type via `toTradeDTO()` |
| **AuditRepository** | Append-only writes; reads ordered by `changedAt DESC` |

---

## 5. API Design

### Authentication

#### `POST /api/auth/login`
```
Request
  Content-Type: application/json
  { "username": "admin", "password": "password" }

Response 200
  { "token": "<JWT>" }

Response 401
  { "error": "Invalid credentials" }
```

JWT payload: `{ sub: username, exp: now + 8h }`
All other endpoints require: `Authorization: Bearer <token>`

---

### Trades

#### `GET /api/trades`
```
Query params
  page     (default 1)
  pageSize (default 100, max 10000)

Response 200
  {
    "data":     Trade[],
    "total":    number,
    "page":     number,
    "pageSize": number
  }
```

#### `POST /api/trades`
```
Request body (all fields required)
  {
    "symbol":       string  min 1, max 10, uppercased
    "quantity":     integer positive
    "price":        number  positive
    "side":         "BUY" | "SELL"
    "trader":       string  min 1, max 20, uppercased
    "book":         string  min 1
    "counterparty": string  min 1
  }

Response 201  → Trade
Response 400  → { "error": <Zod flatten> }
```

#### `PATCH /api/trades/:id`
```
Request body (at least one field required, all optional)
  same fields as POST, all optional

Response 200  → Trade
Response 400  → { "error": <Zod flatten> }
Response 404  → { "error": "Trade not found" }
Response 409  → { "error": "Cannot amend a cancelled trade" }
```

#### `POST /api/trades/:id/cancel`
```
Response 200  → Trade (status: "CANCELLED")
Response 404  → { "error": "Trade not found" }
Response 409  → { "error": "Trade is already cancelled" }
```

#### `GET /api/audit/:tradeId`
```
Response 200
  TradeAudit[]   ordered changedAt DESC

TradeAudit shape
  {
    "id":        number
    "tradeId":   string
    "action":    "CREATE" | "AMEND" | "CANCEL"
    "before":    Trade | null   (null on CREATE)
    "after":     Trade
    "changedAt": ISO string
  }
```

---

### WebSocket

Connect to `ws://localhost:3001/ws`

Server pushes after every mutation:
```typescript
{ type: "TRADE_CREATED"   | "TRADE_AMENDED" | "TRADE_CANCELLED",
  payload: Trade }
```

Client behaviour:
- Receives event → calls `applyWsEvent` → patches TanStack Query cache
- On disconnect → exponential backoff reconnect (1s → 2s → 4s … cap 30s)
- On reconnect → `invalidateQueries(['trades'])` to catch missed events

---

## 6. Data Model

### Trade

| Field | Type | Notes |
|---|---|---|
| `id` | `TRD-XXXXXX` | Server-generated; sequential; seeded from `MAX(id)` on startup |
| `symbol` | string | e.g. `AAPL`, `MSFT` |
| `quantity` | integer | Positive |
| `price` | float | Positive |
| `side` | enum | `BUY` \| `SELL` |
| `trader` | string | e.g. `JSMITH` |
| `book` | string | e.g. `EQUITIES_UK` |
| `counterparty` | string | e.g. `Goldman Sachs` |
| `tradeTimestamp` | datetime | Set by server on create |
| `status` | enum | `ACTIVE` \| `CANCELLED` — transitions only `ACTIVE → CANCELLED` |

### TradeAudit

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Auto-increment |
| `tradeId` | string | FK → `Trade.id` |
| `action` | enum | `CREATE` \| `AMEND` \| `CANCEL` |
| `before` | JSON string | Full `Trade` snapshot before change; `null` on `CREATE` |
| `after` | JSON string | Full `Trade` snapshot after change |
| `changedAt` | datetime | Server timestamp |

**Invariants:**
- Audit rows are never `UPDATE`d or `DELETE`d
- Every service-layer mutation writes exactly one audit row
- `before` is always `null` for `CREATE` actions

---

## 7. Deep Dive

### 7.1 Real-time updates — WebSocket design

**Why WebSocket over polling?**
Polling at 1s intervals with 50 users = 50 HTTP requests/second at idle. WebSocket keeps one persistent connection per tab; the server pushes only when something changes.

**Broadcaster pattern**
```typescript
class Broadcaster {
  private clients = new Set<WebSocket>();

  add(ws: WebSocket) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));  // automatic cleanup
  }

  broadcast(event: WsEvent) {
    const msg = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }
}
```

The `Set` grows and shrinks as tabs open/close. `readyState` guard prevents sending to half-closed connections.

**Client reconnect strategy**
```
attempt 1 → wait 1s
attempt 2 → wait 2s
attempt 3 → wait 4s
...capped at 30s
```
On successful reconnect: `invalidateQueries(['trades'])` fetches fresh data to catch any mutations that happened while disconnected.

**Why one WS connection at App root, not inside `useTrades`?**
Under React Strict Mode, effects fire twice in development. If `useWebSocket` lived inside `useTrades`, Strict Mode double-invocation would open two WS connections. Hoisting it to `App` and passing `applyWsEvent` as a prop fixes this.

---

### 7.2 Optimistic updates

Amend mutations apply the change to the UI immediately without waiting for the server response:

```
onMutate(variables)
  1. Cancel any in-flight ['trades'] queries
  2. Snapshot current cache  →  previousTrades
  3. Patch cache with amended trade immediately  →  UI updates instantly
  4. Return { previousTrades }  (for rollback)

onError(err, variables, context)
  1. Restore cache from context.previousTrades  →  UI rolls back
  2. Show error toast

onSettled()
  1. invalidateQueries(['trades'])  →  refetch to sync with server truth
```

**Why not optimistic on create?**
The server assigns the ID (`TRD-XXXXXX`). We don't know the ID before the response arrives, so we can't construct a valid optimistic row. The create mutation waits for the response; the grid updates when the WebSocket event arrives (or on `invalidateQueries` in `onSettled`).

---

### 7.3 Security in depth

| Layer | Mechanism | Why |
|---|---|---|
| **Transport** | HTTPS / WSS in production | Prevents token interception in transit |
| **Authentication** | JWT, 8h expiry, HS256 | Stateless; no session store needed |
| **Token storage** | React memory only | `localStorage` is readable by any XSS script; in-memory state is not |
| **Headers** | `helmet()` | Sets CSP, X-Frame-Options, X-Content-Type-Options, HSTS in one call |
| **CORS** | `CORS_ORIGIN` env var | Blocks cross-origin requests from untrusted domains |
| **Rate limiting** | 200 req/min per IP | Protects against brute-force login and API abuse |
| **Input validation** | Zod on every request body | Rejects malformed data before it reaches business logic |
| **Route params** | Regex `/^TRD-\d{6}$/` | Rejects garbage before it reaches the database |
| **SQL injection** | Prisma parameterised queries | No raw SQL anywhere in the codebase |
| **Error responses** | Generic message on 5xx | Internal stack traces never reach the client |

**CSRF** is not a risk here because:
1. The API accepts only `application/json` (simple form submissions cannot set this content type without a preflight)
2. Authentication uses Bearer tokens in headers, not cookies — cookies are the CSRF attack vector

---

### 7.4 Audit trail design

Every mutation writes one row before returning:

```
CREATE  →  before: null,        after: new Trade snapshot
AMEND   →  before: old snapshot, after: updated Trade snapshot
CANCEL  →  before: old snapshot, after: Trade with status CANCELLED
```

**Why full JSON snapshots instead of just diffs?**
- Diffs require reconstructing history in order — a full snapshot makes any point-in-time state instantly readable
- The UI diffs `before` vs `after` at render time to show only changed fields
- Storage cost is low at this scale (~2 KB per audit row)

**Immutability enforcement:**
- There is no `UPDATE` or `DELETE` path in `AuditRepository`
- Prisma schema has no `@@allow` for updates on `TradeAudit`
- The only write is `db.tradeAudit.create()`

---

### 7.5 ID generation

```typescript
let idCounter: number | null = null;

async function nextId(db: PrismaClient): Promise<string> {
  if (idCounter === null) {
    const last = await db.trade.findFirst({ orderBy: { id: 'desc' } });
    const lastNum = last ? parseInt(last.id.replace('TRD-', ''), 10) : 100000;
    idCounter = lastNum + 1;
  }
  return `TRD-${String(idCounter++).padStart(6, '0')}`;
}
```

**How it works:** On first write after startup, reads `MAX(id)` from the DB and continues from there. Subsequent IDs are in-memory increments.

**Known limitation:** This only works correctly with a **single server process**. In a multi-process deployment (load balancer across two Node instances), both processes initialise from the same `MAX(id)` and will generate duplicate IDs.

**Production fix:** Use a database sequence (PostgreSQL `SERIAL` / `SEQUENCE`) or UUIDs.

---

### 7.6 Frontend performance

| Technique | Benefit |
|---|---|
| `React.memo` on TradeBlotter, TradeForm, AuditPanel, ConfirmDialog | Prevents re-renders when parent state changes but props are stable |
| `useCallback` for all callbacks passed to TradeBlotter | Keeps memo references stable across parent re-renders |
| `useMemo` for `activeTrades` and `totalNotional` | Recomputes stats only when the trades array changes |
| `React.lazy` + `Suspense` for TradeForm and AuditPanel | Splits modals into separate chunks; only downloaded when opened |
| AG Grid row virtualisation | Only renders DOM rows in the visible viewport; constant performance at any row count |
| `rowBuffer={15}` | Pre-renders 15 rows above/below viewport for smooth scrolling |
| Google Fonts via `<link>` not CSS `@import` | Loads fonts in parallel with CSS; avoids render-blocking |

---

## 8. Trade-offs Summary

| Decision | Gained | Given up |
|---|---|---|
| SQLite over PostgreSQL | Zero infrastructure; trivially portable | No concurrent multi-process writes; not horizontally scalable |
| `ws` over Socket.IO | ~80 KB less bundle; no abstraction overhead | No rooms, namespaces, or built-in acknowledgements |
| JWT in memory over localStorage | Immune to XSS token theft | Token lost on page refresh; requires re-login |
| Prisma over raw SQL | Type-safe queries; no injection surface; migration tooling | Slightly less control over query shape; thin abstraction layer |
| Full JSON snapshots in audit | Instant point-in-time reads; simple UI diff | ~2 KB per audit row; grows without bound |
| In-memory ID counter | Simple; no extra DB read per insert | ID collision risk in multi-process deployment |
| Single-process broadcaster | Simple; no message broker needed | Cannot scale across processes; missed events if process restarts |
| Optimistic amend, non-optimistic create | Responsive UX on the common path | Create has a round-trip delay (server must assign ID first) |

---

## 9. What Would Change in Production

| Area | Current | Production change |
|---|---|---|
| Database | SQLite | PostgreSQL (concurrent writes, horizontal scaling) |
| ID generation | In-memory counter | DB sequence or UUID |
| Auth | Single admin, plaintext env var | User table, bcrypt hashing, refresh tokens, RBAC |
| Real-time | Single-process broadcaster | Redis Pub/Sub so all server instances broadcast to all clients |
| Deployment | Docker Compose (1 service) | Kubernetes / ECS with replicated pods |
| Observability | `/health` endpoint | Structured logging (Pino), distributed tracing (OpenTelemetry), metrics (Prometheus) |
| Audit storage | SQLite rows | Immutable append-only store (e.g. event store or archiving to S3 Parquet) |
| Secrets | `.env` file | Secrets manager (AWS Secrets Manager / Vault) |
