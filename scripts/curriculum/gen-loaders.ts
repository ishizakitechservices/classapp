// Generates the lazy loader table in src/shared/curriculum/index.ts so it only ever
// references subject data files that actually exist. Run after a curriculum build:
//   node --import tsx scripts/curriculum/gen-loaders.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS } from '../../src/shared/subjects.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(ROOT, 'src/shared/curriculum/data');

const have = new Set(
  fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''))
);

const codes = SUBJECTS.map((s) => s.code).filter((c) => have.has(c));

const lines = codes
  .map((c) => `  ${c}: () => import('./data/${c}.ts').then((m) => m.${c}_CURRICULUM),`)
  .join('\n');

console.log(`// ${codes.length} subject(s): ${codes.join(', ')}`);
console.log(lines);
