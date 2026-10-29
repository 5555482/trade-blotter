# Interview Preparation — Trade Blotter

## Opening Frame

> "I used Claude Code to accelerate the build, but I reviewed every decision and can walk you through why the system is designed the way it is."

---

## System Design

### Architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + AG Grid + TanStack Query)                  │
│                                                                 │
│  AuthContext → LoginPage → AppInner → TradeBlotter              │
│  useTrades (TanStack Query cache)                               │
│  useWebSocket (exponential reconnect)                           │
└──────────────┬──────────────────────────────┬───────────────────┘
               │  REST (fetch + Bearer token) │  WebSocket (ws://)
               ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Express API (Node.js)                                           │
│                                                                  │
│  helmet  cors  rate-limit  express.json                          │
│                                                                  │
│  POST /api/auth/login   →  requireAuth middleware                │
│  GET  /api/trades            ↓                                   │
│  POST /api/trades       Zod validation                           │
│  PATCH /api/trades/:id       ↓                                   │
│  POST /api/trades/:id/cancel TradeService                        │
│  GET  /api/audit/:tradeId    ↓                                   │
│                         AuditService                             │
│                              ↓                                   │
│                         Broadcaster ──→ all WS clients           │
└──────────────────────────────┬───────────────────────────────────┘
                               │  Prisma ORM
                               ▼
                    ┌──────────────────┐
                    │  SQLite          │
                    │  Trade           │
                    │  TradeAudit      │
                    └──────────────────┘
```

### How to explain it

> "The frontend is React with TanStack Query for server state and AG Grid for the table. The backend is Express with Prisma over SQLite. They talk over REST for mutations and WebSocket for real-time push. There's a single Broadcaster class that holds the live WS client set and pushes an event after every mutation — so every open tab stays in sync without polling."

---

## Data Flow — Amend Trade (end to end)

```
1. User clicks Amend → TradeForm opens (lazy-loaded)
2. User submits → PATCH /api/trades/:id
   Headers: Authorization: Bearer <JWT>
   Body: { quantity: 600 }

3. requireAuth middleware verifies JWT → 401 if invalid

4. Zod schema validates body → 400 if invalid

5. TradeService.amend(id, { quantity: 600 })
   ├── TradeRepository.findById(id)      → 404 if not found
   ├── guard: throw 409 if CANCELLED
   ├── TradeRepository.update(id, data)  → writes to SQLite
   └── AuditRepository.append(           → appends audit row
         tradeId, AMEND, before, after)

6. Broadcaster.broadcast({ type: TRADE_AMENDED, payload: trade })
   └── pushes to every connected WebSocket client

7. HTTP 200 → { ...updatedTrade }

8. Frontend:
   ├── TanStack Query mutation onSuccess → invalidates ['trades']
   ├── useWebSocket receives TRADE_AMENDED
   └── applyWsEvent → queryClient.setQueryData → grid row updates instantly
```

---

## State Management

Four layers — each owns a specific concern:

| Layer | Technology | What it owns |
|---|---|---|
| Server state | TanStack Query | Trade list, audit history, loading/error, optimistic updates |
| Real-time sync | WebSocket (`useWebSocket`) | Patches Query cache on push events; refetches on reconnect |
| Auth state | React Context (`AuthContext`) | JWT token in memory — never localStorage |
| Local UI state | `useState` in components | Which modal is open, form values, login form |

**Why no Redux / Zustand?**
- Async/server state is handled better by TanStack Query than a manual store
- The only global state is the auth token — one `createContext` is enough
- Local UI state has no reason to be global

---

## Data Layer

Four tiers — database → ORM → repository → service:

**SQLite schema**
```
Trade         id, symbol, quantity, price, side, trader,
              book, counterparty, tradeTimestamp, status

TradeAudit    id, tradeId (FK), action, before (JSON),
              after (JSON), changedAt
              → append-only; never updated or deleted
```

**Prisma ORM**
- Parameterised queries by default → no SQL injection surface
- Types generated from `schema.prisma` → compiler catches broken call sites

**Repository layer**
- `TradeRepository` — CRUD + `toTradeDTO()` converts Prisma rows to domain types
- `AuditRepository` — append-only writes and reads

**Service layer**
- Business rules live here: 409 if amending/cancelling a CANCELLED trade
- Only `TradeService` writes audit records — repositories never call each other

---

## Security

| Layer | What was done |
|---|---|
| Headers | `helmet()` — CSP, X-Frame-Options, nosniff, HSTS |
| Auth | JWT (8h expiry), `requireAuth` middleware on all trade/audit routes |
| Input | Zod validation on all request bodies; route params validated against `TRD-XXXXXX` |
| CORS | Locked to `CORS_ORIGIN` env var (defaults to `localhost:5173`) |
| Errors | 5xx responses return `"Internal server error"` — raw messages never exposed |
| Token storage | JWT in React memory only — immune to XSS token theft |

**Why no classic CSRF?** The API is stateless (no cookies), accepts only `application/json`, and CORS is same-origin locked. Classical CSRF requires cookies to attach automatically — there are none here.

**Why no SQL injection?** Prisma uses parameterised queries throughout. There is no raw SQL in the codebase.

---

## If They Challenge You

**"Did you understand the code as it was being written?"**
> "Yes — I reviewed each change before it was committed. I can explain any file in detail."

**"What would you do differently in production?"**
> "Swap SQLite for Postgres to support horizontal scaling. Add a refresh token flow so the JWT survives a page refresh. Use bcrypt for password hashing instead of plain-text env var credentials. Replace the in-memory ID counter with a DB sequence to support multi-process deployments."

**"What's the biggest weakness?"**
> "The in-memory ID counter. It initialises from MAX(id) on startup, which works for a single process, but in a multi-process deployment you'd get ID collisions. The fix is a DB sequence or UUID."

**"What would you add next?"**
> "Role-based access control — traders can create and amend their own trades, risk managers can view everything but not create. Then server-side filtering and sorting so the grid scales past what fits in a single page fetch."

---

## Key Numbers to Remember

- **34** frontend tests, **24** backend tests (all passing)
- **4** branches of improvements after the take-home: best practices, compositional patterns, web vitals/a11y, security, authentication
- **8-hour** JWT expiry (matches a trading desk shift)
- **30-second** TanStack Query stale time
- **200** seeded trades in the demo database
- Rate limit: **200 requests / minute** per IP
