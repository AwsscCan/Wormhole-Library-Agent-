# Web deployment

The packaged application is a Next.js standalone Node service. It is not a static site because authentication, search federation, private RAG, writing, and Living Library use server APIs.

## Before starting

1. Create a fresh database and apply every migration in `prisma/migrations` from the source repository with `npm run db:deploy`.
2. Set `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `AUTH_SECRET`, and `WRITING_CONFIG_ENCRYPTION_KEY`.
3. Use independent production secrets. Do not reuse the placeholders in `.env.example`.
4. Put the service behind HTTPS and a trusted reverse proxy before exposing it publicly.

## Start the standalone package

```bash
HOSTNAME=0.0.0.0 PORT=3000 node server.js
```

On PowerShell:

```powershell
$env:HOSTNAME = "0.0.0.0"
$env:PORT = "3000"
node server.js
```

Public search requires outbound network access. Model-backed writing and AI Living Library require a provider configured by the user. Personal university catalogues also require a lawful endpoint and any access permission issued by that institution.

Review `docs/DEPLOYMENT-GATES.md` in the source repository before a public production deployment.
