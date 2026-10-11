/**
 * Writes migrations/0001_init.sql (the D1 tables) from src/lib/schema.ts.
 * Usage: npm run db:migration
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrationSql } from '../src/lib/schema';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations/0001_init.sql');
fs.writeFileSync(file, migrationSql());
console.log(`Wrote ${path.relative(process.cwd(), file)}`);
