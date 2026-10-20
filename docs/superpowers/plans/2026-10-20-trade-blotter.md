# Trade Blotter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack trade blotter with React/TypeScript frontend, Express/TypeScript backend, SQLite/Prisma persistence, native WebSockets for real-time updates, AG Grid for the table, and an audit trail.

**Architecture:** Single Express server handles both REST and WebSocket on port 3001 (ws library attaches to the same HTTP server). Every trade mutation writes to SQLite via Prisma then broadcasts a typed event to all connected WebSocket clients. Frontend applies incremental AG Grid row updates on each event, avoiding full refetches.

**Tech Stack:** Node.js 20, Express 4, Prisma 5, better-sqlite3, ws, React 18, Vite 5, AG Grid Community 31, TanStack Query 5, Zod, Vitest, Supertest, Docker.

**Spec:** `docs/superpowers/specs/` (design approved in conversation — architecture: Express+SQLite+ws, bonus: AG Grid + audit trail)

---

## Global Constraints

- Node.js ≥ 20, TypeScript strict mode everywhere
- Backend port: 3001, Frontend dev: 5173
- Trade statuses: `"ACTIVE" | "CANCELLED"` only — no other statuses
- Trade sides: `"BUY" | "SELL"` only
- Trade IDs format: `TRD-XXXXXX` (6-digit zero-padded number)
- Seed exactly 200 trades on startup if DB is empty
- All monetary values stored as floats; quantities as integers
- WebSocket events must be typed: `TRADE_CREATED | TRADE_AMENDED | TRADE_CANCELLED`
- Audit records are append-only — never deleted or updated
- Docker must work on Linux, Mac (including Apple Silicon), and Windows

## Review Focus

- Cancel a trade that is already CANCELLED → should return 409 with clear message, not silently succeed
- Amend a CANCELLED trade → should return 409, cancellation is terminal
- WebSocket client reconnect after server restart → frontend hook must retry with backoff, not hang
- AG Grid filter + WebSocket update arriving simultaneously → grid must not lose filter state on live push
- Seed data generation on startup when DB already has data → must be idempotent (no duplicates)

---

## File Map

```
trade-blotter/
├── backend/
│   ├── src/
│   │   ├── index.ts                        # HTTP + WS server bootstrap
│   │   ├── app.ts                          # Express app factory
│   │   ├── types/index.ts                  # Domain types + WS event types
│   │   ├── websocket/broadcaster.ts        # WS client registry + broadcast fn
│   │   ├── routes/trades.ts                # Trade CRUD route handlers
│   │   ├── routes/audit.ts                 # Audit trail route handlers
│   │   ├── services/trade.service.ts       # Trade business logic
│   │   ├── services/audit.service.ts       # Audit append logic
│   │   ├── repositories/trade.repo.ts      # Prisma trade queries
│   │   ├── repositories/audit.repo.ts      # Prisma audit queries
│   │   ├── seed/seed.ts                    # Random trade generator
│   │   └── lib/prisma.ts                   # Prisma singleton
│   ├── prisma/schema.prisma
│   ├── tests/
│   │   ├── trade.service.test.ts
│   │   ├── trade.repo.test.ts
│   │   └── routes.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── types/trade.ts                  # Frontend trade types
│   │   ├── api/trades.ts                   # REST client
│   │   ├── hooks/useWebSocket.ts           # WS connection with reconnect
│   │   ├── hooks/useTrades.ts              # TanStack Query hooks
│   │   ├── components/TradeBlotter/
│   │   │   ├── TradeBlotter.tsx            # AG Grid wrapper
│   │   │   └── columnDefs.ts              # Column definitions
│   │   ├── components/TradeForm/
│   │   │   └── TradeForm.tsx              # Create/amend modal form
│   │   ├── components/AuditPanel/
│   │   │   └── AuditPanel.tsx             # Audit trail drawer
│   │   └── utils/formatters.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── database/                               # SQLite file written here at runtime
├── docker-compose.yml
├── README.md
├── AI_USAGE_REPORT.md
└── PROMPT_LOG.md
```

---

## Task 1: Backend Scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `backend/src/lib/prisma.ts`

**Interfaces:**
- Produces: Prisma client singleton used by all repositories

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "trade-blotter-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx src/seed/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "express": "^4.21.1",
    "ws": "^8.18.0",
    "zod": "^3.23.8",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.13",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.22.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `backend/.env.example`**

```
DATABASE_URL="file:../database/trades.db"
PORT=3001
```

- [ ] **Step 4: Create `backend/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Install backend dependencies**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npm install
```

- [ ] **Step 6: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/package.json backend/tsconfig.json backend/.env.example backend/src/lib/prisma.ts
git commit -m "feat: scaffold backend with Express/Prisma/ws dependencies"
```

---

## Task 2: Prisma Schema + Migrations + Seed

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/seed/seed.ts`
- Create: `backend/src/types/index.ts`

**Interfaces:**
- Produces: `Trade`, `TradeAudit` DB models; `createTrade`, `amendTrade`, `cancelTrade` seed helpers
- Produces: `TradeStatus`, `TradeSide`, `WsEventType`, `WsEvent`, `CreateTradeInput`, `AmendTradeInput` TypeScript types

- [ ] **Step 1: Create `backend/src/types/index.ts`**

```typescript
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'ACTIVE' | 'CANCELLED';
export type WsEventType = 'TRADE_CREATED' | 'TRADE_AMENDED' | 'TRADE_CANCELLED';

export interface Trade {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: string;
  status: TradeStatus;
}

export interface TradeAudit {
  id: string;
  tradeId: string;
  action: string;
  before: Trade | null;
  after: Trade;
  changedAt: string;
}

export interface WsEvent {
  type: WsEventType;
  payload: Trade;
}

export interface CreateTradeInput {
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  book: string;
  counterparty: string;
}

export interface AmendTradeInput {
  symbol?: string;
  quantity?: number;
  price?: number;
  side?: TradeSide;
  trader?: string;
  book?: string;
  counterparty?: string;
}
```

- [ ] **Step 2: Create `backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Trade {
  id             String       @id
  symbol         String
  quantity       Int
  price          Float
  side           String
  trader         String
  book           String
  counterparty   String
  tradeTimestamp DateTime
  status         String       @default("ACTIVE")
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  audits         TradeAudit[]
}

model TradeAudit {
  id         String   @id @default(cuid())
  tradeId    String
  trade      Trade    @relation(fields: [tradeId], references: [id])
  action     String
  before     String?
  after      String
  changedAt  DateTime @default(now())
}
```

- [ ] **Step 3: Copy `.env.example` to `.env` and run migration**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend
cp .env.example .env
mkdir -p ../database
npx prisma migrate dev --name init
```

- [ ] **Step 4: Create `backend/src/seed/seed.ts`**

```typescript
import { prisma } from '../lib/prisma';

