$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$targetTests = @(
  "tests/unit/exploration-recommendation.test.ts",
  "tests/unit/workbench-acceptance-fixture.test.ts",
  "tests/unit/workbench-api-e2e.test.ts",
  "tests/unit/workbench-context.test.ts",
  "tests/unit/workbench-contract.test.ts",
  "tests/unit/workbench-links.test.ts",
  "tests/unit/workbench-migration-deploy.test.ts",
  "tests/unit/workbench-ports.test.ts",
  "tests/unit/workbench-prisma-store.test.ts",
  "tests/unit/workbench-projection.test.ts",
  "tests/unit/workbench-store.test.ts"
)

function Invoke-AcceptanceStep([string]$name, [scriptblock]$command) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  & $command
  if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
}

Push-Location $projectRoot
try {
  $env:CIRCLE_NODE_TOTAL = "1"
  $env:DATABASE_URL = "file:./p05-schema-validation.db"
  Invoke-AcceptanceStep "P05 directed tests" { & npx vitest run --pool forks --poolOptions.forks.singleFork @targetTests }
  Invoke-AcceptanceStep "Reproducible four-part experiment" { & npx tsx scripts/experiment-exploration-workbench.ts }
  Invoke-AcceptanceStep "Full regression" { & npx vitest run --pool forks --poolOptions.forks.singleFork }
  Invoke-AcceptanceStep "TypeScript" { & npx tsc --noEmit }
  Invoke-AcceptanceStep "ESLint" { & npm run lint }
  Invoke-AcceptanceStep "Prisma schema" { & npx prisma validate }
  Invoke-AcceptanceStep "Production build" { & npm run build }
  Invoke-AcceptanceStep "Patch whitespace" { & git diff --check }
  Write-Host "`nP05 acceptance verification passed." -ForegroundColor Green
} finally {
  Remove-Item Env:CIRCLE_NODE_TOTAL -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Pop-Location
}
