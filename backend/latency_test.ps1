$ErrorActionPreference = 'Continue'
$BASE = 'https://women-safety-voice-sos.onrender.com'

function TimedGet {
    param([string]$Url, [string]$Label)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -Uri $Url -TimeoutSec 90 -UseBasicParsing
        $sw.Stop()
        Write-Host ("[1G] $Label => HTTP $($r.StatusCode) | $($r.Content.Trim()) | $($sw.ElapsedMilliseconds)ms")
    } catch {
        $sw.Stop()
        Write-Host ("[1G] $Label => ERROR: $($_.Exception.Message) | $($sw.ElapsedMilliseconds)ms")
    }
}

Write-Host "[1G] === HEALTH TIMING TEST ==="
Write-Host "[1G] CHECK 1 (immediate, may be cold):"
TimedGet "$BASE/health" "health_check1"

Write-Host "[1G] Waiting 10s..."
Start-Sleep -Seconds 10
Write-Host "[1G] CHECK 2 (+10s, should be warm):"
TimedGet "$BASE/health" "health_check2"

Write-Host "[1G] Waiting 20s..."
Start-Sleep -Seconds 20
Write-Host "[1G] CHECK 3 (+30s, still warm):"
TimedGet "$BASE/health" "health_check3"

Write-Host "[1G] === WARM ENDPOINT LATENCY (immediately after check 3) ==="
Write-Host "[1G] GET / (root, no auth):"
TimedGet "$BASE/" "root_endpoint"

Write-Host "[1G] === SUPABASE DIRECT LATENCY ==="
$SUPA_URL = 'https://zxoavlkrqktrikebegrl.supabase.co'
$SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b2F2bGtycWt0cmlrZWJlZ3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAyMjkzMiwiZXhwIjoyMDk3NTk4OTMyfQ.geRxQjPNpmMoHnIJwGQ2V9COnMv27YvXKvcqsEsj-WA'

Write-Host "[1G] Supabase REST direct query (profiles, limit 1):"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $headers = @{
        'apikey' = $SERVICE_KEY
        'Authorization' = "Bearer $SERVICE_KEY"
    }
    $r = Invoke-WebRequest -Uri "$SUPA_URL/rest/v1/profiles?select=id&limit=1" -Headers $headers -TimeoutSec 30 -UseBasicParsing
    $sw.Stop()
    Write-Host ("[1G] Supabase direct => HTTP $($r.StatusCode) | rows=$(($r.Content | ConvertFrom-Json).Count) | $($sw.ElapsedMilliseconds)ms")
} catch {
    $sw.Stop()
    Write-Host ("[1G] Supabase direct => ERROR: $($_.Exception.Message) | $($sw.ElapsedMilliseconds)ms")
}

Write-Host "[1G] Supabase REST check 2 (immediately after, verify no per-call reconnect overhead):"
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $headers2 = @{
        'apikey' = $SERVICE_KEY
        'Authorization' = "Bearer $SERVICE_KEY"
    }
    $r2 = Invoke-WebRequest -Uri "$SUPA_URL/rest/v1/profiles?select=id&limit=1" -Headers $headers2 -TimeoutSec 30 -UseBasicParsing
    $sw2.Stop()
    Write-Host ("[1G] Supabase direct2 => HTTP $($r2.StatusCode) | $($sw2.ElapsedMilliseconds)ms")
} catch {
    $sw2.Stop()
    Write-Host ("[1G] Supabase direct2 => ERROR: $($_.Exception.Message) | $($sw2.ElapsedMilliseconds)ms")
}

Write-Host "[1G] === REGION CHECK ==="
Write-Host "[1G] Render region (from render.yaml): oregon (us-west-2)"
Write-Host "[1G] Supabase project ID: zxoavlkrqktrikebegrl"
Write-Host "[1G] Checking Supabase project info via ping..."
$sw3 = [System.Diagnostics.Stopwatch]::StartNew()
try {
    $r3 = Invoke-WebRequest -Uri "$SUPA_URL/rest/v1/" -Headers @{'apikey'=$SERVICE_KEY} -TimeoutSec 30 -UseBasicParsing
    $sw3.Stop()
    Write-Host ("[1G] Supabase root => HTTP $($r3.StatusCode) | $($sw3.ElapsedMilliseconds)ms")
} catch {
    $sw3.Stop()
    Write-Host ("[1G] Supabase root => $($_.Exception.Message) | $($sw3.ElapsedMilliseconds)ms")
}

Write-Host "[1G] === DONE ==="
