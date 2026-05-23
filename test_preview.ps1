# Smoke test for /api/preview — server-backed exact toolpath.
$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$job = Start-Job -ScriptBlock {
    Set-Location $using:RepoRoot
    & .\.venv\Scripts\python.exe server.py
}
try {
    Start-Sleep -Seconds 3
    $svg = @'
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="100mm" height="100mm" viewBox="0 0 100 100">
  <g inkscape:groupmode="layer" inkscape:label="black" id="layer_1" stroke="#000" fill="none" stroke-width="0.3">
    <rect x="10" y="10" width="80" height="80"/>
    <line x1="10" y1="10" x2="90" y2="90"/>
  </g>
  <g inkscape:groupmode="layer" inkscape:label="red" id="layer_2" stroke="#f00" fill="none" stroke-width="0.3">
    <ellipse cx="50" cy="50" rx="30" ry="20"/>
  </g>
</svg>
'@
    $body = @{ svg = $svg; settings = @{ tolerance_mm = 0.1 } } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri http://127.0.0.1:5005/api/preview `
        -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
    Write-Host ""
    Write-Host "Preview response:"
    $resp | ConvertTo-Json -Depth 6
    Write-Host ""
    foreach ($l in $resp.layers) {
        Write-Host ("LAYER {0} '{1}' : {2} strokes" -f $l.id, $l.name, $l.strokes.Count)
        foreach ($s in $l.strokes) {
            Write-Host ("  stroke: {0} points, first={1},{2} last={3},{4}" -f `
                $s.Count, $s[0][0], $s[0][1], $s[-1][0], $s[-1][1])
        }
    }
} finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}
