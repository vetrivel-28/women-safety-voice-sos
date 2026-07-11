# Continuous /health poller - hits every 1.5s for 3 minutes (120 samples)
# Outputs timestamp + latency so we can overlay against escalation worker 10s cycle
$BASE = 'https://women-safety-voice-sos.onrender.com'
$samples = 120        # 120 samples x 1.5s = ~3 minutes
$interval = 1500      # ms between requests

Write-Host "[CORRELATE] Starting /health poll: $samples samples, every ${interval}ms"
Write-Host "[CORRELATE] Escalation worker fires every 10s. Watch for latency spikes bunched ~10s apart."
Write-Host "[CORRELATE] Format: [HH:mm:ss.fff] seq=N latency=Xms status=Y"
Write-Host "---"

for ($i = 1; $i -le $samples; $i++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $ts = (Get-Date -Format 'HH:mm:ss.fff')
    try {
        $r = Invoke-WebRequest -Uri "$BASE/health" -TimeoutSec 30 -UseBasicParsing
        $sw.Stop()
        $latency = $sw.ElapsedMilliseconds
        $flag = if ($latency -gt 500) { " <<=== SPIKE" } elseif ($latency -gt 350) { " << elevated" } else { "" }
        Write-Host ("[$ts] seq=$i latency=${latency}ms status=$($r.StatusCode)$flag")
    } catch {
        $sw.Stop()
        Write-Host ("[$ts] seq=$i latency=$($sw.ElapsedMilliseconds)ms ERROR: $($_.Exception.Message)")
    }
    # Sleep for remaining interval time (subtract request time to keep cadence steady)
    $elapsed = $sw.ElapsedMilliseconds
    $sleepMs = [Math]::Max(0, $interval - $elapsed)
    if ($sleepMs -gt 0) { Start-Sleep -Milliseconds $sleepMs }
}

Write-Host "---"
Write-Host "[CORRELATE] Done. Analyze spikes: if escalation worker (10s cycle) is the cause,"
Write-Host "[CORRELATE] spikes should appear at ~10s intervals (seq numbers ~7 apart at 1.5s cadence)."