const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BABA'];
const TRADERS = ['JSMITH', 'ABROWN', 'MJONES', 'KWILLIAMS', 'SDAVIS', 'LTAYLOR', 'OMARTIN'];
const BOOKS = ['EQUITIES_UK', 'EQUITIES_US', 'TECH_GROWTH', 'EMERGING_MKTS', 'FIXED_INCOME'];
const COUNTERPARTIES = ['Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Barclays', 'Deutsche Bank', 'UBS', 'Citi'];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateTradeId(index: number): string {
  return `TRD-${String(100001 + index).padStart(6, '0')}`;
}

function randomTimestamp(): Date {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const hoursAgo = Math.floor(Math.random() * 8);
  const minutesAgo = Math.floor(Math.random() * 60);
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9 + hoursAgo, minutesAgo, Math.floor(Math.random() * 60), 0);
  return d;
}

export async function seed(): Promise<void> {
  const count = await prisma.trade.count();
  if (count > 0) return;

  const trades = Array.from({ length: 200 }, (_, i) => ({
    id: generateTradeId(i),
    symbol: randomElement(SYMBOLS),
    quantity: Math.floor(randomBetween(100, 10000) / 100) * 100,
    price: Math.round(randomBetween(50, 600) * 100) / 100,
    side: randomElement(['BUY', 'SELL'] as const),
    trader: randomElement(TRADERS),
    book: randomElement(BOOKS),
    counterparty: randomElement(COUNTERPARTIES),
    tradeTimestamp: randomTimestamp(),
    status: Math.random() > 0.15 ? 'ACTIVE' : 'CANCELLED',
  }));

  await prisma.trade.createMany({ data: trades });
  console.log(`Seeded ${trades.length} trades`);
}
```

- [ ] **Step 5: Verify generation works**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend
npx prisma generate
```

Expected: "Generated Prisma Client"

- [ ] **Step 6: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/prisma/ backend/src/types/ backend/src/seed/ backend/.env.example
git commit -m "feat: add Prisma schema, domain types, and trade seed generator"
```

---

## Task 3: Trade Repository

**Files:**
- Create: `backend/src/repositories/trade.repo.ts`
- Create: `backend/tests/trade.repo.test.ts`

**Interfaces:**
- Consumes: `prisma` from `../lib/prisma`; `Trade`, `CreateTradeInput`, `AmendTradeInput` from `../types`
- Produces:
  - `TradeRepository` class with methods:
    - `findAll(): Promise<Trade[]>`
    - `findById(id: string): Promise<Trade | null>`
    - `create(input: CreateTradeInput): Promise<Trade>`
    - `update(id: string, data: Partial<AmendTradeInput & { status: TradeStatus }>): Promise<Trade>`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/trade.repo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TradeRepository } from '../src/repositories/trade.repo';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

let repo: TradeRepository;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM Trade');
  repo = new TradeRepository(prisma);
});

afterEach(async () => {
  await prisma.$disconnect();
});

describe('TradeRepository', () => {
  it('creates a trade and returns it', async () => {
    const trade = await repo.create({
      symbol: 'AAPL',
      quantity: 500,
      price: 227.45,
      side: 'BUY',
      trader: 'JSMITH',
      book: 'EQUITIES_UK',
      counterparty: 'Goldman Sachs',
    });
    expect(trade.symbol).toBe('AAPL');
    expect(trade.status).toBe('ACTIVE');
    expect(trade.id).toMatch(/^TRD-/);
  });

  it('findAll returns all trades', async () => {
    await repo.create({ symbol: 'MSFT', quantity: 100, price: 300, side: 'SELL', trader: 'ABROWN', book: 'EQUITIES_US', counterparty: 'JP Morgan' });
    await repo.create({ symbol: 'TSLA', quantity: 200, price: 350, side: 'BUY', trader: 'MJONES', book: 'TECH_GROWTH', counterparty: 'UBS' });
    const all = await repo.findAll();
    expect(all.length).toBe(2);
  });

  it('update amends a trade field', async () => {
    const created = await repo.create({ symbol: 'AAPL', quantity: 500, price: 227.45, side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs' });
    const updated = await repo.update(created.id, { quantity: 1000 });
    expect(updated.quantity).toBe(1000);
  });

  it('update can cancel a trade', async () => {
    const created = await repo.create({ symbol: 'AAPL', quantity: 500, price: 227.45, side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs' });
    const cancelled = await repo.update(created.id, { status: 'CANCELLED' });
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('findById returns null for unknown id', async () => {
    const result = await repo.findById('TRD-999999');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run tests/trade.repo.test.ts
```

- [ ] **Step 3: Create `backend/src/repositories/trade.repo.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { Trade, CreateTradeInput, AmendTradeInput, TradeSide, TradeStatus } from '../types';

function toTradeDTO(raw: {
  id: string; symbol: string; quantity: number; price: number;
  side: string; trader: string; book: string; counterparty: string;
  tradeTimestamp: Date; status: string;
}): Trade {
  return {
    id: raw.id,
    symbol: raw.symbol,
    quantity: raw.quantity,
    price: raw.price,
    side: raw.side as TradeSide,
    trader: raw.trader,
    book: raw.book,
    counterparty: raw.counterparty,
    tradeTimestamp: raw.tradeTimestamp.toISOString(),
    status: raw.status as TradeStatus,
  };
}

let idCounter = 100001;

function generateId(): string {
  return `TRD-${String(idCounter++).padStart(6, '0')}`;
}

export class TradeRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAll(): Promise<Trade[]> {
    const rows = await this.db.trade.findMany({ orderBy: { tradeTimestamp: 'desc' } });
    return rows.map(toTradeDTO);
  }

  async findById(id: string): Promise<Trade | null> {
    const row = await this.db.trade.findUnique({ where: { id } });
    return row ? toTradeDTO(row) : null;
  }

  async create(input: CreateTradeInput): Promise<Trade> {
    const row = await this.db.trade.create({
      data: {
        id: generateId(),
        ...input,
        tradeTimestamp: new Date(),
        status: 'ACTIVE',
      },
    });
    return toTradeDTO(row);
  }

  async update(id: string, data: Partial<AmendTradeInput & { status: TradeStatus }>): Promise<Trade> {
    const row = await this.db.trade.update({ where: { id }, data });
    return toTradeDTO(row);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run tests/trade.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/repositories/trade.repo.ts backend/tests/trade.repo.test.ts
git commit -m "feat: add TradeRepository with Prisma CRUD"
```

---

## Task 4: Audit Repository

**Files:**
- Create: `backend/src/repositories/audit.repo.ts`
- Create: `backend/src/services/audit.service.ts`

**Interfaces:**
- Consumes: `prisma`, `Trade`, `TradeAudit` from types
- Produces:
  - `AuditRepository.append(tradeId, action, before, after): Promise<void>`
  - `AuditRepository.findByTradeId(tradeId): Promise<TradeAudit[]>`
  - `AuditService.record(action, before, after): Promise<void>` (thin wrapper)

- [ ] **Step 1: Create `backend/src/repositories/audit.repo.ts`**

