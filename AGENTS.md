# AGENTS.md: Coin Vault

Instructions for AI coding agents working in this repository. Read `docs/design-doc.md` before changing anything. It is the source of truth for the schema, endpoints, status codes, and locking.

## 1. Stack

- Node.js 18 or later
- TypeScript. The API runs with `tsx`. The page is a Next.js app in `frontend/`.
- Express (latest 4.x)
- PostgreSQL, hosted (for example Supabase). Do not assume a local Docker database.
- `pg` with a single shared `Pool`
- `zod` for request validation
- Jest and supertest for tests

## 2. Commands

```bash
npm install          # install workspace dependencies
npm start            # build the Next.js page, then serve it on port 3000 and the API on port 3001
npm test             # run backend Jest tests against DATABASE_URL (must be a test database)
npm run db:reset     # applies backend/sql/reset.sql then backend/sql/seed.sql to DATABASE_URL
npm run db:schema    # applies backend/sql/schema.sql (fresh database only)
```

`package.json` scripts must map to these names exactly.

## 3. Environment

- `DATABASE_URL`: Postgres connection string. Read only in `backend/src/db/pool.ts`. `.env` and `.env.test` stay at the repo root.
- Use the session pooler connection string for Supabase. The direct connection is IPv6-only on the free tier.
- SSL is required: `ssl: { rejectUnauthorized: false }`.
- Never hardcode credentials. Never commit `.env`. Provide `.env.example` with a placeholder.
- Tests must point at a dedicated test database, never the one used for manual runs.

Pool setup (`backend/src/db/pool.ts`):
```ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export { pool };
```

## 4. File layout

```
backend/
  src/
    server.ts                # starts the HTTP server
    loadEnv.ts               # loads the repo-root .env before the pool is created
    app.ts                   # builds the Express app, mounts routes, error handler
    errors.ts                # AppError(status, code, message)
    types/
      express.d.ts           # adds req.userId
    db/
      pool.ts                # single pg Pool
      withTransaction.ts     # helper: BEGIN, run fn(client), COMMIT or ROLLBACK, always release
      applySql.ts            # applies SQL files for db:schema and db:reset
    middleware/
      userId.ts              # reads X-User-Id, validates UUID, sets req.userId
    validators/
      users.ts
      products.ts
      topUps.ts
      purchases.ts
      pagination.ts          # limit (1..100, default 20) and cursor
    services/
      userService.ts
      topUpService.ts        # create and confirm, per design doc 5.3 and 5.4
      purchaseService.ts     # per design doc 5.5
      ledgerService.ts       # transactions list, inventory list
    routes/
      users.ts               # POST /users
      coinPacks.ts           # GET /coin-packs
      products.ts            # GET /products
      topUps.ts              # POST /top-ups, POST /top-ups/:id/confirm
      purchases.ts           # POST /purchases
      me.ts                  # GET /me/balance, /me/transactions, /me/inventory
  sql/
    schema.sql               # from design doc section 2
    seed.sql                 # from design doc section 2
    reset.sql                # from design doc section 2
  tests/
    loadEnv.ts               # loads repo-root .env.test before the test framework
    setup.ts                 # runs reset before each test
    support.ts               # shared request helpers
    users.test.ts            # A1, A11
    topUps.test.ts           # A2, A3, A10
    purchases.test.ts        # A4 to A7
    concurrency.test.ts      # A8
    invariants.test.ts       # A9
    pagination.test.ts       # A12, A13
  tsconfig.json
frontend/
  app/
    layout.tsx               # document shell
    page.tsx                 # home: existing users and create user
    vault.tsx                # home screen and the signed-in vault screen
    vault/
      page.tsx               # /vault route for the signed-in user
    globals.css
  next.config.ts             # rewrites /api/v1 to the Express API
  tsconfig.json
docs/
  design-doc.md              # schema, endpoints, status codes, and locking
README.md
```

Keep new files inside this layout. If a new file is needed, add it to this list in the same change.

