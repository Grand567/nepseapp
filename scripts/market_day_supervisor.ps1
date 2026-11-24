<#
.SYNOPSIS
  Fault-Tolerant Serial End-to-End Market Day Supervisor for Drabyashree NEPSE.
  Date: Tuesday, Nov 24, 2026

.DESCRIPTION
  Executes serial hardening, pre-market build, Android synchronization, Playwright UI validation,
  and detached live-market monitoring through the 11:05 AM audit and 3:15 PM EOD session.
  Implements mandatory Wait-ForInternet and Wait-ForAdbDevice self-healing loops.
#>

param(
    [ValidateSet('Stage1', 'LiveMonitor', 'Full')]
    [string]$Phase = 'Stage1'
)

$ErrorActionPreference = 'Continue'
$WorkspaceRoot = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $WorkspaceRoot

$LogDir = Join-Path $WorkspaceRoot "qa\logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$ReportPath = Join-Path $LogDir "market_day_report_2026-11-24.md"

function Get-NptTime {
    return [DateTime]::UtcNow.AddHours(5).AddMinutes(45)
}

function Log-Report {
    param([string]$Message)
    $npt = (Get-NptTime).ToString("yyyy-MM-dd HH:mm:ss")
    $entry = "[$npt NPT] $Message"
    Write-Host $entry
    Add-Content -Path $ReportPath -Value $entry -Encoding utf8
}

function Ensure-LocalServers {
    try {
        $p5000 = Invoke-WebRequest -Uri "http://localhost:5000/api/ping" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    } catch {
        Log-Report "[SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs..."
        Start-Process -FilePath "node" -ArgumentList "--max-old-space-size=2048 proxy/server.mjs" -WindowStyle Hidden
        Start-Sleep -Seconds 4
    }

    try {
        $p3000 = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    } catch {
        Log-Report "[SERVER_HEAL] Port 3000 inactive. Relaunching Vite frontend..."
        Start-Process -FilePath "npx.cmd" -ArgumentList "vite", "--port", "3000", "--host" -WindowStyle Hidden
        Start-Sleep -Seconds 4
    }
}

function Wait-ForInternet {
    param([string]$Context = "General")
    while ($true) {
        Ensure-LocalServers
        $localOk = $false
        $renderOk = $false
        try {
            $resLocal = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            if ($resLocal.StatusCode -eq 200) { $localOk = $true }
        } catch {}

        try {
            $resRender = Invoke-WebRequest -Uri "https://drabyashree-nepse-hub.onrender.com/api/smart-alerts/status" -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop
            if ($resRender.StatusCode -eq 200) { $renderOk = $true }
        } catch {}

        if ($localOk -and $renderOk) {
            return $true
        }

        Log-Report "[WAITING_NET] Connectivity check paused ($Context) - Local=$localOk, Render=$renderOk. Retrying in 10s..."
        Start-Sleep -Seconds 10
    }
}

function Wait-ForAdbDevice {
    while ($true) {
        $devicesOutput = & adb devices 2>&1
        $matched = $false
        foreach ($line in ($devicesOutput -split "`r?`n")) {
            if ($line -match "^\s*([a-zA-Z0-9]+)\s+device\s*$") {
                $deviceId = $matches[1]
                Log-Report "[ADB] Authorized device ready: $deviceId"
                return $deviceId
            }
        }
        Log-Report "[WAITING_USB] Pixel 6a disconnected or unauthorized. Polling every 5s..."
        Start-Sleep -Seconds 5
    }
}

# Initialize report header if not present
if (-not (Test-Path $ReportPath)) {
    $initialHeader = @"
# Drabyashree NEPSE — Market Day Reliability & Verification Report
**Date:** Tuesday, November 24, 2026
**Environment:** Windows 10 x64, Node.js v24.19.0, Pixel 6a (Android 14)
**Session Target:** Pre-Market -> 11:00 AM Open -> 11:05 AM Audit -> 15:15 PM EOD

---

"@
    Set-Content -Path $ReportPath -Value $initialHeader -Encoding utf8
}