```typescript
import { PrismaClient } from '@prisma/client';
import { Trade, TradeAudit } from '../types';

export class AuditRepository {
  constructor(private readonly db: PrismaClient) {}

  async append(tradeId: string, action: string, before: Trade | null, after: Trade): Promise<void> {
    await this.db.tradeAudit.create({
      data: {
        tradeId,
        action,
        before: before ? JSON.stringify(before) : null,
        after: JSON.stringify(after),
      },
    });
  }

  async findByTradeId(tradeId: string): Promise<TradeAudit[]> {
    const rows = await this.db.tradeAudit.findMany({
      where: { tradeId },
      orderBy: { changedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      tradeId: r.tradeId,
      action: r.action,
      before: r.before ? (JSON.parse(r.before) as Trade) : null,
      after: JSON.parse(r.after) as Trade,
      changedAt: r.changedAt.toISOString(),
    }));
  }
}
```

- [ ] **Step 2: Create `backend/src/services/audit.service.ts`**

```typescript
import { AuditRepository } from '../repositories/audit.repo';
import { Trade, TradeAudit } from '../types';

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(action: string, before: Trade | null, after: Trade): Promise<void> {
    await this.repo.append(after.id, action, before, after);
  }

  async getHistory(tradeId: string): Promise<TradeAudit[]> {
    return this.repo.findByTradeId(tradeId);
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/repositories/audit.repo.ts backend/src/services/audit.service.ts
git commit -m "feat: add AuditRepository and AuditService for append-only history"
```

---

## Task 5: Trade Service (Business Logic)

**Files:**
- Create: `backend/src/services/trade.service.ts`
- Create: `backend/tests/trade.service.test.ts`

**Interfaces:**
- Consumes: `TradeRepository`, `AuditService`, `Trade`, `CreateTradeInput`, `AmendTradeInput`
- Produces:
  - `TradeService.getAll(): Promise<Trade[]>`
  - `TradeService.getById(id: string): Promise<Trade>`
  - `TradeService.create(input: CreateTradeInput): Promise<Trade>`
  - `TradeService.amend(id: string, input: AmendTradeInput): Promise<Trade>`
  - `TradeService.cancel(id: string): Promise<Trade>`
  - All methods throw `Error` with descriptive message + attach `.statusCode: number` for route handlers

- [ ] **Step 1: Write failing test**

Create `backend/tests/trade.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeService } from '../src/services/trade.service';
import { Trade } from '../src/types';

const mockActiveTrade: Trade = {
  id: 'TRD-100001', symbol: 'AAPL', quantity: 500, price: 227.45,
  side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs', tradeTimestamp: '2026-10-01T09:15:00Z', status: 'ACTIVE',
};

const mockCancelledTrade: Trade = { ...mockActiveTrade, status: 'CANCELLED' };

const mockRepo = {
  findAll: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockAudit = {
  record: vi.fn(),
  getHistory: vi.fn(),
};

let service: TradeService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new TradeService(mockRepo as any, mockAudit as any);
});

describe('TradeService.cancel', () => {
  it('cancels an active trade', async () => {
    mockRepo.findById.mockResolvedValue(mockActiveTrade);
    mockRepo.update.mockResolvedValue(mockCancelledTrade);
    const result = await service.cancel('TRD-100001');
    expect(result.status).toBe('CANCELLED');
    expect(mockAudit.record).toHaveBeenCalledWith('CANCEL', mockActiveTrade, mockCancelledTrade);
  });

  it('throws 409 when cancelling an already-cancelled trade', async () => {
    mockRepo.findById.mockResolvedValue(mockCancelledTrade);
    await expect(service.cancel('TRD-100001')).rejects.toMatchObject({
      message: expect.stringContaining('already cancelled'),
      statusCode: 409,
    });
  });

  it('throws 404 when trade does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.cancel('TRD-999999')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('TradeService.amend', () => {
  it('amends an active trade', async () => {
    const amended = { ...mockActiveTrade, quantity: 1000 };
    mockRepo.findById.mockResolvedValue(mockActiveTrade);
    mockRepo.update.mockResolvedValue(amended);
    const result = await service.amend('TRD-100001', { quantity: 1000 });
    expect(result.quantity).toBe(1000);
    expect(mockAudit.record).toHaveBeenCalledWith('AMEND', mockActiveTrade, amended);
  });

  it('throws 409 when amending a cancelled trade', async () => {
    mockRepo.findById.mockResolvedValue(mockCancelledTrade);
    await expect(service.amend('TRD-100001', { quantity: 1000 })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('TradeService.create', () => {
  it('creates a new trade and records audit', async () => {
    mockRepo.create.mockResolvedValue(mockActiveTrade);
    const result = await service.create({
      symbol: 'AAPL', quantity: 500, price: 227.45, side: 'BUY',
      trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs',
    });
    expect(result.symbol).toBe('AAPL');
    expect(mockAudit.record).toHaveBeenCalledWith('CREATE', null, mockActiveTrade);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run tests/trade.service.test.ts
```

- [ ] **Step 3: Create `backend/src/services/trade.service.ts`**

```typescript
import { TradeRepository } from '../repositories/trade.repo';
import { AuditService } from './audit.service';
import { Trade, CreateTradeInput, AmendTradeInput } from '../types';

function httpError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export class TradeService {
  constructor(
    private readonly repo: TradeRepository,
    private readonly audit: AuditService,
  ) {}

  async getAll(): Promise<Trade[]> {
    return this.repo.findAll();
  }

  async getById(id: string): Promise<Trade> {
    const trade = await this.repo.findById(id);
    if (!trade) throw httpError(`Trade ${id} not found`, 404);
    return trade;
  }

  async create(input: CreateTradeInput): Promise<Trade> {
    const trade = await this.repo.create(input);
    await this.audit.record('CREATE', null, trade);
    return trade;
  }

  async amend(id: string, input: AmendTradeInput): Promise<Trade> {
    const before = await this.getById(id);
    if (before.status === 'CANCELLED') {
      throw httpError(`Trade ${id} is cancelled and cannot be amended`, 409);
    }
    const after = await this.repo.update(id, input);
    await this.audit.record('AMEND', before, after);
    return after;
  }

  async cancel(id: string): Promise<Trade> {
    const before = await this.getById(id);
    if (before.status === 'CANCELLED') {
      throw httpError(`Trade ${id} is already cancelled`, 409);
    }
    const after = await this.repo.update(id, { status: 'CANCELLED' });
    await this.audit.record('CANCEL', before, after);
    return after;
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run tests/trade.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/services/trade.service.ts backend/tests/trade.service.test.ts
git commit -m "feat: add TradeService with cancel/amend guards and audit integration"
```

---

## Task 6: Zod Validation Schemas

**Files:**
- Create: `backend/src/validation/trade.schema.ts`

**Interfaces:**
- Produces: `createTradeSchema`, `amendTradeSchema` — Zod schemas used by route handlers

