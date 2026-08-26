$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$databaseFile = Join-Path $projectRoot "prisma\p05-ui-acceptance.db"
$databaseUrlPath = $databaseFile.Replace("\", "/")
$portProbe = [System.Net.Sockets.TcpClient]::new()
$portOpen = $false
try { $portProbe.Connect("127.0.0.1", 3000); $portOpen = $true } catch [System.Net.Sockets.SocketException] { } finally { $portProbe.Dispose() }
if ($portOpen) { throw "Port 3000 is already in use; stop that process before P05 UI acceptance." }

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath $databaseFile)) { New-Item -ItemType File -Path $databaseFile | Out-Null }
  # Use one absolute URL for both Prisma CLI and the Next.js runtime. Relative
  # SQLite URLs are otherwise resolved from different roots in a worktree.
  $env:DATABASE_URL = "file:$databaseUrlPath"
  $env:P05_ACCEPTANCE_FIXTURE = "1"
  & npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "Prisma migration failed" }
  Write-Host "`nP05 UI acceptance server will start at http://localhost:3000" -ForegroundColor Green
  Write-Host "In a second PowerShell window run:"
  Write-Host '$seed = Invoke-RestMethod -Method Post http://localhost:3000/api/research/acceptance/p05; $seed; "http://localhost:3000$($seed.workbenchHref)"'
  Write-Host "Open the printed workbench URL and follow outputs/v3.3-p05/UI-ACCEPTANCE.md."
  & npm run dev
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:P05_ACCEPTANCE_FIXTURE -ErrorAction SilentlyContinue
  Pop-Location
}
