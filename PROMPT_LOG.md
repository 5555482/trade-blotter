# Prompt Log

A representative sample of significant prompts used during development.

---

## Prompt 1 — Architecture Selection

**Prompt:**
"I have a take-home exercise to build a trade blotter: React/TypeScript frontend, TypeScript backend, database, real-time updates. Propose 3 stack options with trade-offs and a recommendation."

**Outcome:**
Three options presented:
- Approach A: Express + SQLite + native `ws` (recommended)
- Approach B: Fastify + PostgreSQL + Socket.IO
- Approach C: NestJS + PostgreSQL + WebSockets

Selected Approach A — zero infra overhead, maximum time available for code quality and features that score highly in assessment criteria.

---

## Prompt 2 — Implementation Planning

**Prompt:**
"Create a task-by-task implementation plan for the trade blotter. Backend: Express, Prisma, SQLite, ws. Frontend: React, Vite, AG Grid, TanStack Query. Include TDD steps, exact file paths, interface contracts, and expected test output for each task."

**Outcome:**
19-task plan generated. Used directly. Key decisions locked in during planning:
- `createApp(prisma, broadcaster)` factory pattern for testability
- `httpError` helper instead of custom error classes
- `setQueryData` for WS incremental updates rather than `invalidateQueries`

---

## Prompt 3 — WebSocket Architecture

**Prompt:**
"Design a WebSocket broadcaster for Express that broadcasts typed trade events to all connected clients. Should handle client disconnect cleanup."

**Outcome:**
`Broadcaster` class using `Set<WebSocket>` with `ws.on('close')` auto-cleanup. Used as-is — clean, testable, no memory leaks.

---

## Prompt 4 — TanStack Query + WebSocket Integration

**Prompt:**
"How should a React app using TanStack Query apply incremental updates from a WebSocket without triggering a full refetch? The events are TRADE_CREATED, TRADE_AMENDED, TRADE_CANCELLED."

**Outcome:**
`setQueryData` with a switch statement: CREATED prepends the payload, AMENDED/CANCELLED maps over the array replacing the matching trade by ID. AG Grid's `getRowId` prop ensures the grid patches rows in place rather than re-rendering the full list, preserving filter state.

---

## Prompt 5 — AG Grid Column Definitions

**Prompt:**
"Write AG Grid column definitions for a trade blotter with fields: id, symbol, side, quantity, price, trader, book, counterparty, tradeTimestamp, status. Include value formatters, cell styles for side (green/red) and status (green/grey), and floating filters."

**Outcome:**
Column definitions generated with colour coding. Accepted with one addition: `pinned: 'left'` for the Trade ID column so it stays visible when scrolling horizontally.

---

## Prompt 6 — Audit Trail Design

**Prompt:**
"Design an append-only audit trail for trade mutations. Each record should capture action (CREATE/AMEND/CANCEL), the before snapshot, and the after snapshot. Should be queryable by trade ID."

**Outcome:**
`TradeAudit` Prisma model with `before` and `after` stored as JSON strings (SQLite has no native JSON column type). `AuditRepository` wraps serialisation/deserialisation. `AuditService` provides the `record(action, before, after)` interface called by `TradeService`. Used as-is.

---

## Prompt 7 — 409 Guard Tests

**Prompt:**
"Write Vitest unit tests for TradeService that verify: cancelling an already-cancelled trade throws 409, amending a cancelled trade throws 409, cancelling a non-existent trade throws 404."

**Outcome:**
Tests generated with `vi.fn()` mocked repository and audit service. Tests written first, watched to fail, then `TradeService` implemented to pass them. All three edge cases from the Review Focus section are covered.