- [ ] **Step 1: Create `backend/src/validation/trade.schema.ts`**

```typescript
import { z } from 'zod';

export const createTradeSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
  side: z.enum(['BUY', 'SELL']),
  trader: z.string().min(1).max(20).toUpperCase(),
  book: z.string().min(1),
  counterparty: z.string().min(1),
});

export const amendTradeSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase().optional(),
  quantity: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  trader: z.string().min(1).max(20).toUpperCase().optional(),
  book: z.string().min(1).optional(),
  counterparty: z.string().min(1).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });
```

- [ ] **Step 2: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/validation/
git commit -m "feat: add Zod validation schemas for create and amend"
```

---

## Task 7: WebSocket Broadcaster

**Files:**
- Create: `backend/src/websocket/broadcaster.ts`

**Interfaces:**
- Produces:
  - `Broadcaster` class:
    - `register(ws: WebSocket): void`
    - `broadcast(event: WsEvent): void`
    - `size: number` (getter, for tests)

- [ ] **Step 1: Create `backend/src/websocket/broadcaster.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/websocket/
git commit -m "feat: add WebSocket broadcaster (client registry + typed broadcast)"
```

---

## Task 8: REST Routes

**Files:**
- Create: `backend/src/routes/trades.ts`
- Create: `backend/src/routes/audit.ts`
- Create: `backend/tests/routes.test.ts`

**Interfaces:**
- Consumes: `TradeService`, `AuditService`, `Broadcaster`, `createTradeSchema`, `amendTradeSchema`
- Produces: Express routers exported as `tradeRouter` and `auditRouter`

- [ ] **Step 1: Create `backend/src/routes/trades.ts`**

```typescript
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
```

- [ ] **Step 2: Create `backend/src/routes/audit.ts`**

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit.service';

export function createAuditRouter(auditService: AuditService): Router {
  const router = Router();

  router.get('/:tradeId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await auditService.getHistory(req.params.tradeId);
      res.json(history);
    } catch (err) { next(err); }
  });

  return router;
}
```

- [ ] **Step 3: Write route integration test `backend/tests/routes.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';
import { Broadcaster } from '../src/websocket/broadcaster';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

const broadcaster = new Broadcaster();
const app = createApp(prisma, broadcaster);

beforeAll(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM TradeAudit');
  await prisma.$executeRawUnsafe('DELETE FROM Trade');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/trades', () => {
  it('creates a trade with valid body', async () => {
    const res = await request(app).post('/api/trades').send({
      symbol: 'AAPL', quantity: 500, price: 227.45,
      side: 'BUY', trader: 'JSMITH', book: 'EQUITIES_UK', counterparty: 'Goldman Sachs',
    });
    expect(res.status).toBe(201);
    expect(res.body.symbol).toBe('AAPL');
    expect(res.body.status).toBe('ACTIVE');
  });

  it('returns 400 with invalid body', async () => {
    const res = await request(app).post('/api/trades').send({ symbol: 'AAPL' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/trades/:id/cancel', () => {
  it('cancels an active trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'MSFT', quantity: 100, price: 300, side: 'SELL',
      trader: 'ABROWN', book: 'EQUITIES_US', counterparty: 'JP Morgan',
    });
    const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('returns 409 when cancelling already-cancelled trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'TSLA', quantity: 200, price: 350, side: 'BUY',
      trader: 'MJONES', book: 'TECH_GROWTH', counterparty: 'UBS',
    });
    await request(app).post(`/api/trades/${created.body.id}/cancel`);
    const res = await request(app).post(`/api/trades/${created.body.id}/cancel`);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/trades/:id', () => {
  it('amends an active trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'NVDA', quantity: 300, price: 450, side: 'BUY',
      trader: 'SDAVIS', book: 'TECH_GROWTH', counterparty: 'Barclays',
    });
    const res = await request(app).patch(`/api/trades/${created.body.id}`).send({ quantity: 600 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(600);
  });

  it('returns 409 when amending a cancelled trade', async () => {
    const created = await request(app).post('/api/trades').send({
      symbol: 'META', quantity: 150, price: 520, side: 'SELL',
      trader: 'LTAYLOR', book: 'EQUITIES_US', counterparty: 'Citi',
    });
    await request(app).post(`/api/trades/${created.body.id}/cancel`);
    const res = await request(app).patch(`/api/trades/${created.body.id}`).send({ quantity: 200 });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 4: Run tests — expect FAIL (app not created yet)**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run tests/routes.test.ts
```

- [ ] **Step 5: Create `backend/src/app.ts`**

```typescript
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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

  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json());

  const tradeRepo = new TradeRepository(prisma);
  const auditRepo = new AuditRepository(prisma);
  const auditService = new AuditService(auditRepo);
  const tradeService = new TradeService(tradeRepo, auditService);

  app.use('/api/trades', createTradeRouter(tradeService, broadcaster));
  app.use('/api/audit', createAuditRouter(auditService));

  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message });
  });

  return app;
}
```

- [ ] **Step 6: Run routes tests — expect PASS**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run tests/routes.test.ts
```

- [ ] **Step 7: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/routes/ backend/src/app.ts backend/tests/routes.test.ts
git commit -m "feat: add REST routes for trades and audit with error handling"
```

---

## Task 9: Server Entry Point + Run All Backend Tests

**Files:**
- Create: `backend/src/index.ts`

**Interfaces:**
- Consumes: `createApp`, `Broadcaster`, `prisma`, `seed`
- Produces: HTTP server on `PORT` with WS upgraded from same port

- [ ] **Step 1: Create `backend/src/index.ts`**

```typescript
import 'dotenv/config';
import http from 'http';
import { WebSocketServer } from 'ws';
import { prisma } from './lib/prisma';
import { createApp } from './app';
import { Broadcaster } from './websocket/broadcaster';
import { seed } from './seed/seed';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main(): Promise<void> {
  await seed();

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
```

- [ ] **Step 2: Run all backend tests**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 3: Smoke-test the server**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npm run dev &
sleep 3 && curl -s http://localhost:3001/api/trades | head -c 200
```

Expected: JSON array of trades

- [ ] **Step 4: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/src/index.ts
git commit -m "feat: add server entry point with WebSocket upgrade and seed on startup"
```

---

## Task 10: Frontend Scaffolding + Types + API Client

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/types/trade.ts`
- Create: `frontend/src/api/trades.ts`

**Interfaces:**
- Produces: `Trade`, `TradeAudit`, `CreateTradeInput`, `AmendTradeInput`, `WsEvent` frontend types
- Produces: `tradesApi` object with `getAll`, `create`, `amend`, `cancel`, `getAudit` functions

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "trade-blotter-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ag-grid-community": "^31.3.4",
    "ag-grid-react": "^31.3.4",
    "@tanstack/react-query": "^5.59.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.2",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.9",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 4: Create `frontend/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Create `frontend/src/types/trade.ts`**

