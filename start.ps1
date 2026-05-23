<#
.SYNOPSIS
    Launch the pen plotter app: start the Flask backend, open the browser.

.DESCRIPTION
    Activates the project venv, runs server.py on http://127.0.0.1:5005/,
    then opens the default browser to the app. The server keeps running in
    the same window — Ctrl+C to stop.
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python   = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$Server   = Join-Path $RepoRoot "server.py"
$Url      = "http://127.0.0.1:5005/"

if (-not (Test-Path $Python)) { throw "venv not found at $Python — see README for setup." }
if (-not (Test-Path $Server)) { throw "server.py not found at $Server." }

# Open browser ~1.5s after launch so the server has time to bind.
Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 1.5
    Start-Process $u
} -ArgumentList $Url | Out-Null

Write-Host "Starting pen plotter app at $Url"
Write-Host "Ctrl+C to stop."
Write-Host ""

& $Python $Server