# ==============================================================================
# STAGE 1: PRE-MARKET BUILD, ANDROID SYNC & UI VERIFICATION
# ==============================================================================
if ($Phase -eq 'Stage1' -or $Phase -eq 'Full') {
    Log-Report "## Stage 1: Pre-Market Build, Android Sync & UI Verification"

    # Step 1: npm run build & cap sync
    Log-Report "### Step 1.1: Web Asset Build (npm run build)"
    $buildOut = & npm run build 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Log-Report "ERROR: npm run build failed!`n$buildOut"
        throw "Build failure"
    } else {
        Log-Report "SUCCESS: Vite bundle compiled cleanly into dist/."
    }

    Log-Report "### Step 1.2: Capacitor Android Sync (npx cap sync android)"
    $capSyncOut = & npx cap sync android 2>&1 | Out-String
    Log-Report "Capacitor Sync Output:`n$capSyncOut"

    # Step 2: ADB Install & Notification Channel Inspection
    Log-Report "### Step 2.1: Wait-ForAdbDevice -> Pixel 6a Connection"
    $devId = Wait-ForAdbDevice

    Log-Report "### Step 2.2: Building & Installing Debug APK to Pixel 6a"
    $gradleOut = & .\android\gradlew.bat -p android installDebug 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Log-Report "WARNING: Gradle installDebug reported non-zero code. Output:`n$gradleOut"
    } else {
        Log-Report "SUCCESS: Debug APK installed cleanly to Pixel 6a ($devId)."
    }

    Log-Report "### Step 2.3: Launching App on Pixel 6a"
    $monkeyOut = & adb shell monkey -p com.smartwealth.nepse -c android.intent.category.LAUNCHER 1 2>&1 | Out-String
    Log-Report "Monkey Launch: $monkeyOut"
    Start-Sleep -Seconds 5

    Log-Report "### Step 2.4: Verifying Android Notification Channels"
    $dumpsys = & adb shell dumpsys notification 2>&1 | Out-String
    $hasProSignals = $dumpsys -match "dravyashree-pro-signals"
    $hasGeneralNews = $dumpsys -match "nepse-general-news"
    Log-Report "Notification Channel 'dravyashree-pro-signals' present: $hasProSignals"
    Log-Report "Notification Channel 'nepse-general-news' present: $hasGeneralNews"

    # Step 3: Render API Health & Push Token Registration
    Log-Report "### Step 3.1: Wait-ForInternet -> Verifying Render Cloud Proxy"
    Wait-ForInternet -Context "Render Cloud Verification"

    Log-Report "### Step 3.2: Verifying /register and /login Endpoints"
    try {
        $regBody = @{ app = "nepse"; email = "probe_test_audit@drabyashree.com"; passwordHash = "probe_hash_value" } | ConvertTo-Json
        $regRes = Invoke-WebRequest -Uri "https://drabyashree-nepse-hub.onrender.com/api/sync/register" -Method POST -Body $regBody -ContentType "application/json" -TimeoutSec 30 -UseBasicParsing -ErrorAction SilentlyContinue
        Log-Report "Probe Register Status: $($regRes.StatusCode)"
    } catch {
        Log-Report "Probe Register Notice (Expected status 400/409): $($_.Exception.Message)"
    }

    Log-Report "### Step 3.3: Verifying /api/smart-alerts/status"
    $tokenRetry = 0
    $maxTokenRetries = 6
    $statusData = $null

    while ($tokenRetry -lt $maxTokenRetries) {
        try {
            $statusRes = Invoke-RestMethod -Uri "https://drabyashree-nepse-hub.onrender.com/api/smart-alerts/status" -TimeoutSec 25
            $statusData = $statusRes.data
            Log-Report "FCM Status: isFcmInitialized=$($statusData.isFcmInitialized), hasValidFcmPrivateKey=$($statusData.hasValidFcmPrivateKey), registeredPushTokensCount=$($statusData.registeredPushTokensCount), session=$($statusData.marketSession)"
            
            if ($statusData.registeredPushTokensCount -ge 1) {
                break
            }
        } catch {
            Log-Report "Status fetch notice: $($_.Exception.Message)"
        }

        $tokenRetry++
        Log-Report "Tokens count is 0. Re-triggering app launch on Pixel 6a (Attempt $tokenRetry of $maxTokenRetries)..."
        & adb shell monkey -p com.smartwealth.nepse -c android.intent.category.LAUNCHER 1 | Out-Null
        Start-Sleep -Seconds 8
    }

    # Step 4: Playwright Pre-Market UI Verification
    Log-Report "### Step 4.1: Playwright Pre-Market Verification on http://localhost:3000"
    Wait-ForInternet -Context "Playwright Stage 1"
    $pwOut = & npx playwright test tests/audit/stage1_premarket.spec.ts 2>&1 | Out-String
    Log-Report "Playwright Stage 1 Output:`n$pwOut"

    if (Test-Path "audit-reports/stage1_ui_audit.json") {
        $stage1Json = Get-Content "audit-reports/stage1_ui_audit.json" -Raw
        Log-Report "Stage 1 Audit JSON Result:`n$stage1Json"
    }

    Log-Report "--- Stage 1 Verification Complete ---`n"
}

