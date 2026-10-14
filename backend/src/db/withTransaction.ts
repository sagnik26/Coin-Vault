import { PoolClient } from 'pg';
import { pool } from './pool';

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may already be aborted. The original error is the one to surface.
    }
    throw err;
  } finally {
    client.release();
  }
}

export { withTransaction };
