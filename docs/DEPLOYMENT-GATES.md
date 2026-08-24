# Deployment gates

## Authentication and private notes database gate

Do not enable `/api/auth` or `/api/v3/notes` in an environment until this
gate has passed against that environment's actual `DATABASE_URL`. These routes
use the generated Prisma client for Better Auth tables and for the private
`Note` table; application startup alone does not materialize a schema change.

1. Point `DATABASE_URL` at the target database, not a local development file.
   Confirm the deployment also supplies `BETTER_AUTH_SECRET` and `AUTH_SECRET`.
2. Run both commands with that target `DATABASE_URL` in scope:

   ```bash
   npx prisma db push
   npx prisma generate
   ```

3. Verify the target database contains the expected tables before enabling the
   routes. For SQLite, inspect `sqlite_master` (or the equivalent database
   catalog) and require at least:

   ```sql
   SELECT type, name
   FROM sqlite_master
   WHERE name IN (
     'User', 'Session', 'Account', 'Verification', 'AuthRateLimit',
     'Note', 'Note_ownerId_deletedAt_updatedAt_idx'
   )
   ORDER BY type, name;
   ```

   The result must include the `Note` table and
   `Note_ownerId_deletedAt_updatedAt_idx` index, in addition to the listed
   Better Auth tables. If either is absent, leave both route families disabled
   and resolve the target-schema rollout first.

4. Record the target, command output, and catalog check in the deployment
   change record. This gate is deliberately not satisfied by a temporary test
   database or by a local `prisma db push` run.
