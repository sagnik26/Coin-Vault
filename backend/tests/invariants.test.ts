import { pool } from '../src/db/pool';
import { createUser, catalog, byName, confirmPack, request, app } from './support';

const invariantSql = `
  SELECT ub.user_id
  FROM user_balances ub
  LEFT JOIN coin_ledger cl ON cl.user_id = ub.user_id
  GROUP BY ub.user_id, ub.balance
  HAVING ub.balance <> COALESCE(SUM(cl.delta), 0)
`;

describe('ledger invariant', () => {
  test('A9 balance equals the sum of ledger deltas after top-ups and purchases', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Value Pack').id);
    const purchase = await request(app())
      .post('/api/v1/purchases')
      .set('X-User-Id', user.id)
      .send({ product_id: byName(products, 'Mystery Skin Crate').id });
    expect(purchase.status).toBe(201);

    const { rows } = await pool.query(invariantSql);
    expect(rows).toHaveLength(0);

    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [user.id]);
    const sum = await pool.query(
      `SELECT COALESCE(SUM(delta), 0)::int AS total FROM coin_ledger WHERE user_id = $1`,
      [user.id]
    );
    expect(balance.rows[0].balance).toBe(sum.rows[0].total);
    expect(balance.rows[0].balance).toBe(300);
  });
});