```typescript
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'ACTIVE' | 'CANCELLED';
export type WsEventType = 'TRADE_CREATED' | 'TRADE_AMENDED' | 'TRADE_CANCELLED';

export interface Trade {
  id: string;
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: string;
  status: TradeStatus;
}

export interface TradeAudit {
  id: string;
  tradeId: string;
  action: string;
  before: Trade | null;
  after: Trade;
  changedAt: string;
}

export interface WsEvent {
  type: WsEventType;
  payload: Trade;
}

export interface CreateTradeInput {
  symbol: string;
  quantity: number;
  price: number;
  side: TradeSide;
  trader: string;
  book: string;
  counterparty: string;
}

export interface AmendTradeInput {
  symbol?: string;
  quantity?: number;
  price?: number;
  side?: TradeSide;
  trader?: string;
  book?: string;
  counterparty?: string;
}
```

- [ ] **Step 6: Create `frontend/src/api/trades.ts`**

```typescript
import { Trade, TradeAudit, CreateTradeInput, AmendTradeInput } from '../types/trade';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error ?? 'Unknown error') as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const tradesApi = {
  getAll: (): Promise<Trade[]> =>
    fetch(`${BASE}/trades`).then(handleResponse<Trade[]>),

  getById: (id: string): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}`).then(handleResponse<Trade>),

  create: (input: CreateTradeInput): Promise<Trade> =>
    fetch(`${BASE}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handleResponse<Trade>),

  amend: (id: string, input: AmendTradeInput): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(handleResponse<Trade>),

  cancel: (id: string): Promise<Trade> =>
    fetch(`${BASE}/trades/${id}/cancel`, { method: 'POST' }).then(handleResponse<Trade>),

  getAudit: (tradeId: string): Promise<TradeAudit[]> =>
    fetch(`${BASE}/audit/${tradeId}`).then(handleResponse<TradeAudit[]>),
};
```

- [ ] **Step 7: Install frontend dependencies**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/frontend && npm install
```

- [ ] **Step 8: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/
git commit -m "feat: scaffold frontend with Vite/React/AG Grid/TanStack Query and API client"
```

---

## Task 11: WebSocket Hook + TanStack Query Hooks

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/hooks/useTrades.ts`

**Interfaces:**
- Produces:
  - `useWebSocket(onEvent: (e: WsEvent) => void): { connected: boolean }`
  - `useTrades(): { trades, isLoading, error, refetch, createTrade, amendTrade, cancelTrade }`

- [ ] **Step 1: Create `frontend/src/hooks/useWebSocket.ts`**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { WsEvent } from '../types/trade';

const WS_URL = `ws://${window.location.hostname}:3001/ws`;
const RECONNECT_DELAY_MS = 3000;

export function useWebSocket(onEvent: (event: WsEvent) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, RECONNECT_DELAY_MS);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as WsEvent;
        onEventRef.current(event);
      } catch {
        // malformed message — ignore
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useTrades.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { tradesApi } from '../api/trades';
import { Trade, CreateTradeInput, AmendTradeInput, WsEvent } from '../types/trade';
import { useWebSocket } from './useWebSocket';

const TRADES_KEY = ['trades'] as const;

export function useTrades() {
  const queryClient = useQueryClient();

  const { data: trades = [], isLoading, error, refetch } = useQuery({
    queryKey: TRADES_KEY,
    queryFn: tradesApi.getAll,
  });

  const handleWsEvent = useCallback((event: WsEvent) => {
    queryClient.setQueryData<Trade[]>(TRADES_KEY, (prev = []) => {
      switch (event.type) {
        case 'TRADE_CREATED':
          return [event.payload, ...prev];
        case 'TRADE_AMENDED':
        case 'TRADE_CANCELLED':
          return prev.map((t) => (t.id === event.payload.id ? event.payload : t));
        default:
          return prev;
      }
    });
  }, [queryClient]);

  const { connected } = useWebSocket(handleWsEvent);

  const createMutation = useMutation({
    mutationFn: (input: CreateTradeInput) => tradesApi.create(input),
  });

  const amendMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AmendTradeInput }) =>
      tradesApi.amend(id, input),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
  });

  return {
    trades,
    isLoading,
    error,
    refetch,
    connected,
    createTrade: createMutation.mutateAsync,
    amendTrade: amendMutation.mutateAsync,
    cancelTrade: cancelMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isAmending: amendMutation.isPending,
    isCancelling: cancelMutation.isPending,
  };
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/src/hooks/
git commit -m "feat: add WebSocket hook with reconnect and TanStack Query trade hooks"
```

---

## Task 12: AG Grid Column Definitions + Formatters

**Files:**
- Create: `frontend/src/utils/formatters.ts`
- Create: `frontend/src/components/TradeBlotter/columnDefs.ts`

**Interfaces:**
- Produces: `colDefs` array consumed by `TradeBlotter.tsx`

- [ ] **Step 1: Create `frontend/src/utils/formatters.ts`**

```typescript
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function formatPrice(value: number): string {
  return value.toFixed(2);
}

export function formatQuantity(value: number): string {
  return value.toLocaleString();
}
```

- [ ] **Step 2: Create `frontend/src/components/TradeBlotter/columnDefs.ts`**

```typescript
import { ColDef } from 'ag-grid-community';
import { Trade } from '../../types/trade';
import { formatDate, formatPrice, formatQuantity } from '../../utils/formatters';

export const colDefs: ColDef<Trade>[] = [
  { field: 'id', headerName: 'Trade ID', width: 130, pinned: 'left', filter: 'agTextColumnFilter' },
  { field: 'symbol', headerName: 'Symbol', width: 100, filter: 'agTextColumnFilter' },
  {
    field: 'side', headerName: 'Side', width: 90,
    cellStyle: (params) => ({
      color: params.value === 'BUY' ? '#16a34a' : '#dc2626',
      fontWeight: 600,
    }),
    filter: 'agTextColumnFilter',
  },
  {
    field: 'quantity', headerName: 'Quantity', width: 120,
    valueFormatter: (p) => formatQuantity(p.value as number),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
  },
  {
    field: 'price', headerName: 'Price', width: 100,
    valueFormatter: (p) => formatPrice(p.value as number),
    filter: 'agNumberColumnFilter',
    type: 'numericColumn',
  },
  { field: 'trader', headerName: 'Trader', width: 110, filter: 'agTextColumnFilter' },
  { field: 'book', headerName: 'Book', width: 140, filter: 'agTextColumnFilter' },
  { field: 'counterparty', headerName: 'Counterparty', width: 150, filter: 'agTextColumnFilter' },
  {
    field: 'tradeTimestamp', headerName: 'Timestamp', width: 180,
    valueFormatter: (p) => formatDate(p.value as string),
    sort: 'desc',
  },
  {
    field: 'status', headerName: 'Status', width: 110,
    cellStyle: (params) => ({
      color: params.value === 'ACTIVE' ? '#16a34a' : '#6b7280',
    }),
    filter: 'agTextColumnFilter',
  },
];
```

- [ ] **Step 3: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/src/utils/ frontend/src/components/TradeBlotter/columnDefs.ts
git commit -m "feat: add AG Grid column definitions and value formatters"
```

