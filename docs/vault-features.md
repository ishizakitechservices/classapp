# Vault features: status

Added: rename/edit, sort, star, trash + restore, bulk actions, server-side search,
usage breakdown, and per-file notes. The dead local vault was retired.

**100 tests pass. `tsc --noEmit` clean. Build succeeds. Verified against the live
database (20 checks) and a live server boot.**

## Schema (applied to the live database)

```
notes        TEXT                 -- the student's own notes on a file
starred      BOOLEAN DEFAULT FALSE
deleted_at   TIMESTAMPTZ          -- NULL = live; set = in trash
updated_at   TIMESTAMPTZ DEFAULT NOW()
```

Plus `vault_files_live_idx` and `vault_files_starred_idx`. Idempotent, so re-running
`node --import tsx scripts/migrate.ts` is safe.

## Routes (`src/server/vaultRoutes.ts`)

| Route | Purpose |
| --- | --- |
| `GET /files` | `q`, `folder`, `subject`, `starred`, `trash`, `sort`; returns live/trash totals |
| `GET /files/usage` | per-subject and per-folder breakdown |
| `PATCH /files/:id` | name, description, subject, folder, starred, notes (only what is sent) |
| `DELETE /files/:id` | soft delete to trash |
| `POST /files/:id/restore` | bring it back |
| `PUT /files/bulk` | delete / restore / move / star / unstar, max 200 ids |
| `POST /files/trash/purge` | permanent delete: B2 object first, then the row |

`purgeExpiredTrash()` runs at startup: anything older than 30 days is removed for real.

## Decisions worth knowing

- **Trashed files still count against the 200 MB.** The bytes are still in B2, so showing
  otherwise would be dishonest. The storage card shows live + trash on one bar and offers
  "Empty trash to free X".
- **Search is server-side and safely escaped.** `%`, `_` and `\` are escaped, so searching
  "50%" finds files containing "50%", not every file. Verified against the real database.
- **Sort never interpolates input.** `orderByFor()` returns a fixed fragment from a closed
  set; an injected sort string is ignored.
- **Bulk actions cannot touch another account's files** — ownership is in the WHERE clause,
  so a foreign id simply matches nothing (verified).

## Retired

`DocumentReaderModal.tsx` was dead code (nothing imported it) that read a second, local
vault list nothing displayed. Deleted. Its two useful features were kept:
- **My notes** — now in the file viewer (`viewer/TextView.tsx`), saved with the file on the
  server so notes survive a reinstall and follow the student between devices.
- AI actions were dropped from the reader: the Vault no longer offers per-file AI buttons.
  Ask Adom AI directly, or attach the note in the chat.

**Drive/Classroom import was silently broken** — it wrote into that invisible local list,
so an import appeared to succeed and then vanished. It now saves a small text note with a
link to the original into the real vault. It records a link rather than downloading Drive
bytes, which is often blocked by sharing permissions.

## Verifying

```bash
node --import tsx scripts/verify-vault-routes.ts   # live DB, transaction, rolls back
node --import tsx --test tests/vaultQuery.test.ts  # pure helpers, 22 tests
```

## Not done

- **Offline pinning** was not selected. Vault files opened once are still cached by the
  service worker (60 files / 30 days), but there is still no explicit "keep on this device"
  control or visible list of what will work without data.
- No route-level automated tests in `npm test`: `getSql()` is a module-level singleton with
  no injection point. `verify-vault-routes.ts` is the substitute and needs a live database.
