import {
  request,
  app,
  pool,
  createUser,
  catalog,
  byName,
  confirmPack,
} from './support';

async function purchase(userId: string, productId: string) {
  return request(app())
    .post('/api/v1/purchases')
    .set('X-User-Id', userId)
    .send({ product_id: productId });
}

describe('purchases', () => {
  test('A4 deducts the catalog price and writes a debit', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Value Pack').id);
    const blade = byName(products, 'Neon Blade');

    const res = await purchase(user.id, blade.id);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      product_id: blade.id,
      price_coins: 300,
      balance_after: 200,
    });

    const purchases = await pool.query(
      `SELECT product_id, price_coins, is_consumable FROM purchases WHERE user_id = $1`,
      [user.id]
    );
    expect(purchases.rows).toHaveLength(1);
    expect(purchases.rows[0]).toMatchObject({
      product_id: blade.id,
      price_coins: 300,
      is_consumable: false,
    });

    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [user.id]);
    expect(balance.rows[0].balance).toBe(200);

    const ledger = await pool.query(
      `SELECT delta, balance_after, purchase_id FROM coin_ledger WHERE purchase_id = $1`,
      [res.body.id]
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      delta: -300,
      balance_after: 200,
      purchase_id: res.body.id,
    });
  });

  test('A5 rejects a purchase that would overspend and writes nothing', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Starter Pack').id);
    const blade = byName(products, 'Neon Blade');

    const before = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM purchases WHERE user_id = $1) AS purchases,
         (SELECT COUNT(*)::int FROM coin_ledger WHERE user_id = $1) AS ledger`,
      [user.id]
    );

    const res = await purchase(user.id, blade.id);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('insufficient_coins');

    const after = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM purchases WHERE user_id = $1) AS purchases,
         (SELECT COUNT(*)::int FROM coin_ledger WHERE user_id = $1) AS ledger,
         (SELECT balance FROM user_balances WHERE user_id = $1) AS balance`,
      [user.id]
    );
    expect(after.rows[0].purchases).toBe(before.rows[0].purchases);
    expect(after.rows[0].ledger).toBe(before.rows[0].ledger);
    expect(after.rows[0].balance).toBe(100);
  });

  test('A6 rejects a second purchase of a one-time item', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Mega Pack').id);
    await confirmPack(user.id, byName(packs, 'Starter Pack').id);
    const blade = byName(products, 'Neon Blade');

    const first = await purchase(user.id, blade.id);
    expect(first.status).toBe(201);
    expect(first.body.balance_after).toBe(1000);

    const second = await purchase(user.id, blade.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_owned');

    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [user.id]);
    expect(balance.rows[0].balance).toBe(1000);
    const purchases = await pool.query(`SELECT id FROM purchases WHERE user_id = $1`, [user.id]);
    expect(purchases.rows).toHaveLength(1);
  });

  test('A7 rejects a second purchase of Mystery Skin Crate', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Value Pack').id);
    const crate = byName(products, 'Mystery Skin Crate');

    const first = await purchase(user.id, crate.id);
    const second = await purchase(user.id, crate.id);

    expect(first.status).toBe(201);
    expect(first.body.balance_after).toBe(300);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_owned');

    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [user.id]);
    expect(balance.rows[0].balance).toBe(300);
    const purchases = await pool.query(`SELECT id FROM purchases WHERE user_id = $1`, [user.id]);
    expect(purchases.rows).toHaveLength(1);
  });

  test('an inactive product is not found', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Mega Pack').id);
    const blade = byName(products, 'Neon Blade');
    await pool.query(`UPDATE products SET is_active = false WHERE id = $1`, [blade.id]);

    const res = await purchase(user.id, blade.id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('product_not_found');
  });

  test('a purchase can spend the balance down to zero', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Value Pack').id);
    const pass = byName(products, 'Season 1 Battle Pass');

    const res = await purchase(user.id, pass.id);
    expect(res.status).toBe(201);
    expect(res.body.balance_after).toBe(0);
  });
});
