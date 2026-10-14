import {
  request,
  app,
  createUser,
  catalog,
  byName,
  confirmPack,
} from './support';

describe('history and inventory', () => {
  test('A12 paginates transactions without duplicates', async () => {
    const user = await createUser('Asha');
    const { packs } = await catalog();
    const starter = byName(packs, 'Starter Pack');

    for (let i = 0; i < 25; i += 1) {
      await confirmPack(user.id, starter.id);
    }

    const first = await request(app())
      .get('/api/v1/me/transactions?limit=20')
      .set('X-User-Id', user.id);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(20);
    expect(typeof first.body.next_cursor).toBe('string');
    expect(first.body.items[0]).toEqual(expect.objectContaining({
      delta: 100,
      type: 'top_up',
      balance_after: expect.any(Number),
    }));

    const second = await request(app())
      .get('/api/v1/me/transactions')
      .query({ limit: 20, cursor: first.body.next_cursor })
      .set('X-User-Id', user.id);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(5);
    expect(second.body.next_cursor).toBeNull();

    const ids = [...first.body.items, ...second.body.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(25);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]).toBeLessThan(ids[i - 1]);
    }
  });

  test('rejects a limit outside 1 to 100', async () => {
    const user = await createUser('Asha');
    const zero = await request(app())
      .get('/api/v1/me/transactions?limit=0')
      .set('X-User-Id', user.id);
    const huge = await request(app())
      .get('/api/v1/me/transactions?limit=101')
      .set('X-User-Id', user.id);
    expect(zero.status).toBe(400);
    expect(zero.body.error.code).toBe('validation_error');
    expect(huge.status).toBe(400);
    expect(huge.body.error.code).toBe('validation_error');
  });

  test('A13 inventory lists every one-time purchase', async () => {
    const user = await createUser('Asha');
    const { packs, products } = await catalog();
    await confirmPack(user.id, byName(packs, 'Value Pack').id);

    const blade = await request(app())
      .post('/api/v1/purchases')
      .set('X-User-Id', user.id)
      .send({ product_id: byName(products, 'Neon Blade').id });
    const crate = await request(app())
      .post('/api/v1/purchases')
      .set('X-User-Id', user.id)
      .send({ product_id: byName(products, 'Mystery Skin Crate').id });
    expect(blade.status).toBe(201);
    expect(crate.status).toBe(201);

    const inventory = await request(app())
      .get('/api/v1/me/inventory')
      .set('X-User-Id', user.id);
    expect(inventory.status).toBe(200);
    expect(inventory.body.items.map((item: { name: string }) => item.name).sort()).toEqual([
      'Mystery Skin Crate',
      'Neon Blade',
    ]);
  });

  test('unknown users get 404 on history and inventory', async () => {
    const header = { 'X-User-Id': '00000000-0000-4000-8000-000000000000' };
    const transactions = await request(app()).get('/api/v1/me/transactions').set(header);
    const inventory = await request(app()).get('/api/v1/me/inventory').set(header);
    expect(transactions.status).toBe(404);
    expect(transactions.body.error.code).toBe('user_not_found');
    expect(inventory.status).toBe(404);
    expect(inventory.body.error.code).toBe('user_not_found');
  });
});