---

## Task 13: TradeBlotter Component

**Files:**
- Create: `frontend/src/components/TradeBlotter/TradeBlotter.tsx`

**Interfaces:**
- Consumes: `colDefs`, `useTrades`, `Trade`
- Props: `onAmend: (trade: Trade) => void`, `onViewAudit: (trade: Trade) => void`

- [ ] **Step 1: Create `frontend/src/components/TradeBlotter/TradeBlotter.tsx`**

```tsx
import { useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { GridReadyEvent, GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Trade } from '../../types/trade';
import { useTrades } from '../../hooks/useTrades';
import { colDefs } from './columnDefs';

interface Props {
  onAmend: (trade: Trade) => void;
  onCreate: () => void;
  onViewAudit: (trade: Trade) => void;
}

export function TradeBlotter({ onAmend, onCreate, onViewAudit }: Props) {
  const { trades, isLoading, error, refetch, cancelTrade, connected } = useTrades();
  const gridApiRef = useRef<GridApi | null>(null);

  const onGridReady = useCallback((e: GridReadyEvent) => {
    gridApiRef.current = e.api;
  }, []);

  const actionColDef = {
    headerName: 'Actions',
    width: 220,
    pinned: 'right' as const,
    sortable: false,
    filter: false,
    cellRenderer: (params: { data: Trade }) => {
      const trade = params.data;
      if (!trade) return null;
      return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}>
          <button
            onClick={() => onAmend(trade)}
            disabled={trade.status === 'CANCELLED'}
            style={btnStyle(trade.status === 'CANCELLED')}
          >
            Amend
          </button>
          <button
            onClick={() => cancelTrade(trade.id)}
            disabled={trade.status === 'CANCELLED'}
            style={btnStyle(trade.status === 'CANCELLED', '#dc2626')}
          >
            Cancel
          </button>
          <button onClick={() => onViewAudit(trade)} style={btnStyle(false, '#6366f1')}>
            Audit
          </button>
        </div>
      );
    },
  };

  if (error) return <div style={{ color: 'red', padding: 16 }}>Failed to load trades: {String(error)}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>
        <button onClick={onCreate} style={btnStyle(false, '#16a34a')}>+ New Trade</button>
        <button onClick={() => refetch()} style={btnStyle(false)}>Refresh</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: connected ? '#16a34a' : '#dc2626' }}>
          {connected ? '● Live' : '○ Reconnecting...'}
        </span>
      </div>
      <div className="ag-theme-alpine" style={{ flex: 1 }}>
        {isLoading ? (
          <div style={{ padding: 16 }}>Loading...</div>
        ) : (
          <AgGridReact
            rowData={trades}
            columnDefs={[...colDefs, actionColDef]}
            onGridReady={onGridReady}
            defaultColDef={{ sortable: true, resizable: true, floatingFilter: true }}
            pagination
            paginationPageSize={50}
            rowHeight={36}
            animateRows
            getRowId={(p) => p.data.id}
          />
        )}
      </div>
    </div>
  );
}

function btnStyle(disabled: boolean, color = '#3b82f6'): React.CSSProperties {
  return {
    padding: '2px 8px', fontSize: 12, borderRadius: 4, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#e5e7eb' : color, color: disabled ? '#9ca3af' : '#fff',
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/src/components/TradeBlotter/TradeBlotter.tsx
git commit -m "feat: add AG Grid TradeBlotter component with action buttons and live indicator"
```

---

## Task 14: TradeForm Component

**Files:**
- Create: `frontend/src/components/TradeForm/TradeForm.tsx`

**Interfaces:**
- Consumes: `useTrades`, `Trade`, `CreateTradeInput`, `AmendTradeInput`
- Props: `trade?: Trade` (undefined = create mode), `onClose: () => void`

- [ ] **Step 1: Create `frontend/src/components/TradeForm/TradeForm.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Trade, CreateTradeInput, AmendTradeInput, TradeSide } from '../../types/trade';
import { useTrades } from '../../hooks/useTrades';

interface Props {
  trade?: Trade;
  onClose: () => void;
}

const SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BABA'];
const BOOKS = ['EQUITIES_UK', 'EQUITIES_US', 'TECH_GROWTH', 'EMERGING_MKTS', 'FIXED_INCOME'];
const COUNTERPARTIES = ['Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Barclays', 'Deutsche Bank', 'UBS', 'Citi'];

type FormErrors = Partial<Record<string, string>>;

function validate(values: Partial<CreateTradeInput>): FormErrors {
  const errors: FormErrors = {};
  if (!values.symbol) errors.symbol = 'Symbol is required';
  if (!values.quantity || values.quantity <= 0) errors.quantity = 'Quantity must be positive';
  if (!values.price || values.price <= 0) errors.price = 'Price must be positive';
  if (!values.side) errors.side = 'Side is required';
  if (!values.trader?.trim()) errors.trader = 'Trader is required';
  if (!values.book) errors.book = 'Book is required';
  if (!values.counterparty) errors.counterparty = 'Counterparty is required';
  return errors;
}

export function TradeForm({ trade, onClose }: Props) {
  const { createTrade, amendTrade, isCreating, isAmending } = useTrades();
  const isEdit = !!trade;

  const [values, setValues] = useState<Partial<CreateTradeInput>>({
    symbol: trade?.symbol ?? '',
    quantity: trade?.quantity,
    price: trade?.price,
    side: trade?.side ?? 'BUY',
    trader: trade?.trader ?? '',
    book: trade?.book ?? '',
    counterparty: trade?.counterparty ?? '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => { setErrors({}); setSubmitError(null); }, [trade]);

  const set = (key: keyof CreateTradeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = isEdit ? {} : validate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    try {
      if (isEdit) {
        const changes: AmendTradeInput = {};
        if (values.symbol !== trade.symbol) changes.symbol = values.symbol;
        if (values.quantity !== trade.quantity) changes.quantity = values.quantity;
        if (values.price !== trade.price) changes.price = values.price;
        if (values.side !== trade.side) changes.side = values.side as TradeSide;
        if (values.trader !== trade.trader) changes.trader = values.trader;
        if (values.book !== trade.book) changes.book = values.book;
        if (values.counterparty !== trade.counterparty) changes.counterparty = values.counterparty;
        if (Object.keys(changes).length === 0) { onClose(); return; }
        await amendTrade({ id: trade.id, input: changes });
      } else {
        await createTrade(values as CreateTradeInput);
      }
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>{isEdit ? `Amend ${trade.id}` : 'New Trade'}</h2>
        <form onSubmit={handleSubmit}>
          <Field label="Symbol" error={errors.symbol}>
            <select value={values.symbol} onChange={set('symbol')} style={inputStyle}>
              <option value="">Select...</option>
              {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Side" error={errors.side}>
            <select value={values.side} onChange={set('side')} style={inputStyle}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </Field>
          <Field label="Quantity" error={errors.quantity}>
            <input type="number" min={1} value={values.quantity ?? ''} onChange={set('quantity')} style={inputStyle} />
          </Field>
          <Field label="Price" error={errors.price}>
            <input type="number" min={0.01} step={0.01} value={values.price ?? ''} onChange={set('price')} style={inputStyle} />
          </Field>
          <Field label="Trader" error={errors.trader}>
            <input value={values.trader ?? ''} onChange={set('trader')} style={inputStyle} placeholder="e.g. JSMITH" />
          </Field>
          <Field label="Book" error={errors.book}>
            <select value={values.book} onChange={set('book')} style={inputStyle}>
              <option value="">Select...</option>
              {BOOKS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Counterparty" error={errors.counterparty}>
            <select value={values.counterparty} onChange={set('counterparty')} style={inputStyle}>
              <option value="">Select...</option>
              {COUNTERPARTIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          {submitError && <p style={{ color: '#dc2626', fontSize: 13 }}>{submitError}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={isCreating || isAmending} style={{ ...btnBase, background: '#3b82f6', color: '#fff' }}>
              {isCreating || isAmending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{label}</label>
      {children}
      {error && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 420,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', border: '1px solid #d1d5db',
  borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
};
const btnBase: React.CSSProperties = {
  padding: '8px 16px', border: 'none', borderRadius: 4,
  cursor: 'pointer', fontSize: 14, fontWeight: 500,
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/src/components/TradeForm/
git commit -m "feat: add TradeForm modal for create and amend with validation"
```

