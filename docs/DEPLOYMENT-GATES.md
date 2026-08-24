# Deployment gates

Do not enable `/api/auth`, `/api/v3/notes`, `/api/v3/providers`,
`/api/v3/model-presets`, or `/api/v3/writing/*` until every applicable gate
below has passed against the deployment's actual `DATABASE_URL`.
`prisma db push` is not an accepted deployment path because this repository ships
versioned migrations.

## Environment and edge prerequisites

Set `BETTER_AUTH_URL` to the canonical HTTPS application origin. Supply
independent production values for `BETTER_AUTH_SECRET`, `AUTH_SECRET`, and a
32-byte `WRITING_CONFIG_ENCRYPTION_KEY`. Never copy a development value into a
deployment.

The current authentication rate limiter consumes `cf-connecting-ip` and
`x-forwarded-for`. This is safe only behind a trusted reverse proxy that:

1. strips client-supplied copies of both headers;
2. writes exactly one authoritative client address (Cloudflare deployments may
   write `cf-connecting-ip`; other proxies must overwrite `x-forwarded-for`);
3. prevents public traffic from reaching the application origin directly; and
4. has this overwrite/origin-isolation policy covered by the platform's
   deployment test.

If any of those conditions is false, do not enable authentication write routes.
The application does not yet contain a configurable trusted-proxy allowlist;
this is the remaining M1 deployment gate, not a solved application feature.

## Fresh database

Point `DATABASE_URL` at the empty target database. For SQLite, create the parent
directory and an empty database file first if the host's Prisma engine cannot
create the file. Then run from the release directory:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Do not substitute `prisma db push`. Continue to the common verification gate
below and enable routes only after it passes.

## Existing database without Prisma migration history

This path is only for an existing database whose schema is already exactly
equivalent to `202608240001_baseline_auth_notes` (for example, a prior `db push`
deployment). Merely having `User`, `Account`, and `Note` is insufficient because
the baseline also contains the catalog, graph, memory, and interaction tables.

1. Disable all route families listed at the top of this document and stop all
   writers.
2. Create a database-native backup and record its checksum. For SQLite:

   ```powershell
   sqlite3 .\production.db ".backup '.\backups\production-before-v3.2.db'"
   sqlite3 .\backups\production-before-v3.2.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
   Get-FileHash .\backups\production-before-v3.2.db -Algorithm SHA256
   ```

   `integrity_check` must print `ok`, and `foreign_key_check` must return no
   rows. Keep the backup and hash in the deployment change record.
3. Confirm `_prisma_migrations` is absent or empty. If it contains any row, stop
   and reconcile that history instead of applying this no-history procedure.
4. Build a disposable SQLite database by executing only
   `prisma/migrations/202608240001_baseline_auth_notes/migration.sql`, then use
   `prisma migrate diff --from-url <target> --to-url <disposable-baseline>
   --exit-code`. The diff must be empty. If it is not empty, stop: repair or
   migrate the target schema explicitly and repeat the backup/diff. Never mark a
   non-equivalent schema as applied.
5. With the verified target `DATABASE_URL` still in scope, establish history and
   deploy the later migrations:

   ```powershell
   npx prisma migrate resolve --applied 202608240001_baseline_auth_notes
   npx prisma migrate deploy
   npx prisma generate
   ```

6. Run the common verification gate. If it fails, keep routes disabled and
   restore the verified backup or complete a reviewed forward repair.

## Common migration and schema verification

### Existing migration 002 writing-state recovery

Migration 002 stored only `WritingArtifact.contentHash`; it did not store the
Markdown and therefore cannot be safely backfilled. Before deploying migration
003 over a database that already has 002 applied, keep writers stopped, retain
the verified database backup described above, and record these counts:

```sql
SELECT COUNT(*) AS legacy_artifacts FROM WritingArtifact;
SELECT COUNT(*) AS legacy_checkpoints FROM WritingCheckpoint;
```

