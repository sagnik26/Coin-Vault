import fs from 'fs';
import path from 'path';
import { pool } from '../src/db/pool';

const sqlDir = path.join(__dirname, '..', 'sql');

async function execFile(name: string): Promise<void> {
  const sql = fs.readFileSync(path.join(sqlDir, name), 'utf8');
  await pool.query(sql);
}

async function ensureEmailColumn(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email))`);
}

async function ensureSchema(): Promise<void> {
  const existing = await pool.query<{ name: string | null }>(`SELECT to_regclass('public.users') AS name`);
  if (!existing.rows[0]?.name) {
    await execFile('schema.sql');
  }
  await ensureEmailColumn();
  const packs = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM coin_packs`);
  if (packs.rows[0]?.n === 0) {
    await execFile('seed.sql');
  }
}

async function assertLedgerInvariant(): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(`
    SELECT ub.user_id
    FROM user_balances ub
    LEFT JOIN coin_ledger cl ON cl.user_id = ub.user_id
    GROUP BY ub.user_id, ub.balance
    HAVING ub.balance <> COALESCE(SUM(cl.delta), 0)
  `);
  if (rows.length !== 0) {
    throw new Error(`Ledger invariant failed for ${rows.map((row) => row.user_id).join(', ')}`);
  }
}

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await execFile('reset.sql');
});

afterEach(async () => {
  await assertLedgerInvariant();
});

afterAll(async () => {
  await pool.end();
});

export { assertLedgerInvariant, pool };
