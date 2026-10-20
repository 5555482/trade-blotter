# AI Usage Report

## Tools Used

- **Claude Code (claude-sonnet-4-6)** — primary development assistant used throughout

## How AI Was Used

AI drove the entire development lifecycle end-to-end:

1. **Architecture design** — Three stack options were brainstormed (Express+SQLite+ws, Fastify+PostgreSQL+Socket.IO, NestJS+PostgreSQL). Trade-offs were evaluated and Approach A was selected for zero-infra simplicity, maximising time on code quality rather than infrastructure wiring.

2. **Implementation planning** — A detailed 19-task implementation plan was generated with TDD steps, interface contracts, exact file paths, and test cases for every task before writing any production code.

3. **Code generation** — All production code was generated: Prisma schema, repository classes, service layer with business rule enforcement, Express route handlers, React components, AG Grid column definitions, WebSocket hook with reconnect logic.

4. **Test writing** — Vitest unit tests for `TradeService` (covering 409 guard paths) and Supertest integration tests for all REST routes were generated following TDD: tests written first, watched to fail, implementation written to make them pass.

5. **Documentation** — README, AI usage report, and prompt log were all generated.

## Key Decisions Influenced by AI

| Decision | Outcome |
|---|---|
| **Broadcaster pattern** | `Set<WebSocket>` registry with `ws.on('close')` cleanup rather than array splicing — clean and correct |
| **`httpError` helper** | Attaching `statusCode` to `Error` instances avoids custom error class hierarchy for this scope |
| **TanStack Query + WS incremental update** | `setQueryData` with a switch on event type rather than `invalidateQueries` — avoids unnecessary refetches |
| **Seed idempotency** | `COUNT(*)` guard before insert ensures startup is safe to run repeatedly |
| **`createApp` factory** | Accepting `prisma` and `broadcaster` as parameters makes integration tests trivial — no global state |

## Rejected Suggestions

- **Socket.IO** — AI initially suggested Socket.IO for real-time. Rejected in favour of native `ws` — Socket.IO's transport negotiation and ~200kB bundle weight are unnecessary overhead for this scope.
- **`useReducer` for form state** — AI suggested a reducer for `TradeForm`. Rejected in favour of a simple `useState` object — the form is small enough that a reducer adds complexity without benefit.
- **Custom error classes** — AI initially proposed a class hierarchy (`TradeNotFoundError`, `TradeCancelledError`). Replaced with a simple `httpError` helper function — same result, 80% less code.

## Areas Where AI Suggestions Were Accepted Directly

- WebSocket hook reconnect logic (3s backoff, `useRef` for stable callback)
- `toTradeDTO` mapper function in repository (isolates Prisma type from domain type)
- Audit diff display in `AuditPanel` (field-by-field comparison with before/after colours)