Migration 003 deliberately deletes those unrecoverable artifacts and
checkpoints while preserving `WritingEvidence`. Affected owners must regenerate
their draft from the retained verified evidence; review/export rejects blank
legacy content and never produces an empty attachment. Immediately after the
deploy, and before re-enabling writing routes, both queries below must return
zero (writers must still be stopped):

```sql
SELECT COUNT(*) FROM WritingArtifact WHERE trim(content) = '';
SELECT COUNT(*) FROM WritingCheckpoint
WHERE artifactId IN (SELECT id FROM WritingArtifact WHERE trim(content) = '');
```

If an environment applied an earlier pre-acceptance copy of migration 003 that
left blank artifacts, stop writers and take a new verified backup before the
following reviewed recovery transaction. Do not alter migration history or
invent Markdown from `contentHash`:

```sql
BEGIN IMMEDIATE;
DELETE FROM WritingCheckpoint
WHERE artifactId IN (SELECT id FROM WritingArtifact WHERE trim(content) = '');
DELETE FROM WritingArtifact WHERE trim(content) = '';
COMMIT;
```

Record the affected owner/session counts, notify those owners to regenerate,
and rerun the empty-content and foreign-key checks before enabling routes.

First verify migration history. Exactly these three rows must be finished and
not rolled back:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY started_at;
```

Expected migration names:

```text
202608240001_baseline_auth_notes
202608240002_provider_writing
202608240003_reviewed_artifact_export
```

For SQLite, verify every authentication, notes, Provider, and writing table:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'User', 'Session', 'Account', 'Verification', 'AuthRateLimit', 'Note',
    'ProviderConfig', 'ModelPreset', 'WritingEvidence', 'WritingArtifact',
    'WritingCheckpoint', 'ProviderConnectionRateLimit'
  )
ORDER BY name;
```

All twelve names must be present. Verify the complete package indexes:

```sql
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'User_email_key', 'Session_token_key', 'Session_userId_idx',
    'Account_issuer_accountId_key', 'Account_userId_idx',
    'Verification_identifier_idx', 'AuthRateLimit_expiresAt_idx',
    'Note_ownerId_deletedAt_updatedAt_idx',
    'ProviderConfig_ownerId_updatedAt_idx', 'ProviderConfig_ownerId_id_key',
    'ModelPreset_ownerId_providerId_idx',
    'WritingEvidence_ownerId_sessionId_verificationStatus_idx',
    'WritingEvidence_ownerId_sessionId_externalEvidenceId_key',
    'WritingArtifact_ownerId_sessionId_createdAt_idx',
    'WritingArtifact_ownerId_sessionId_id_key',
    'WritingArtifact_ownerId_sessionId_stage_key',
    'WritingCheckpoint_ownerId_sessionId_createdAt_idx',
    'WritingCheckpoint_ownerId_sessionId_stage_key'
  )
ORDER BY name;
```

All eighteen names must be present. The obsolete
`WritingCheckpoint_ownerId_sessionId_artifactId_key` must be absent because one
draft artifact intentionally advances through multiple review checkpoints.

Verify artifact content and the required owner-scoped foreign keys:

```sql
PRAGMA table_info('WritingArtifact');
PRAGMA foreign_key_list('ModelPreset');
PRAGMA foreign_key_list('WritingCheckpoint');
PRAGMA foreign_key_list('ProviderConnectionRateLimit');
PRAGMA foreign_key_check;
```

`WritingArtifact` must include non-null `content` and `contentHash` columns.
`ModelPreset` and `ProviderConnectionRateLimit` must reference
`ProviderConfig(ownerId,id)` with `ON DELETE CASCADE`.
`WritingCheckpoint(ownerId,sessionId,artifactId)` must reference
`WritingArtifact(ownerId,sessionId,id)` with `ON DELETE RESTRICT`.
`foreign_key_check` must return no rows.

Finally run a same-origin Provider connection test through an injected staging
credential, generate a draft from three explicitly selected verified evidence
IDs, complete evidence linking and explicit human review, and export through the
server endpoint. Record commands, catalog output, proxy-policy evidence, and the
route smoke-test result in the deployment change record before enabling traffic.
