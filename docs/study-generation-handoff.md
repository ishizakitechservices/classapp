# Full-size study generation: status

Scope: Quick/Standard/Full quizzes and decks, heavy caching, and curriculum-grounded
subjects (NaCCA SHS learner materials).

**78 tests pass. `tsc --noEmit` clean. Verified against the LIVE DeepSeek API:**
- Full quiz: **25/25 questions**, 5 calls, ~89 s, all well-formed.
- Full deck: **40/40 cards**, no duplicates, ~36 s.

## The bug you reported, and what actually caused it

`max_tokens` caps **reasoning tokens and output tokens together**. Measured on a real
batch: the model spent **574–1279 tokens on internal reasoning before writing any JSON**.
With the old per-batch budget of **1800**, a reasoning-heavy run had almost nothing left
for the questions, so the reply came back cut off — or, in the worst case, **empty with
the entire budget spent thinking**.

Measured before the fix: **4 of 6 batches cut off at 1800 tokens.**

Three fixes, all verified live:
1. **Budget 1800 → 6000** (flashcards 1600 → 5000), measured against reasoning + JSON.
2. **Retry an empty reply** (up to 3 attempts) instead of accepting nothing.
3. **Salvage a truncated batch** — keep every complete object, drop only the half-written
   last one, rather than throwing 4 good questions away with the 5th.
4. **Top up a short batch**, so 38/40 becomes 40/40.

After the fix: **0 of 6 batches lost content**, worst case 3381/6000 tokens.

## Done and verified

### Sizes and batching
- Quick/Standard/Full = 5/10/25 quiz questions, 10/20/40 flashcards.
- Hard caps (25 / 40), floor of 3, batch size 5 / 8, ceiling of 8 batches.
- Credits: Quick and Standard cost 1, Full costs 2 (it is several provider calls).
- A provider outage reports the real error, not "no questions".

### Curriculum grounding
- Scraper (`scripts/curriculum/build.ts`) joins headings that wrap across lines,
  strips running headers (`SECTION n <title>`), page numbers and front/end matter
  (`CONTENTS`, `FOREWORD`, `PREFACE`, `NAME INSTITUTION`, `ANNEXES`, `EXTENDED READING`…).
- **8 subjects, 712 verified topics**: English, Maths, General Science, Social Studies,
  Art & Design Foundation, Physics, Chemistry, Biology. Remaining electives still scraping.
- The grounding block always keeps its "do not leave this syllabus" rule, trimming the
  topic list around it instead (a test caught this).

### Per-subject lazy loading (low-bandwidth requirement)
- The generated index carries **code + name only**; each subject's topics are a separate
  chunk fetched on demand.
- Build output confirms it: `GSCI` 2.7 KB gz, `PHY` 2.9 KB, `ENG` 3.0 KB, `MATH` 3.4 KB,
  and the main bundle went **1,385 KB → 1,270 KB**.
- Server registers every subject once at startup (`src/server/curriculumLoader.ts`).

### Caching (four layers)
1. In-memory LRU with 24 h TTL, keyed per batch.
2. Postgres `shared_studies`: key carries curriculum version, topic, subject, strand,
   form, clamped size, and a variant only for an explicit "new set".
3. IndexedDB `study_sets` (DB v2): read → network → write, 7-day TTL, 60-entry cap.
4. DeepSeek prefix cache: the grounding block is byte-stable (tested).

### Honest behaviour
- A short set says so ("wrote 18 of 25 questions") instead of looking complete.
- A provider failure refunds the student's credits and the school's fuse units for any
  undelivered batches.
- No cached data is served for a subject with no extracted material.

## Verifying against the live API (costs money, never automatic)

```bash
node --import tsx scripts/verify-live-quiz.ts --quick            # 1 call, 5 questions
node --import tsx scripts/verify-live-quiz.ts --full             # 5 calls, 25 questions
node --import tsx scripts/verify-live-quiz.ts --subject MATH --topic "Vectors"
node --import tsx scripts/diag-json.ts --repeat 6                # batch reliability
node --import tsx scripts/diag-empty.ts --repeat 4               # reasoning-token usage
```

## Regenerating curriculum data

```bash
node --import tsx scripts/curriculum/build.ts --concurrency 6   # scrape (slow)
node --import tsx scripts/curriculum/reindex.ts                 # index what exists
node --import tsx scripts/curriculum/gen-loaders.ts             # print loader lines
```

`build.ts` only rewrites `index.ts` after the last subject. If a run is interrupted,
`reindex.ts` makes the finished subjects visible immediately — that is what stopped
five complete subjects from being silently invisible.

The version is `date+contentDigest`, so identical rebuilds do not invalidate caches but
any real change does.

## Known caveats

1. **Windows dynamic import.** A `C:\...` path is not a valid ESM specifier; the loader
   uses `pathToFileURL`. Without this the server started with zero curriculum and only
   logged a warning.
2. **Heading split across a page break.** One General Science topic still reads
   "OSMOSIS AND ITS APPLICATION IN OUR DAILY" because its heading continues on the next
   page. It is the document's own wording; joining it needs cross-page continuation.
3. **Full sets take ~90 s.** They are several sequential provider calls. The client
   allows 180 s for these; a Full quiz is not "instant".

