import { request, app, pool, createUser } from './support';

describe('users and catalog', () => {
  test('A1 creates a user with a zero balance and no ledger rows', async () => {
    const res = await request(app()).post('/api/v1/users').send({
      display_name: 'Asha',
      email: 'Asha@Example.com',
    });

    expect(res.status).toBe(201);
    expect(res.body.display_name).toBe('Asha');
    expect(res.body.email).toBe('asha@example.com');
    expect(res.body.balance).toBe(0);
    expect(res.body.id).toEqual(expect.any(String));

    const users = await pool.query(`SELECT id, display_name, email FROM users WHERE id = $1`, [res.body.id]);
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0].display_name).toBe('Asha');
    expect(users.rows[0].email).toBe('asha@example.com');

    const balances = await pool.query(
      `SELECT balance FROM user_balances WHERE user_id = $1`,
      [res.body.id]
    );
    expect(balances.rows).toHaveLength(1);
    expect(balances.rows[0].balance).toBe(0);

    const ledger = await pool.query(`SELECT id FROM coin_ledger WHERE user_id = $1`, [res.body.id]);
    expect(ledger.rows).toHaveLength(0);
  });

  test('rejects a blank display name', async () => {
    const res = await request(app()).post('/api/v1/users').send({
      display_name: '   ',
      email: 'asha@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  test('rejects a duplicate email and lists existing users', async () => {
    const first = await createUser('Asha');
    const duplicate = await request(app()).post('/api/v1/users').send({
      display_name: 'Another Asha',
      email: 'ASHA@example.com',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('email_taken');
    expect(duplicate.body.error.message).toBe('An account with this email already exists');

    const listed = await request(app()).get('/api/v1/users');
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([
      {
        id: first.id,
        display_name: 'Asha',
        email: 'asha@example.com',
        balance: 0,
      },
    ]);

    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM users`);
    expect(count.rows[0].n).toBe(1);
  });

  test('A11 rejects a missing header and a malformed user id', async () => {
    const missing = await request(app()).get('/api/v1/me/balance');
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('missing_user_header');

    const invalid = await request(app())
      .get('/api/v1/me/balance')
      .set('X-User-Id', 'not-a-uuid');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('invalid_user_id');
  });

  test('returns 404 for an unknown user balance', async () => {
    const res = await request(app())
      .get('/api/v1/me/balance')
      .set('X-User-Id', '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('user_not_found');
  });

  test('returns only active coin packs, cheapest first, and only active products', async () => {
    await pool.query(`UPDATE coin_packs SET is_active = false WHERE name = 'Mega Pack'`);
    await pool.query(`UPDATE products SET is_active = false WHERE name = 'Neon Blade'`);

    const packs = await request(app()).get('/api/v1/coin-packs');
    expect(packs.status).toBe(200);
    expect(packs.body.items.map((item: { name: string }) => item.name)).toEqual(['Starter Pack', 'Value Pack']);
    expect(packs.body.items.map((item: { price_cents: number }) => item.price_cents)).toEqual([99, 449]);

    const products = await request(app()).get('/api/v1/products');
    expect(products.status).toBe(200);
    const names = products.body.items.map((item: { name: string }) => item.name);
    expect(names).not.toContain('Neon Blade');
    expect(names).toEqual(expect.arrayContaining([
      'Victory Dance',
      'Season 1 Battle Pass',
      'Mystery Skin Crate',
    ]));

    const skins = await request(app()).get('/api/v1/products?category=skin');
    expect(skins.status).toBe(200);
    expect(skins.body.items.map((item: { name: string }) => item.name)).toEqual(['Mystery Skin Crate']);

    const badCategory = await request(app()).get('/api/v1/products?category=weapon');
    expect(badCategory.status).toBe(400);
    expect(badCategory.body.error.code).toBe('validation_error');
  });

  test('GET /me/balance returns the created user balance', async () => {
    const user = await createUser('Asha');
    const res = await request(app()).get('/api/v1/me/balance').set('X-User-Id', user.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user_id: user.id, balance: 0 });
  });
});
