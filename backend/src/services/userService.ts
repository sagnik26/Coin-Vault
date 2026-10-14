import { pool } from '../db/pool';
import { withTransaction } from '../db/withTransaction';
import { AppError } from '../errors';
import { ProductCategory } from '../validators/products';

type UserRow = { id: string; display_name: string; email: string | null };
type ListedUserRow = UserRow & { balance: number };
type BalanceRow = { user_id: string; balance: number };
type CoinPackRow = { id: string; name: string; coins: number; price_cents: number };
type ProductRow = {
  id: string;
  name: string;
  category: ProductCategory;
  price_coins: number;
  is_consumable: boolean;
};

async function createUser(displayName: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = $1`,
      [normalizedEmail],
    );
    if (existing.rows[0]) {
      throw new AppError(409, 'email_taken', 'An account with this email already exists');
    }

    const inserted = await client.query<UserRow>(
      `INSERT INTO users (display_name, email)
       VALUES ($1, $2)
       RETURNING id, display_name, email`,
      [displayName, normalizedEmail],
    );
    const user = inserted.rows[0];
    if (!user || !user.email) {
      throw new AppError(500, 'internal_error', 'Internal error');
    }
    await client.query(
      `INSERT INTO user_balances (user_id, balance)
       VALUES ($1, 0)`,
      [user.id],
    );
    return {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      balance: 0,
    };
  });
}

async function listUsers() {
  const result = await pool.query<ListedUserRow>(
    `SELECT u.id, u.display_name, u.email, ub.balance
     FROM users u
     JOIN user_balances ub ON ub.user_id = u.id
     ORDER BY u.display_name ASC, u.created_at ASC`,
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      display_name: row.display_name,
      email: row.email,
      balance: Number(row.balance),
    })),
  };
}

async function getBalance(userId: string) {
  const result = await pool.query<BalanceRow>(
    `SELECT user_id, balance
     FROM user_balances
     WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(404, 'user_not_found', 'User not found');
  }
  return {
    user_id: row.user_id,
    balance: Number(row.balance),
  };
}

async function listCoinPacks() {
  const result = await pool.query<CoinPackRow>(
    `SELECT id, name, coins, price_cents
     FROM coin_packs
     WHERE is_active = true
     ORDER BY price_cents ASC`,
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      coins: Number(row.coins),
      price_cents: Number(row.price_cents),
    })),
  };
}

async function listProducts(category?: ProductCategory) {
  const params: string[] = [];
  let sql = `SELECT id, name, category, price_coins, is_consumable
             FROM products
             WHERE is_active = true`;
  if (category) {
    params.push(category);
    sql += ` AND category = $${params.length}`;
  }
  sql += ` ORDER BY name ASC`;
  const result = await pool.query<ProductRow>(sql, params);
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      price_coins: Number(row.price_coins),
      is_consumable: row.is_consumable,
    })),
  };
}

export {
  createUser,
  listUsers,
  getBalance,
  listCoinPacks,
  listProducts,
};
