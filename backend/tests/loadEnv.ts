import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const repoRoot = path.join(__dirname, '../..');
const testEnv = path.join(repoRoot, '.env.test');
dotenv.config({ path: fs.existsSync(testEnv) ? testEnv : path.join(repoRoot, '.env') });