# ==============================================================================
# STAGE 2: BACKGROUND KEEP-ALIVE + SCHEDULED 11:05 AM NPT LIVE AUDIT
# ==============================================================================
if ($Phase -eq 'LiveMonitor' -or $Phase -eq 'Full') {
    Log-Report "## Stage 2: Background Keep-Alive & Live Market Monitor Started"

    $hasExecutedLiveAudit = $false

    while ($true) {
        $nowNpt = Get-NptTime
        $hour = $nowNpt.Hour
        $minute = $nowNpt.Minute
        $totalMinutes = ($hour * 60) + $minute

        # 1. Ping Render keep-alive every 10 min
        Wait-ForInternet -Context "KeepAlive Ping"
        try {
            $pingRes = Invoke-RestMethod -Uri "https://drabyashree-nepse-hub.onrender.com/api/smart-alerts/status" -TimeoutSec 30
            $d = $pingRes.data
            Log-Report "[KEEP_ALIVE] Render Ping: session=$($d.marketSession), tokens=$($d.registeredPushTokensCount), activeAlerts=$($d.activeAlertsToday), totalHistory=$($d.totalHistoryCount)"
        } catch {
            Log-Report "[KEEP_ALIVE_NOTICE] Render Ping error: $($_.Exception.Message)"
        }

        # 2. Check if reached 11:05 AM NPT (totalMinutes >= 665)
        if (-not $hasExecutedLiveAudit -and $totalMinutes -ge 665) {
            Log-Report "### Executing 11:05 AM NPT Live Market Audit"
            $hasExecutedLiveAudit = $true

            # Parity test
            Log-Report "Running npm run test:parity..."
            $parityOut = & npm run test:parity 2>&1 | Out-String
            Log-Report "Data Parity Summary:`n$parityOut"

            # Playwright Live Market Audit
            Log-Report "Running Playwright Live Market Audit..."
            $liveAuditOut = & npx playwright test tests/audit/stage2_live_audit.spec.ts 2>&1 | Out-String
            Log-Report "Playwright Live Market Output:`n$liveAuditOut"

            # Android Status Bar Check
            Log-Report "Inspecting Android Notification Bar on Pixel 6a..."
            try {
                $liveDumpsys = & adb shell dumpsys notification 2>&1 | Out-String
                $proCount = ($liveDumpsys | Select-String "dravyashree-pro-signals" -AllMatches).Matches.Count
                $genCount = ($liveDumpsys | Select-String "nepse-general-news" -AllMatches).Matches.Count
                Log-Report "Pixel 6a Active Alerts: ProSignalsRefs=$proCount, GeneralNewsRefs=$genCount"
            } catch {
                Log-Report "ADB inspection notice: $($_.Exception.Message)"
            }
        }

        # 3. Check for Post-Market 3:15 PM NPT (totalMinutes >= 915)
        if ($totalMinutes -ge 915) {
            Log-Report "### 15:15 PM NPT — NEPSE Session Closed. Verifying Post-Market State..."
            try {
                $eodRes = Invoke-RestMethod -Uri "https://drabyashree-nepse-hub.onrender.com/api/smart-alerts/status" -TimeoutSec 30
                Log-Report "EOD Final Status: session=$($eodRes.data.marketSession), totalAlertsToday=$($eodRes.data.activeAlertsToday)"
            } catch {}
            Log-Report "## Market Day Supervisor EOD Verification Finished Successfully."
            break
        }

        Start-Sleep -Seconds 600
    }
}
