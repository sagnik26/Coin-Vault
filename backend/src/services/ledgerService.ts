import { pool } from '../db/pool';
import { AppError } from '../errors';

type CursorPayload = { t: string; i: string };

type LedgerRow = {
  id: string;
  delta: number;
  balance_after: number;
  top_up_id: string | null;
  purchase_id: string | null;
  created_at: Date | string;
  cursor_time: string;
};

type InventoryRow = {
  product_id: string;
  name: string;
  category: string;
  purchased_at: Date | string;
};

function encodeCursor(cursorTime: string, id: string | number): string {
  return Buffer.from(JSON.stringify({ t: cursorTime, i: String(id) }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>;
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string' || !/^\d+$/.test(parsed.i)) {
      throw new Error('malformed cursor');
    }
    if (Number.isNaN(Date.parse(parsed.t))) {
      throw new Error('malformed cursor time');
    }
    return { createdAt: parsed.t, id: parsed.i };
  } catch {
    throw new AppError(400, 'validation_error', 'Invalid cursor');
  }
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function assertUser(userId: string): Promise<void> {
  const result = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
  if (result.rows.length === 0) {
    throw new AppError(404, 'user_not_found', 'User not found');
  }
}

async function listTransactions(userId: string, limit: number, cursor?: string) {
  await assertUser(userId);

  const params: Array<string | number> = [userId];
  let sql = `SELECT id, delta, balance_after, top_up_id, purchase_id, created_at,
                    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
             FROM coin_ledger
             WHERE user_id = $1`;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    params.push(decoded.createdAt, decoded.id);
    sql += ` AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`;
  }

  params.push(limit + 1);
  sql += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length}`;

  const result = await pool.query<LedgerRow>(sql, params);
  const hasMore = result.rows.length > limit;
  const page = hasMore ? result.rows.slice(0, limit) : result.rows;
  const last = page[page.length - 1];

  return {
    items: page.map((row) => ({
      id: Number(row.id),
      delta: Number(row.delta),
      balance_after: Number(row.balance_after),
      type: row.top_up_id ? 'top_up' as const : 'purchase' as const,
      created_at: timestamp(row.created_at),
    })),
    next_cursor: hasMore && last ? encodeCursor(last.cursor_time, last.id) : null,
  };
}

async function listInventory(userId: string) {
  await assertUser(userId);

  const result = await pool.query<InventoryRow>(
    `SELECT p.id AS product_id, p.name, p.category, pu.created_at AS purchased_at
     FROM purchases pu
     JOIN products p ON p.id = pu.product_id
     WHERE pu.user_id = $1 AND pu.is_consumable = false
     ORDER BY pu.created_at DESC, pu.id DESC`,
    [userId],
  );

  return {
    items: result.rows.map((row) => ({
      product_id: row.product_id,
      name: row.name,
      category: row.category,
      purchased_at: timestamp(row.purchased_at),
    })),
  };
}

export { listTransactions, listInventory };
