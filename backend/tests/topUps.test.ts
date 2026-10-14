import {
  request,
  app,
  pool,
  createUser,
  catalog,
  byName,
  confirmPack,
} from './support';

describe('top-ups', () => {
  test('A2 credits the snapshotted starter pack once', async () => {
    const user = await createUser('Asha');
    const { packs } = await catalog();
    const starter = byName(packs, 'Starter Pack');

    const created = await request(app())
      .post('/api/v1/top-ups')
      .set('X-User-Id', user.id)
      .send({ coin_pack_id: starter.id });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      status: 'pending',
      coins: 100,
      amount_cents: 99,
    });

    const confirmed = await request(app())
      .post(`/api/v1/top-ups/${created.body.id}/confirm`)
      .set('X-User-Id', user.id);

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({
      id: created.body.id,
      status: 'succeeded',
      balance: 100,
    });

    const topUp = await pool.query(`SELECT status, coins, amount_cents FROM top_ups WHERE id = $1`, [
      created.body.id,
    ]);
    expect(topUp.rows[0]).toMatchObject({ status: 'succeeded', coins: 100, amount_cents: 99 });

    const ledger = await pool.query(
      `SELECT delta, balance_after, top_up_id, purchase_id FROM coin_ledger WHERE user_id = $1`,
      [user.id]
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      delta: 100,
      balance_after: 100,
      top_up_id: created.body.id,
      purchase_id: null,
    });
  });

  test('A3 confirm is idempotent', async () => {
    const user = await createUser('Asha');
    const { packs } = await catalog();
    const starter = byName(packs, 'Starter Pack');
    const first = await confirmPack(user.id, starter.id);

    const second = await request(app())
      .post(`/api/v1/top-ups/${first.created.id}/confirm`)
      .set('X-User-Id', user.id);

    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      id: first.created.id,
      status: 'succeeded',
      balance: 100,
    });

    const ledger = await pool.query(`SELECT id FROM coin_ledger WHERE user_id = $1`, [user.id]);
    expect(ledger.rows).toHaveLength(1);
    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [user.id]);
    expect(balance.rows[0].balance).toBe(100);
  });

  test('A10 hides another user top-up', async () => {
    const owner = await createUser('Asha');
    const other = await createUser('Bea');
    const { packs } = await catalog();
    const starter = byName(packs, 'Starter Pack');

    const created = await request(app())
      .post('/api/v1/top-ups')
      .set('X-User-Id', owner.id)
      .send({ coin_pack_id: starter.id });
    expect(created.status).toBe(201);

    const confirmed = await request(app())
      .post(`/api/v1/top-ups/${created.body.id}/confirm`)
      .set('X-User-Id', other.id);

    expect(confirmed.status).toBe(404);
    expect(confirmed.body.error.code).toBe('top_up_not_found');

    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [owner.id]);
    expect(balance.rows[0].balance).toBe(0);
    const topUp = await pool.query(`SELECT status FROM top_ups WHERE id = $1`, [created.body.id]);
    expect(topUp.rows[0].status).toBe('pending');
  });

  test('confirm still credits a pack that was deactivated after the pending top-up', async () => {
    const user = await createUser('Asha');
    const { packs } = await catalog();
    const starter = byName(packs, 'Starter Pack');

    const created = await request(app())
      .post('/api/v1/top-ups')
      .set('X-User-Id', user.id)
      .send({ coin_pack_id: starter.id });
    await pool.query(`UPDATE coin_packs SET is_active = false WHERE id = $1`, [starter.id]);

    const confirmed = await request(app())
      .post(`/api/v1/top-ups/${created.body.id}/confirm`)
      .set('X-User-Id', user.id);

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.balance).toBe(100);
  });

  test('confirming a failed top-up returns 409', async () => {
    const user = await createUser('Asha');
    const { packs } = await catalog();
    const starter = byName(packs, 'Starter Pack');
    const created = await request(app())
      .post('/api/v1/top-ups')
      .set('X-User-Id', user.id)
      .send({ coin_pack_id: starter.id });
    await pool.query(`UPDATE top_ups SET status = 'failed' WHERE id = $1`, [created.body.id]);

    const confirmed = await request(app())
      .post(`/api/v1/top-ups/${created.body.id}/confirm`)
      .set('X-User-Id', user.id);

    expect(confirmed.status).toBe(409);
    expect(confirmed.body.error.code).toBe('top_up_not_pending');
    const balance = await pool.query(`SELECT balance FROM user_balances WHERE user_id = $1`, [user.id]);
    expect(balance.rows[0].balance).toBe(0);
  });

  test('unknown user and unknown pack are 404', async () => {
    const missingUser = await request(app())
      .post('/api/v1/top-ups')
      .set('X-User-Id', '00000000-0000-4000-8000-000000000000')
      .send({ coin_pack_id: '00000000-0000-4000-8000-000000000001' });
    expect(missingUser.status).toBe(404);
    expect(missingUser.body.error.code).toBe('user_not_found');

    const user = await createUser('Asha');
    const missingPack = await request(app())
      .post('/api/v1/top-ups')
      .set('X-User-Id', user.id)
      .send({ coin_pack_id: '00000000-0000-4000-8000-000000000001' });
    expect(missingPack.status).toBe(404);
    expect(missingPack.body.error.code).toBe('coin_pack_not_found');
  });

  test('a malformed top-up id is a validation error', async () => {
    const user = await createUser('Asha');
    const res = await request(app())
      .post('/api/v1/top-ups/not-a-uuid/confirm')
      .set('X-User-Id', user.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});