## 5. Conventions

**SQL**
- Parameterized queries only. Never build SQL with string concatenation.
- One client per transaction: take it from the pool with `withTransaction`, and use that client for every query in the transaction.
- Follow the lock order in design doc 5.1: `top_ups` before `user_balances`, then inserts.
- Lock with `SELECT ... FOR UPDATE` exactly where design doc 5.4 and 5.5 show it. Do not add or remove locks without updating the design doc.

**Errors**
- Throw `AppError(status, code, message)` from services. Never send a response from a service.
- The error middleware in `backend/src/app.ts` converts `AppError` to `{ "error": { "code", "message" } }`.
- Map Postgres errors in one place (`backend/src/errors.ts`):
  - `23505` → 409 `already_owned` (only in purchase path)
  - `23514` → 402 `insufficient_coins` (balance CHECK backstop)
  - `23503` → 404 (`user_not_found` or `coin_pack_not_found` depending on the operation)
- Any unrecognized error → 500 `internal_error`, with no stack trace in the response.

**Status codes and error codes** are exactly those in design doc section 4. Do not invent new codes. If one is needed, update the design doc first.

**Validation**
- Validate every body, path, query, and header with zod before touching the database.
- A malformed UUID in the path or body → 400 `validation_error`. In the `X-User-Id` header → 400 `invalid_user_id`.

**Money and coins**
- Integers only. No floats anywhere in the money path.

**Responses**
- Return the shapes in design doc section 4. Do not add or rename fields.

## 6. Working rules

1. Work in the phases defined in `docs/design-doc.md` section 11, in order. Do not start a phase until the previous phase's "Done when" is met.
   - Phase 1: skeleton (`POST /users`, `GET /me/balance`, `GET /coin-packs`, `GET /products`, frontend shell)
   - Phase 2: top-ups, sequential (`POST /top-ups`, `POST /top-ups/:id/confirm`)
   - Phase 3: purchases, sequential (`POST /purchases`)
   - Phase 4: history and inventory (`GET /me/transactions`, `GET /me/inventory`)
   - Phase 5: concurrency and hardening (`FOR UPDATE` locks, A8, error mapping)
2. Build one endpoint at a time within a phase. After each endpoint, run `npm test` and make sure the related acceptance tests pass before starting the next one.
3. Do not add row locks (`FOR UPDATE`) or concurrency tests before Phase 5 unless the user asks. Phases 1 to 4 are sequential-only builds. Do not run concurrent load against them.
4. In Phase 5, run the concurrency test (A8) at least five times after any change to `backend/src/services/purchaseService.ts` or `backend/src/services/topUpService.ts`. It must pass every time.
5. Do not change the schema, lock order, or error codes without updating `docs/design-doc.md` in the same change.
6. Run the ledger invariant check (A9) once the ledger exists (Phase 2 onward), and after every test suite from Phase 4 onward.
7. Do not add features listed under "Stretch items" until Phase 5 is done and all acceptance tests pass.
8. Keep handlers thin. Business rules live in services. Routes only parse input and call services.
9. If something in the design doc is ambiguous, stop and ask rather than guessing.

## 7. Frontend

- Next.js app in `frontend/`. `/` is the home screen. `/vault` is the signed-in store. Choosing or creating a user opens `/vault`, and Back returns to `/`.
- `npm start` builds that app and serves it on port 3000. Express listens on port 3001. `frontend/next.config.ts` rewrites `/api/v1` to the API.
- Sends `X-User-Id` on `/me/*`, `POST /purchases`, and `POST /top-ups`. Stores the user id in `localStorage` and restores that user on refresh.
- The entry screen lists existing users and can create one. Create sends `display_name` and `email`. A duplicate email returns 409 `email_taken`; show that `error.message`.
- Show the server's `error.message` for 402 and 409. Do not hide them.
- Screens: create user, coin packs (buy then confirm), product catalog (buy button), balance, transactions, inventory.
