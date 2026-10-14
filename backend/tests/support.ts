import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';

type Named = { id: string; name: string };

type CreatedUser = { id: string; display_name: string; email: string; balance: number };

function app() {
  return createApp();
}

async function createUser(name: string): Promise<CreatedUser> {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
  const res = await request(app()).post('/api/v1/users').send({
    display_name: name,
    email: `${slug}@example.com`,
  });
  if (res.status !== 201) {
    throw new Error(`create user failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as CreatedUser;
}

async function catalog(): Promise<{ packs: Named[]; products: Named[] }> {
  const packs = await request(app()).get('/api/v1/coin-packs');
  const products = await request(app()).get('/api/v1/products');
  if (packs.status !== 200 || products.status !== 200) {
    throw new Error('catalog request failed');
  }
  return {
    packs: packs.body.items as Named[],
    products: products.body.items as Named[],
  };
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const item = items.find((entry) => entry.name === name);
  if (!item) {
    throw new Error(`missing catalog item ${name}`);
  }
  return item;
}

async function confirmPack(userId: string, packId: string) {
  const created = await request(app())
    .post('/api/v1/top-ups')
    .set('X-User-Id', userId)
    .send({ coin_pack_id: packId });
  if (created.status !== 201) {
    throw new Error(`top-up create failed: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const confirmed = await request(app())
    .post(`/api/v1/top-ups/${created.body.id}/confirm`)
    .set('X-User-Id', userId);
  if (confirmed.status !== 200) {
    throw new Error(`top-up confirm failed: ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  }
  return { created: created.body as { id: string }, confirmed: confirmed.body as { balance: number } };
}

export {
  request,
  app,
  pool,
  createUser,
  catalog,
  byName,
  confirmPack,
};
