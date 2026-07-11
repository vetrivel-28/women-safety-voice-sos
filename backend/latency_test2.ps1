# 5-minute gap health test + warm per-endpoint latency decomposition
$BASE = 'https://women-safety-voice-sos.onrender.com'
$SUPA_URL = 'https://zxoavlkrqktrikebegrl.supabase.co'
$SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b2F2bGtycWt0cmlrZWJlZ3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAyMjkzMiwiZXhwIjoyMDk3NTk4OTMyfQ.geRxQjPNpmMoHnIJwGQ2V9COnMv27YvXKvcqsEsj-WA'

function TimedGet {
    param([string]$Url, [string]$Label, [hashtable]$Headers = @{}, [int]$Timeout = 90)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        if ($Headers.Count -gt 0) {
            $r = Invoke-WebRequest -Uri $Url -Headers $Headers -TimeoutSec $Timeout -UseBasicParsing
        } else {
            $r = Invoke-WebRequest -Uri $Url -TimeoutSec $Timeout -UseBasicParsing
        }
        $sw.Stop()
        $ts = (Get-Date -Format 'HH:mm:ss')
        Write-Host ("[1G][$ts] $Label => HTTP $($r.StatusCode) | $($sw.ElapsedMilliseconds)ms")
        return $sw.ElapsedMilliseconds
    } catch {
        $sw.Stop()
        $ts = (Get-Date -Format 'HH:mm:ss')
        Write-Host ("[1G][$ts] $Label => ERROR: $($_.Exception.Message) | $($sw.ElapsedMilliseconds)ms")
        return -1
    }
}

Write-Host "[1G] === 5-MINUTE GAP TEST ==="
Write-Host "[1G] Check A (now warm from previous run):"
TimedGet "$BASE/health" "health_A"

Write-Host "[1G] Waiting 5 minutes (300s)..."
Start-Sleep -Seconds 300

Write-Host "[1G] Check B (+5 min):"
TimedGet "$BASE/health" "health_B_5min"

Write-Host "[1G] Check C (immediately after B, warm):"
TimedGet "$BASE/health" "health_C_immediate"

Write-Host "[1G] === WARM SUPABASE QUERY DECOMPOSITION ==="
$headers = @{
    'apikey' = $SERVICE_KEY
    'Authorization' = "Bearer $SERVICE_KEY"
}

Write-Host "[1G] Supabase SELECT profiles (1 row):"
TimedGet "$SUPA_URL/rest/v1/profiles?select=id,full_name,phone,email,blood_group,medical_notes&limit=1" "supa_profiles_1row" $headers

Write-Host "[1G] Supabase SELECT profiles (all rows - simulates GET /api/profile scan):"
TimedGet "$SUPA_URL/rest/v1/profiles?select=id&limit=100" "supa_profiles_100rows" $headers

Write-Host "[1G] Supabase SELECT guardian_links:"
TimedGet "$SUPA_URL/rest/v1/guardian_links?select=id&limit=10" "supa_guardian_links" $headers

Write-Host "[1G] Supabase SELECT safe_windows (journeys):"
TimedGet "$SUPA_URL/rest/v1/safe_windows?select=id&limit=10" "supa_safe_windows" $headers

Write-Host "[1G] === LATENCY DECOMPOSITION SUMMARY ==="
Write-Host "[1G] Render /health warm RTT: ~280-480ms (from previous run)"
Write-Host "[1G] Supabase direct REST: ~529-690ms per query"
Write-Host "[1G] Expected /api/profile total: Render(280ms) + Supabase(600ms) + FastAPI logic = ~900ms+"
Write-Host "[1G] DONE"
