import fs from 'fs';
import path from 'path';
import '../loadEnv';
import { pool } from './pool';

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error('Usage: tsx src/db/applySql.ts <file.sql> [more.sql]');
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.resolve(file), 'utf8');
    await pool.query(sql);
  }

  await pool.end();
}

main().catch(async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  try {
    await pool.end();
  } catch {
    // Pool may already be closed.
  }
  process.exit(1);
});
