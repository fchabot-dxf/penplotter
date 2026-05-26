<#
.SYNOPSIS
    Deploy the pen plotter app's static frontend to Cloudflare Pages.

.DESCRIPTION
    Runs `wrangler pages deploy ./app --project-name penplotter`.
    First time you run this, wrangler creates the Pages project and gives
    you a URL like https://penplotter.pages.dev. Subsequent runs publish
    a new version.

    Requirements:
      - npm + wrangler installed (`npm install -g wrangler`)
      - `wrangler login` done once

    Note: the Pages-hosted app is the design/discovery surface. Actual
    G-code export still calls the local Flask server at 127.0.0.1:5005,
    so when you want to plot you still need `start.ps1` running on the
    machine connected to the plotter.
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Deploying $RepoRoot\app  ->  https://penplotter.pages.dev"
Write-Host ""

Push-Location $RepoRoot
try {
    npx wrangler pages deploy ./app --project-name penplotter --commit-dirty=true
}
finally {
    Pop-Location
}