---

## Task 15: AuditPanel Component

**Files:**
- Create: `frontend/src/components/AuditPanel/AuditPanel.tsx`

**Interfaces:**
- Consumes: `tradesApi.getAudit`, `Trade`, `TradeAudit`
- Props: `trade: Trade | null`, `onClose: () => void`

- [ ] **Step 1: Create `frontend/src/components/AuditPanel/AuditPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Trade, TradeAudit } from '../../types/trade';
import { tradesApi } from '../../api/trades';
import { formatDate } from '../../utils/formatters';

interface Props {
  trade: Trade | null;
  onClose: () => void;
}

export function AuditPanel({ trade, onClose }: Props) {
  const [history, setHistory] = useState<TradeAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trade) return;
    setLoading(true);
    setError(null);
    tradesApi.getAudit(trade.id)
      .then(setHistory)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [trade]);

  if (!trade) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Audit: {trade.id}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
        {!loading && history.length === 0 && <p style={{ color: '#6b7280' }}>No audit history.</p>}
        {history.map((entry) => (
          <div key={entry.id} style={entryStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: actionColor(entry.action) }}>{entry.action}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(entry.changedAt)}</span>
            </div>
            {entry.before && (
              <div style={{ fontSize: 12 }}>
                <strong>Changes:</strong>
                {diffFields(entry.before, entry.after).map(({ field, from, to }) => (
                  <div key={field} style={{ marginLeft: 8 }}>
                    {field}: <span style={{ color: '#dc2626' }}>{String(from)}</span>
                    {' → '}
                    <span style={{ color: '#16a34a' }}>{String(to)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function diffFields(before: Trade, after: Trade): { field: string; from: unknown; to: unknown }[] {
  return (Object.keys(after) as (keyof Trade)[])
    .filter((k) => k !== 'tradeTimestamp' && before[k] !== after[k])
    .map((k) => ({ field: k, from: before[k], to: after[k] }));
}

function actionColor(action: string): string {
  if (action === 'CREATE') return '#16a34a';
  if (action === 'CANCEL') return '#dc2626';
  return '#2563eb';
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const panelStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 24, width: 500,
  maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const entryStyle: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 8, borderRadius: 6,
  background: '#f9fafb', border: '1px solid #e5e7eb',
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/src/components/AuditPanel/
git commit -m "feat: add AuditPanel with diff display per entry"
```

---

## Task 16: App.tsx + Entry Point

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Trade Blotter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Create `frontend/src/App.tsx`**

```tsx
import { useState } from 'react';
import { Trade } from './types/trade';
import { TradeBlotter } from './components/TradeBlotter/TradeBlotter';
import { TradeForm } from './components/TradeForm/TradeForm';
import { AuditPanel } from './components/AuditPanel/AuditPanel';

export function App() {
  const [formTrade, setFormTrade] = useState<Trade | undefined | null>(null);
  const [auditTrade, setAuditTrade] = useState<Trade | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ background: '#1e293b', color: '#f8fafc', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Trade Blotter</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Equity Trades</span>
      </header>
      <main style={{ flex: 1, padding: 16, overflow: 'hidden' }}>
        <TradeBlotter
          onAmend={(trade) => setFormTrade(trade)}
          onCreate={() => setFormTrade(undefined)}
          onViewAudit={(trade) => setAuditTrade(trade)}
        />
      </main>
      {formTrade !== null && (
        <TradeForm
          trade={formTrade ?? undefined}
          onClose={() => setFormTrade(null)}
        />
      )}
      {auditTrade && (
        <AuditPanel trade={auditTrade} onClose={() => setAuditTrade(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/index.html frontend/src/main.tsx frontend/src/App.tsx
git commit -m "feat: add App root with modal state management for form and audit panel"
```

---

## Task 17: Docker Setup

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `database/.gitkeep`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 4: Create `docker-compose.yml`**

```yaml
version: '3.9'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    volumes:
      - ./database:/database
    environment:
      - DATABASE_URL=file:/database/trades.db
      - PORT=3001
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/trades"]
      interval: 10s
      timeout: 5s
      retries: 5

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      backend:
        condition: service_healthy
```

- [ ] **Step 5: Create `database/.gitkeep`**

```bash
touch /Users/antonona/Web_Dev/trade-blotter/database/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add backend/Dockerfile frontend/Dockerfile frontend/nginx.conf docker-compose.yml database/.gitkeep
git commit -m "feat: add Docker setup with multi-stage builds and nginx reverse proxy"
```

---

## Task 18: README + AI Usage Docs

