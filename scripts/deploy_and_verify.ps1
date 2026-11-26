<#
.SYNOPSIS
  Deploys Render backend fixes + Cloudflare Worker Edge CDN and verifies live endpoints.

.DESCRIPTION
  1. Stages curated production/playbook changes (excluding local scratch/runtime state files)
     and pushes `main` to both `origin` and `hub` remotes so Render auto-deploys.
  2. Runs `npx wrangler deploy` inside `cloudflare/`.
  3. Waits for Render deploy/cooldown (`-WaitSeconds`, default 60s).
  4. Executes `scripts/liveSessionCheck.mjs` directly against Render and via Cloudflare Workers.

.EXAMPLE
  & "C:\Users\Hp\Desktop\Software\nepse app\scripts\deploy_and_verify.ps1"
#>

param(
    [int]$WaitSeconds = 60,
    [switch]$SkipGitPush,
    [switch]$SkipWrangler,
    [string]$CommitMessage = 'fix(live,cdn): harden broker-heatmap single-flight cache, Dual-Tier playbook, and Cloudflare 429 shield'
)

$ErrorActionPreference = 'Continue'
$WorkspaceRoot = (Get-Item $PSScriptRoot).Parent.FullName
$CloudflareDir = Join-Path $WorkspaceRoot 'cloudflare'
$VerifierScript = Join-Path $WorkspaceRoot 'scripts\liveSessionCheck.mjs'
$RenderUrl = 'https://drabyashree-nepse-hub.onrender.com'
$WorkerUrl = 'https://drabyashree-nepse-cdn.shreeksuwal.workers.dev'

$DeployFiles = @(
    'cloudflare/worker.js',
    'proxy/server.mjs',
    'proxy/routes/radarRoutes.js',
    'proxy/db/ledgerStore.js',
    'proxy/utils/dualTierEngine.mjs',
    'proxy/utils/flowchartV3Engine.mjs',
    'proxy/smartAlertEngine.mjs',
    'proxy/telegramNotifier.mjs',
    'proxy/workers.mjs',
    'proxy/data/broker_matrix_latest.json',
    'src/components/Dashboard.jsx',
    'src/components/SmartAlertBanner.jsx',
    'src/components/swing/FlowchartV3Panel.tsx',
    'src/components/swing/DualTierSniperCard.tsx',
    'scripts/liveSessionCheck.mjs',
    'scripts/deploy_and_verify.ps1',
    'tests/audit/flowchart-v3.spec.ts',
    'tests/dualTierUnbiasedEngine.test.mjs',
    'tests/practicalPlaybookIntegration.test.mjs'
)

Set-Location $WorkspaceRoot
Write-Host "Workspace: $WorkspaceRoot" -ForegroundColor Cyan

if (-not $SkipGitPush) {
    Write-Host "`n[1/4] Staging curated changes and pushing to origin & hub..." -ForegroundColor Yellow
    $existingFiles = $DeployFiles | Where-Object { Test-Path (Join-Path $WorkspaceRoot $_) }
    if ($existingFiles.Count -gt 0) {
        & git add -- @existingFiles
        if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }
    }

    & git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        & git commit -m $CommitMessage
        if ($LASTEXITCODE -ne 0) { throw "git commit failed with exit code $LASTEXITCODE" }
    } else {
        Write-Host "No new staged diff to commit; pushing current HEAD..." -ForegroundColor DarkGray
    }

    & git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push origin main failed with exit code $LASTEXITCODE" }

    $remotes = & git remote
    if ($remotes -contains 'hub') {
        & git push hub main
        if ($LASTEXITCODE -ne 0) { throw "git push hub main failed with exit code $LASTEXITCODE" }
    }
} else {
    Write-Host "`n[1/4] Skipped git push (-SkipGitPush)." -ForegroundColor DarkGray
}

if (-not $SkipWrangler) {
    Write-Host "`n[2/4] Deploying Cloudflare Worker from $CloudflareDir..." -ForegroundColor Yellow
    Push-Location $CloudflareDir
    try {
        & npx wrangler deploy
        if ($LASTEXITCODE -ne 0) { throw "npx wrangler deploy failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/4] Skipped Cloudflare Worker deploy (-SkipWrangler)." -ForegroundColor DarkGray
}

if ($WaitSeconds -gt 0) {
    Write-Host "`n[3/4] Waiting ${WaitSeconds}s for Render deployment and rate-limit cooldown..." -ForegroundColor Yellow
    Start-Sleep -Seconds $WaitSeconds
}

Write-Host "`n[4/4] Verifying Render origin directly and Cloudflare Worker edge..." -ForegroundColor Yellow
& node $VerifierScript --url $RenderUrl
$renderCode = $LASTEXITCODE

& node $VerifierScript --url $WorkerUrl
$workerCode = $LASTEXITCODE

Write-Host "`nVerification exit codes -> Render: $renderCode | Worker: $workerCode" -ForegroundColor Cyan
if ($renderCode -ne 0 -or $workerCode -ne 0) {
    exit 1
}
exit 0
