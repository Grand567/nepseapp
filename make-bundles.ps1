$ProjectRoot = Get-Location
$OutDir = Join-Path $ProjectRoot "Argon_3Accounts_Bundles"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$SharedContract = @"
# SHARED DRABYASHREE NEPSE DATA CONTRACT
1. FloorsheetRow: { contractNo, symbol, buyerBroker, sellerBroker, quantity, rate, amount, tradeDate } (tradeDate: 'YYYY-MM-DD').
2. TradingWindowResult: { activeTradingDates: string[], rowsByDate: Record<string, FloorsheetRow[]>, all30DaysRows: FloorsheetRow[] } (Strictly last 30 market-open days, excluding Sat/Sun/Holidays).
3. BrokerStockAnalytics: Net holding shares, weighted avg buy/sell price, top holding broker ranking.
"@

$Files = Get-ChildItem -Path $ProjectRoot -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx | Where-Object { $_.FullName -notmatch "\\\\(node_modules|\\.git|dist|build|\\.next|android|ios|Argon_3Accounts_Bundles)\\\\" }

function Write-Bundle {
    param($Name, $RolePrompt, $FileSubset)
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine($RolePrompt)
    [void]$sb.AppendLine($SharedContract)
    [void]$sb.AppendLine("## PROJECT SOURCE FILES:")
    foreach ($f in $FileSubset) {
        $rel = $f.FullName.Substring($ProjectRoot.Path.Length + 1)
        $txt = Get-Content -Path $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($txt) {
            [void]$sb.AppendLine("")
            [void]$sb.AppendLine("### FILE: $rel")
            [void]$sb.AppendLine("```javascript")
            [void]$sb.AppendLine($txt)
            [void]$sb.AppendLine("```")
        }
    }
    $path = Join-Path $OutDir $Name
    [System.IO.File]::WriteAllText($path, $sb.ToString(), [System.Text.Encoding]::UTF8)
    Write-Host "[SUCCESS] Created: $path" -ForegroundColor Green
}

$mid = [Math]::Floor($Files.Count / 3)
$f1 = if ($Files.Count -gt 0) { $Files | Select-Object -First ($mid + 1) } else { @() }
$f2 = if ($Files.Count -gt 2) { $Files | Select-Object -Skip ($mid + 1) -First ($mid + 1) } else { $Files }
$f3 = $Files

Write-Bundle "Account1_30_MarketOpen_Days_Fetcher.md" "ROLE: Account 1 - Data Fetching and 30 Market-Open Trading Days Filter" $f1
Write-Bundle "Account2_BrokerFlow_Holdings_Engine.md" "ROLE: Account 2 - Broker Flow, Net Holdings and Avg Buy/Sell Price Engine" $f2
Write-Bundle "Account3_UI_Tabs_And_Cards_Display.md" "ROLE: Account 3 - UI Tabs, Filters and Summary Cards Display" $f3

Write-Host "`nAll 3 bundles generated successfully inside: $OutDir" -ForegroundColor Cyan
Invoke-Item $OutDir
