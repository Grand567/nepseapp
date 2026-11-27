param(
  [string]$SessionDate = "",
  [switch]$DeployWorker,
  [switch]$SkipLiveCheck,
  [string]$CdnUrl = "https://drabyashree-nepse-cdn.shreeksuwal.workers.dev"
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param([string]$Title, [scriptblock]$Action)
  Write-Host "`n======================================================================" -ForegroundColor Cyan
  Write-Host "  STEP: $Title" -ForegroundColor Cyan
  Write-Host "======================================================================" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed ($LASTEXITCODE): $Title"
  }
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

# 1. Sync today's NEPSE floorsheet, matrices, vaults, 5-day ledger, sub-files & tick stream
Invoke-Step "Sync NEPSE floorsheet & sub-files" {
  if ($SessionDate -match '^\d{4}-\d{2}-\d{2}$') {
    node scripts/syncTodayFloorsheet.mjs $SessionDate
  } else {
    node scripts/syncTodayFloorsheet.mjs
  }
}

# 2. Verify regression tests & semantic invariants before packing/pushing
Invoke-Step "Run regression tests & semantic invariant audit" {
  node --test tests/todayDataSubfiles.test.mjs tests/floorsheetLiveTickAudit.test.mjs
  if ($LASTEXITCODE -ne 0) { return }
  npm run audit:semantic
}

# 3. Pack SQLite ledger snapshot & stream-upload to Cloudflare R2
Invoke-Step "Pack SQLite ledger snapshot & upload to Cloudflare R2" {
  node scripts/pack_ledger_gz.mjs
}

# 4. Stage, commit (if changed), and push to origin main
Invoke-Step "Stage, commit & push to origin main" {
  git add -u
  git add `
    .github/workflows/eod_sync.yml `
    proxy/data/broker_matrix_latest.json `
    proxy/data/broker_alltime `
    proxy/data/broker_vault `
    proxy/data/daily_floorsheets/archive_index.json `
    proxy/data/historical_4days_ledger.json `
    proxy/data/historical_4days_ledger.json.gz `
    proxy/data/historical_5days_ledger.json `
    proxy/data/historical_5days_ledger.json.gz `
    proxy/data/subfiles `
    proxy/data/today_static_analytics.json `
    proxy/data/today_static_analytics.json.gz `
    proxy/data/today_tick_by_tick.json `
    proxy/data/today_tick_by_tick.json.gz `
    public/data `
    src/data/broker_matrix_latest.json `
    src/data/broker_matrices_historical.json `
    src/data/nepse_cumulative_broker_ledger.json `
    src/data/broker_holdings_alltime.json

  $dbGz = Join-Path $RepoRoot "proxy\data\drabyashree_ledger.db.gz"
  if (Test-Path $dbGz) {
    $sizeBytes = (Get-Item $dbGz).Length
    if ($sizeBytes -lt 100000000) {
      git add proxy/data/drabyashree_ledger.db.gz
    } else {
      Write-Host "  [INFO] drabyashree_ledger.db.gz >= 100MB ($sizeBytes bytes); relying on Cloudflare R2 bootstrap." -ForegroundColor Yellow
      git reset -- proxy/data/drabyashree_ledger.db.gz 2>$null
    }
  }

  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    $labelDate = if ($SessionDate) { $SessionDate } else { (Get-Date).ToString("yyyy-MM-dd") }
    git commit -m "chore(sync): serial EOD sync, verification & R2 snapshot ($labelDate)"
    if ($LASTEXITCODE -ne 0) { return }
    git pull --rebase origin main
    if ($LASTEXITCODE -ne 0) { return }
    git push origin main
  } else {
    Write-Host "  [INFO] Working tree clean — nothing new to commit." -ForegroundColor Green
    $global:LASTEXITCODE = 0
  }
}

# 5. Optional: Deploy Cloudflare Worker CDN + Cron Trigger
if ($DeployWorker) {
  Invoke-Step "Deploy Cloudflare Worker (drabyashree-nepse-cdn)" {
    Push-Location (Join-Path $RepoRoot "cloudflare")
    try {
      npx --yes wrangler deploy
    } finally {
      Pop-Location
    }
  }
}

# 6. Verify live Cloudflare CDN + Render session health
if (-not $SkipLiveCheck) {
  Invoke-Step "Verify live CDN & Render session health" {
    node scripts/liveSessionCheck.mjs --url $CdnUrl
  }
}

Write-Host "`n✅ All serial steps completed successfully!" -ForegroundColor Green
