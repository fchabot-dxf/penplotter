# End-to-end test: start server, POST an SVG to /api/plot, save zip, inspect.

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

    $body = @{
        svg = $svg
        settings = @{
            pen_up_z = 8.5
            pen_down_z = -1.5
            draw_feed = 2500
            z_feed = 1200
            tolerance_mm = 0.1
        }
    } | ConvertTo-Json

    $zipPath = Join-Path $RepoRoot "out\e2e_test.zip"
    New-Item -ItemType Directory -Force -Path (Split-Path $zipPath) | Out-Null

    Invoke-WebRequest -Uri http://127.0.0.1:5005/api/plot `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -OutFile $zipPath `
        -TimeoutSec 30

    Write-Host "ZIP saved: $zipPath  ($((Get-Item $zipPath).Length) bytes)"

    $extractDir = Join-Path $RepoRoot "out\e2e_extracted"
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir

    Write-Host ""
    Write-Host "FILES:"
    Get-ChildItem $extractDir | Format-Table Name, Length -AutoSize

    foreach ($f in Get-ChildItem $extractDir -Filter *.gcode) {
        Write-Host ""
        Write-Host "----- $($f.Name) -----"
        Get-Content $f.FullName
    }
} finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}
