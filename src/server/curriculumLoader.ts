/**
 * Server-side curriculum bootstrap.
 *
 * The browser loads one subject at a time (so a phone never downloads the whole
 * catalogue). The server is the opposite: it answers for every subject, so it reads
 * every generated file once at startup and registers them in memory. After that, every
 * lookup in a route is a Map read.
 *
 * Data files are imported dynamically by code, so adding a new subject file needs no
 * change here — `scripts/curriculum/reindex.ts` already keeps the metadata in sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GENERATED_CURRICULUM,
  registerServerCurriculum,
  type SubjectCurriculum,
} from '../shared/curriculum/index.ts';

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../shared/curriculum/data'
);

let started = false;

/**
 * Load every generated subject into memory. Safe to call more than once; failures are
 * logged and skipped so one unreadable file can never stop the server from starting.
 */
export async function loadAllCurricula(): Promise<{ loaded: number; failed: string[] }> {
  if (started) return { loaded: 0, failed: [] };
  started = true;

  const subjects: SubjectCurriculum[] = [];
  const failed: string[] = [];

  for (const meta of GENERATED_CURRICULUM) {
    const file = path.join(DATA_DIR, `${meta.code}.ts`);
    if (!fs.existsSync(file)) {
      failed.push(meta.code);
      continue;
    }
    try {
      // A Windows path (C:\...) is not a valid ESM specifier; it must be a file: URL.
      const mod: any = await import(pathToFileURL(file).href);
      const subject: SubjectCurriculum | undefined = mod?.[`${meta.code}_CURRICULUM`];
      if (subject?.code) subjects.push(subject);
      else failed.push(meta.code);
    } catch (err) {
      failed.push(meta.code);
      console.warn(
        `[curriculum] could not load ${meta.code}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  registerServerCurriculum(subjects);
  return { loaded: subjects.length, failed };
}
