import path from 'path';
import dotenv from 'dotenv';

const repoRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(repoRoot, '.env') });
