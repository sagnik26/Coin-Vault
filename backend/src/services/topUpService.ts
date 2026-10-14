import { pool } from '../db/pool';
import { withTransaction } from '../db/withTransaction';
import { AppError, rethrow } from '../errors';

type TopUpInsertRow = {
  id: string;
  status: string;
  coins: number;
  amount_cents: number;
};

type TopUpLockRow = {
  id: string;
  coins: number;
  status: string;
};

type BalanceRow = { balance: number };

async function createTopUp(userId: string, coinPackId: string) {
  try {
    const inserted = await pool.query<TopUpInsertRow>(
      `INSERT INTO top_ups (user_id, coin_pack_id, coins, amount_cents, status)
       SELECT $1, cp.id, cp.coins, cp.price_cents, 'pending'
       FROM coin_packs cp
       WHERE cp.id = $2 AND cp.is_active = true
       RETURNING id, status, coins, amount_cents`,
      [userId, coinPackId],
    );

    const row = inserted.rows[0];
    if (!row) {
      const user = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
      if (user.rows.length === 0) {
        throw new AppError(404, 'user_not_found', 'User not found');
      }
      throw new AppError(404, 'coin_pack_not_found', 'Coin pack not found');
    }

    return {
      id: row.id,
      status: row.status,
      coins: Number(row.coins),
      amount_cents: Number(row.amount_cents),
    };
  } catch (err) {
    rethrow(err, 'top_up');
  }
}

async function confirmTopUp(userId: string, topUpId: string) {
  return withTransaction(async (client) => {
    const found = await client.query<TopUpLockRow>(
      `SELECT id, coins, status
       FROM top_ups
       WHERE id = $1 AND user_id = $2`,
      [topUpId, userId],
    );

    const topUp = found.rows[0];
    if (!topUp) {
      throw new AppError(404, 'top_up_not_found', 'Top-up not found');
    }

    if (topUp.status === 'succeeded') {
      const current = await client.query<BalanceRow>(
        `SELECT balance FROM user_balances WHERE user_id = $1`,
        [userId],
      );
      const balanceRow = current.rows[0];
      if (!balanceRow) {
        throw new AppError(404, 'user_not_found', 'User not found');
      }
      return {
        id: topUp.id,
        status: 'succeeded' as const,
        balance: Number(balanceRow.balance),
      };
    }

    if (topUp.status === 'failed') {
      throw new AppError(409, 'top_up_not_pending', 'Top-up is not pending');
    }

    await client.query(
      `UPDATE top_ups
       SET status = 'succeeded', updated_at = now()
       WHERE id = $1`,
      [topUpId],
    );

    const updated = await client.query<BalanceRow>(
      `UPDATE user_balances
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2
       RETURNING balance`,
      [topUp.coins, userId],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) {
      throw new AppError(404, 'user_not_found', 'User not found');
    }

    const balance = Number(updatedRow.balance);
    await client.query(
      `INSERT INTO coin_ledger (user_id, delta, balance_after, top_up_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, topUp.coins, balance, topUpId],
    );

    return {
      id: topUp.id,
      status: 'succeeded' as const,
      balance,
    };
  });
}

export { createTopUp, confirmTopUp };