**Files:**
- Create: `README.md`
- Create: `AI_USAGE_REPORT.md`
- Create: `PROMPT_LOG.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Trade Blotter

A full-stack equity trade blotter with real-time updates.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite, AG Grid Community (virtualised table), TanStack Query (server state), native WebSocket hook with auto-reconnect
- **Backend:** Node.js 20 + Express 4 + TypeScript, `ws` library for WebSocket on the same HTTP port, Zod for request validation
- **Database:** SQLite via Prisma ORM — zero external services, single file, auto-migrated on startup
- **Real-time:** Native WebSockets. Every trade mutation broadcasts a typed `WsEvent` to all connected clients. The frontend applies incremental updates to the AG Grid without a full refetch.
- **Audit trail:** Append-only `TradeAudit` table records every CREATE/AMEND/CANCEL with before/after snapshots.

### Trade-offs

| Decision | Rationale |
|---|---|
| SQLite over PostgreSQL | Zero infra overhead; Prisma makes migration trivial if needed |
| `ws` over Socket.IO | ~10kB vs ~200kB bundle, no transport negotiation, sufficient for this scope |
| TanStack Query | Eliminates manual loading/error state; cache invalidation via WebSocket is clean |
| AG Grid Community | Virtualisation handles 1,000+ rows with zero lag; floatingFilter + pagination out of the box |
| Inline styles over CSS modules | Reduces setup friction; not a production trade-off |

### Assumptions

- Single-region, single-process deployment — SQLite is appropriate
- Trade IDs are server-generated; clients never supply IDs
- Cancellation is terminal — cancelled trades cannot be amended or re-activated
- Seed runs once on startup; idempotent (checks `COUNT(*)` before inserting)

## Installation

### Prerequisites

- Node.js ≥ 20
- npm ≥ 9

### Local (no Docker)

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Docker

```bash
docker-compose up --build
```

Open http://localhost:3000

## Running Tests

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/trades` | List all trades |
| GET | `/api/trades/:id` | Get single trade |
| POST | `/api/trades` | Create trade |
| PATCH | `/api/trades/:id` | Amend trade |
| POST | `/api/trades/:id/cancel` | Cancel trade |
| GET | `/api/audit/:tradeId` | Get audit history |

WebSocket: `ws://localhost:3001/ws` — receives `{ type, payload }` on every mutation.
````

- [ ] **Step 2: Create `AI_USAGE_REPORT.md`**

```markdown
# AI Usage Report

## Tools Used

- **Claude Code (claude-sonnet-4-6)** — primary development assistant

## How AI Was Used

AI was used throughout the development lifecycle:

1. **Architecture design** — brainstormed three stack options (Express+SQLite+ws, Fastify+PostgreSQL+Socket.IO, NestJS+PostgreSQL), evaluated trade-offs, selected Approach A.
2. **Implementation planning** — generated a detailed task-by-task implementation plan with TDD steps, interface contracts, and exact file paths before writing any code.
3. **Code generation** — generated boilerplate for Prisma schema, repository classes, service layer, route handlers, React components, and AG Grid column definitions.
4. **Test writing** — generated Vitest unit tests for `TradeService` (covering 409 guards) and integration tests via Supertest for routes.

## Key Decisions Influenced by AI

- **Broadcaster pattern** — AI suggested a `Set<WebSocket>` registry with `ws.on('close')` cleanup rather than array splicing. Accepted: cleaner and correct.
- **`httpError` helper** — attaching `statusCode` to `Error` instances rather than custom error classes. Accepted: low boilerplate for this scope.
- **TanStack Query + WS incremental update** — AI recommended `setQueryData` for in-place cache updates on WebSocket events rather than `invalidateQueries`. Accepted: avoids unnecessary round-trips.

## Rejected Suggestions

- AI initially suggested Socket.IO for the real-time layer. Rejected in favour of native `ws` — Socket.IO's transport negotiation and bundle size are unnecessary overhead here.
- AI suggested `useReducer` for form state in `TradeForm`. Rejected in favour of a simple `useState` object — the form is small enough that a reducer adds complexity without benefit.

## Prompt Examples

See `PROMPT_LOG.md`.
```

- [ ] **Step 3: Create `PROMPT_LOG.md`**

```markdown
# Prompt Log

## Prompt 1 — Architecture Selection

**Prompt:**
"I have a take-home exercise to build a trade blotter: React/TypeScript frontend, TypeScript backend, database, real-time updates. Propose 3 stack options with trade-offs."

**Outcome:**
Three options presented (Express+SQLite+ws, Fastify+PostgreSQL+Socket.IO, NestJS+PostgreSQL). Selected Approach A (Express+SQLite+ws) for zero-infra simplicity and maximum time on code quality.

---

## Prompt 2 — Implementation Planning

**Prompt:**
"Create a task-by-task implementation plan for the trade blotter. Backend: Express, Prisma, SQLite, ws. Frontend: React, Vite, AG Grid, TanStack Query. Include TDD steps, exact file paths, interface contracts."

**Outcome:**
18-task plan generated covering scaffolding through Docker. Used directly with minor adjustments to task ordering.

---

## Prompt 3 — WebSocket Architecture

**Prompt:**
"Design a WebSocket broadcaster for Express that broadcasts typed trade events to all connected clients."

**Outcome:**
`Broadcaster` class using `Set<WebSocket>` with `ws.on('close')` cleanup. Used as-is — the pattern is clean and testable.

---

## Prompt 4 — TanStack Query + WebSocket Integration

**Prompt:**
"How should a React app using TanStack Query apply incremental updates from a WebSocket without triggering a full refetch?"

**Outcome:**
`setQueryData` with a switch on event type (`TRADE_CREATED` prepends, `TRADE_AMENDED`/`TRADE_CANCELLED` maps). Used as-is.

---

## Prompt 5 — AG Grid Column Definitions

**Prompt:**
"Write AG Grid column definitions for a trade blotter with fields: id, symbol, side, quantity, price, trader, book, counterparty, tradeTimestamp, status. Include value formatters and cell styles for side/status."

**Outcome:**
Column definitions generated with green/red cell styles for BUY/SELL and ACTIVE/CANCELLED. Accepted with addition of `pinned: 'left'` for the ID column.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add README.md AI_USAGE_REPORT.md PROMPT_LOG.md
git commit -m "docs: add README, AI usage report, and prompt log"
```

---

## Task 19: Run Full Test Suite + Smoke Test

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npx vitest run
```

Expected: all PASS

- [ ] **Step 2: Run all frontend tests**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/frontend && npx vitest run
```

Expected: all PASS (or no tests yet — add one smoke test)

- [ ] **Step 3: Add a smoke test for formatters**

Create `frontend/src/utils/formatters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatPrice, formatQuantity } from './formatters';

describe('formatters', () => {
  it('formatPrice formats to 2 dp', () => {
    expect(formatPrice(227.4)).toBe('227.40');
    expect(formatPrice(1000)).toBe('1000.00');
  });

  it('formatQuantity adds thousand separators', () => {
    expect(formatQuantity(5000)).toBe('5,000');
    expect(formatQuantity(100)).toBe('100');
  });
});
```

- [ ] **Step 4: Run frontend tests again — expect PASS**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/frontend && npx vitest run
```

- [ ] **Step 5: Start dev servers and verify app loads**

```bash
cd /Users/antonona/Web_Dev/trade-blotter/backend && npm run dev &
cd /Users/antonona/Web_Dev/trade-blotter/frontend && npm run dev &
sleep 5 && curl -s http://localhost:3001/api/trades | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} trades loaded')"
```

Expected: `200 trades loaded`

- [ ] **Step 6: Final commit**

```bash
cd /Users/antonona/Web_Dev/trade-blotter
git add frontend/src/utils/formatters.test.ts
git commit -m "test: add formatter unit tests and complete initial implementation"
```
